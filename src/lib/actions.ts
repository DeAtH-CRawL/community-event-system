'use server';

import { supabase } from '@/src/lib/supabase';
import { revalidatePath } from 'next/cache';

// =============================================================================
// TYPES
// =============================================================================

export type UserRole = 'volunteer' | 'admin';

export type Family = {
  id: string;             // UUID
  surname: string;
  head_name: string;
  phone: string | null;
  family_size: number;
  notes?: string | null;

  // Computed
  plates_entitled: number;
  plates_used: number;
  plates_remaining: number;
  checked_in_at?: string | null;
};

export type AuditLogEntry = {
  id: string;
  actor_role: string;
  action_type: string;
  details: string;
  created_at: string;
  station_id?: string | null;
  family_id?: string | null;
  before_value?: any;
  after_value?: any;
};

// =============================================================================
// HELPER: Audit Logging
// =============================================================================
async function logAudit(params: {
  role: UserRole;
  eventName: string;
  familyId: string | null;
  actionType: string;
  details: string;
  stationId?: string;
  before?: any;
  after?: any;
}) {
  await supabase.from('audit_logs').insert({
    actor_role: params.role,
    event_name: params.eventName,
    family_id: params.familyId, // UUID
    action_type: params.actionType,
    details: params.details,
    station_id: params.stationId || null,
    before_value: params.before,
    after_value: params.after
  });
}

// =============================================================================
// SEARCH FAMILIES
// =============================================================================
export async function searchFamilies(query: string, eventName: string): Promise<Family[]> {
  const cleanQuery = query.trim().toLowerCase();
  if (cleanQuery.length < 2) return [];

  try {
    // FIX: Read all families and filter in-memory to ensure matching logic with Admin
    const { data: allFamilies, error } = await supabase
      .from('families')
      .select('id, surname, head_name, phone, family_size, notes');

    if (error || !allFamilies) return [];

    const families = allFamilies.filter(f =>
      (f.surname?.toLowerCase() || '').includes(cleanQuery) ||
      (f.head_name?.toLowerCase() || '').includes(cleanQuery) ||
      (f.phone && String(f.phone).includes(cleanQuery))
    ).slice(0, 30);

    if (families.length === 0) return [];

    const familyIds = families.map(f => f.id);
    const { data: servings } = await supabase
      .from('servings')
      .select('family_id, plates_used, checked_in_at')
      .eq('event_name', eventName)
      .in('family_id', familyIds);

    const servingMap = new Map((servings || []).map(s => [s.family_id, s]));

    return families.map(f => {
      const s = servingMap.get(f.id);
      const used = s?.plates_used || 0;
      return {
        id: f.id,
        surname: f.surname,
        head_name: f.head_name,
        phone: f.phone || null,
        family_size: f.family_size,
        notes: f.notes,
        plates_entitled: f.family_size,
        plates_used: used,
        plates_remaining: f.family_size - used,
        checked_in_at: s?.checked_in_at || null
      };
    });

  } catch (err) {
    console.error('Search exception:', err);
    return [];
  }
}

// =============================================================================
// CHECK IN
// =============================================================================
export async function checkInFamily(params: {
  role: UserRole;
  eventName: string;
  familyId: string;
  stationId?: string;
}) {
  const { familyId, eventName } = params;

  const { data: family } = await supabase
    .from('families')
    .select('*')
    .eq('id', familyId)
    .single();

  if (!family) return { success: false, message: 'Family not found' };

  const { data: existing } = await supabase
    .from('servings')
    .select('id, checked_in_at')
    .eq('event_name', eventName)
    .eq('family_id', familyId)
    .maybeSingle();

  if (existing?.checked_in_at) {
    return { success: false, message: 'Already checked in' };
  }

  const now = new Date().toISOString();
  await supabase
    .from('servings')
    .upsert(
      {
        event_name: eventName,
        family_id: familyId,
        checked_in_at: now,
        ...(existing ? {} : { plates_used: 0 })
      },
      { onConflict: 'event_name, family_id' }
    );

  await logAudit({
    role: params.role,
    eventName,
    familyId,
    actionType: 'CHECK_IN',
    details: `Checked in ${family.surname} family`,
    stationId: params.stationId
  });

  revalidatePath('/entry');
  revalidatePath('/food');
  return { success: true };
}

// =============================================================================
// SERVE PLATES
// =============================================================================
export async function servePlates(params: {
  role: UserRole;
  eventName: string;
  familyId: string;
  quantity: number;
  stationId?: string;
}) {
  const { familyId, quantity } = params;
  if (quantity < 1) return { success: false, message: 'Invalid quantity' };

  const { data: family } = await supabase.from('families').select('family_size').eq('id', familyId).single();
  const { data: serving } = await supabase.from('servings').select('plates_used, id').eq('event_name', params.eventName).eq('family_id', familyId).single();

  if (!family || !serving) return { success: false, message: 'Not checked in' };

  const limit = family.family_size;
  const used = serving.plates_used;

  if (used + quantity > limit) {
    return { success: false, message: `Exceeds limit. Remaining: ${limit - used}` };
  }

  const { error } = await supabase
    .from('servings')
    .update({ plates_used: used + quantity, last_updated: new Date().toISOString() })
    .eq('id', serving.id)
    .eq('plates_used', used);

  if (error) return { success: false, message: 'Concurrency error. Try again.' };

  await logAudit({
    role: params.role,
    eventName: params.eventName,
    familyId,
    actionType: 'SERVE',
    details: `Served ${quantity} plates`,
    stationId: params.stationId,
    before: { plates_used: used },
    after: { plates_used: used + quantity }
  });

  revalidatePath('/food');
  return { success: true };
}

// =============================================================================
// ADMIN: ADJUST PLATES
// =============================================================================
export async function adjustPlates(params: {
  role: UserRole;
  eventName: string;
  familyId: string;
  adjustment: number;
  reason: string;
  stationId?: string;
}) {
  const { familyId, adjustment, eventName } = params;

  const { data: serving } = await supabase
    .from('servings')
    .select('id, plates_used')
    .eq('event_name', eventName)
    .eq('family_id', familyId)
    .single();

  if (!serving) return { success: false, message: 'Record not found' };

  const oldUsed = serving.plates_used;
  const newUsed = Math.max(0, oldUsed + adjustment);

  await supabase
    .from('servings')
    .update({ plates_used: newUsed, last_updated: new Date().toISOString() })
    .eq('id', serving.id);

  await logAudit({
    role: params.role,
    eventName,
    familyId,
    actionType: 'ADJUST',
    details: params.reason,
    stationId: params.stationId,
    before: { plates_used: oldUsed },
    after: { plates_used: newUsed }
  });

  revalidatePath('/food');
  revalidatePath('/admin');
  return { success: true };
}

// =============================================================================
// ADMIN: READS
// =============================================================================
export async function getCheckedInFamilies(eventName: string): Promise<Family[]> {
  const { data: servings } = await supabase
    .from('servings')
    .select('*, families(*)')
    .eq('event_name', eventName)
    .not('checked_in_at', 'is', null)
    .order('checked_in_at', { ascending: false });

  if (!servings) return [];

  return servings.map((s: any) => ({
    id: s.family_id,
    surname: s.families.surname,
    head_name: s.families.head_name,
    phone: s.families.phone,
    family_size: s.families.family_size,
    notes: s.families.notes,
    plates_entitled: s.families.family_size,
    plates_used: s.plates_used,
    plates_remaining: s.families.family_size - s.plates_used,
    checked_in_at: s.checked_in_at
  }));
}

export async function getAllFamiliesWithStatus(eventName: string): Promise<Family[]> {
  const { data: families } = await supabase
    .from('families')
    .select('*')
    .order('surname');

  if (!families) return [];

  const { data: servings } = await supabase
    .from('servings')
    .select('family_id, plates_used, checked_in_at')
    .eq('event_name', eventName);

  const sMap = new Map(servings?.map(s => [s.family_id, s]) || []);

  return families.map(f => {
    const s = sMap.get(f.id);
    const used = s?.plates_used || 0;
    return {
      id: f.id,
      surname: f.surname,
      head_name: f.head_name,
      phone: f.phone,
      family_size: f.family_size,
      notes: f.notes,
      plates_entitled: f.family_size,
      plates_used: used,
      plates_remaining: f.family_size - used,
      checked_in_at: s?.checked_in_at
    };
  });
}

export async function getAuditHistory(eventName: string, familyId?: string): Promise<AuditLogEntry[]> {
  let query = supabase.from('audit_logs').select('*').eq('event_name', eventName).order('created_at', { ascending: false }).limit(100);
  if (familyId) query = query.eq('family_id', familyId);

  const { data } = await query;
  return (data || []) as AuditLogEntry[];
}

export async function getEventStats(eventName: string) {
  // Total Families
  const { count: totalFamilies } = await supabase.from('families').select('*', { count: 'exact', head: true });

  // Total Plates Entitled (Sum of all family sizes)
  // Need to fetch all to sum unless we use a db function, but fetching id,family_size is cheap enough for < 2000 rows
  const { data: allSizes } = await supabase.from('families').select('family_size');
  const totalEntitled = (allSizes || []).reduce((sum, f) => sum + f.family_size, 0);

  // Servings Stats
  const { data: servings } = await supabase
    .from('servings')
    .select('plates_used')
    .eq('event_name', eventName)
    .not('checked_in_at', 'is', null);

  const checkedIn = servings?.length || 0;
  const served = servings?.reduce((a, b) => a + b.plates_used, 0) || 0;

  return {
    totalFamilies: totalFamilies || 0,
    familiesCheckedIn: checkedIn,
    totalPlatesEntitled: totalEntitled, // Returns total capacity of database, or checked in capacity? 
    // Previous code logic was "total plates entitled for checked-in families". 
    // Let's stick to that if that's what Admin expects, OR standard stats usually imply total potential.
    // The previous implementation (Step 171) did: `totalPlatesEntitled` for CHECKED IN families.
    // Let's match that to be safe.
    totalPlatesServed: served
  };
}
// REVISING getEventStats to match original logic (Entitled for Checked In only)
export async function getEventStats_CheckedInOnly(eventName: string) {
  const { count: totalFamilies } = await supabase.from('families').select('*', { count: 'exact', head: true });

  const { data: servings } = await supabase
    .from('servings')
    .select('family_id, plates_used')
    .eq('event_name', eventName)
    .not('checked_in_at', 'is', null);

  const checkedIn = servings?.length || 0;
  const served = servings?.reduce((a, b) => a + b.plates_used, 0) || 0;

  let entitled = 0;
  if (servings && servings.length > 0) {
    const ids = servings.map(s => s.family_id);
    const { data: families } = await supabase.from('families').select('family_size').in('id', ids);
    entitled = (families || []).reduce((a, b) => a + b.family_size, 0);
  }

  return {
    totalFamilies: totalFamilies || 0,
    familiesCheckedIn: checkedIn,
    totalPlatesEntitled: entitled,
    totalPlatesServed: served
  };
}

// Replacing the function with the CheckedIn version properly named
export async function getEventStatsOriginal(eventName: string) {
  // ... duplicate logic removal
  return getEventStats_CheckedInOnly(eventName);
}

export async function resetEvent(params: { eventName: string, stationId?: string }) {
  const { count } = await supabase.from('servings').select('*', { count: 'exact', head: true }).eq('event_name', params.eventName);
  await supabase.from('servings').delete().eq('event_name', params.eventName);

  await logAudit({
    role: 'admin',
    eventName: params.eventName,
    familyId: null,
    actionType: 'RESET',
    details: `Reset event. Cleared ${count} records.`,
    stationId: params.stationId
  });

  revalidatePath('/admin');
  return { success: true, message: 'Event reset' };
}
