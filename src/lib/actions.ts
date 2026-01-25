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
  guests: number;         // Additional guests
  plates_entitled: number; // family_size + guests
  plates_used: number;
  plates_remaining: number; // plates_entitled - plates_used
  checked_in_at?: string | null;
};

export type ActionResult<T = any> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string; // For backward compatibility if needed, but error is preferred
};

export type AuditLogEntry = {
  id: string;
  actor_role: string;
  event_name: string;
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
  try {
    await supabase.from('audit_logs').insert({
      actor_role: params.role,
      event_name: params.eventName,
      family_id: params.familyId,
      action_type: params.actionType,
      details: params.details,
      station_id: params.stationId || null,
      before_value: params.before,
      after_value: params.after
    });
  } catch (err) {
    console.error('[AuditLog] Failed to log:', err);
  }
}

// =============================================================================
// SEARCH FAMILIES
// =============================================================================
export async function searchFamilies(query: string, eventName: string): Promise<Family[]> {
  const cleanQuery = query.trim().toLowerCase();

  if (cleanQuery.length < 2) return [];

  try {
    const { data: allFamilies, error } = await supabase
      .from('families')
      .select('id, surname, head_name, phone, family_size');

    if (error) {
      console.error('[Search] Supabase Error:', error);
      return [];
    }

    const families = allFamilies.filter(f =>
      (f.surname?.toLowerCase() || '').includes(cleanQuery) ||
      (f.head_name?.toLowerCase() || '').includes(cleanQuery) ||
      (f.phone && String(f.phone).includes(cleanQuery))
    ).slice(0, 30);

    if (families.length === 0) return [];

    const familyIds = families.map(f => f.id);
    const { data: servings } = await supabase
      .from('servings')
      .select('family_id, plates_used, guests, checked_in_at')
      .eq('event_name', eventName)
      .in('family_id', familyIds);

    const servingMap = new Map((servings || []).map(s => [s.family_id, s]));

    return families.map(f => {
      const s = servingMap.get(f.id);
      const used = s?.plates_used || 0;
      const guests = s?.guests || 0;
      const totalEntitled = f.family_size + guests;

      return {
        id: f.id,
        surname: f.surname,
        head_name: f.head_name,
        phone: f.phone || null,
        family_size: f.family_size,
        notes: null,
        guests: guests,
        plates_entitled: totalEntitled,
        plates_used: used,
        plates_remaining: Math.max(0, totalEntitled - used),
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
  guests: number;
  stationId?: string;
}): Promise<ActionResult> {
  const { familyId, eventName, guests } = params;

  try {
    const { data: family, error: fetchError } = await supabase
      .from('families')
      .select('id, surname')
      .eq('id', familyId)
      .single();

    if (fetchError || !family) {
      return { success: false, error: 'Family not found.' };
    }

    const { data: existing, error: existingError } = await supabase
      .from('servings')
      .select('checked_in_at')
      .eq('event_name', eventName)
      .eq('family_id', familyId)
      .maybeSingle();

    if (existing?.checked_in_at) {
      return { success: false, error: 'Family already checked in.' };
    }

    const now = new Date().toISOString();

    const { error: upsertError } = await supabase
      .from('servings')
      .upsert(
        {
          event_name: eventName,
          family_id: familyId,
          checked_in_at: now,
          guests: guests,
          plates_used: existing ? undefined : 0,
        },
        { onConflict: 'event_name, family_id' }
      );

    if (upsertError) {
      console.error('[CheckIn] Upsert Error:', upsertError);
      return { success: false, error: 'Database update failed.' };
    }

    await logAudit({
      role: params.role,
      eventName,
      familyId,
      actionType: 'CHECK_IN',
      details: `Checked in ${family.surname} family with ${guests} guests`,
      stationId: params.stationId
    });

    revalidatePath('/entry');
    revalidatePath('/food');
    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    console.error('[CheckIn] Fatal Error:', err);
    return { success: false, error: 'An unexpected error occurred.' };
  }
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
}): Promise<ActionResult> {
  const { familyId, quantity, eventName } = params;
  if (quantity < 1) return { success: false, error: 'Invalid quantity.' };

  try {
    const [familyResult, servingResult] = await Promise.all([
      supabase.from('families').select('family_size').eq('id', familyId).single(),
      supabase.from('servings').select('plates_used, guests, id').eq('event_name', eventName).eq('family_id', familyId).single()
    ]);

    if (familyResult.error || servingResult.error || !familyResult.data || !servingResult.data) {
      return { success: false, error: 'Check-in record not found.' };
    }

    const family = familyResult.data;
    const serving = servingResult.data;

    const limit = (family.family_size || 0) + (serving.guests || 0);
    const used = serving.plates_used || 0;

    if (used + quantity > limit) {
      return { success: false, error: `Exceeds limit. Remaining: ${limit - used}` };
    }

    const { error } = await supabase
      .from('servings')
      .update({
        plates_used: used + quantity,
        last_updated: new Date().toISOString()
      })
      .eq('id', serving.id)
      .eq('plates_used', used); // Optimistic lock

    if (error) {
      return { success: false, error: 'Plate update failed. Someone else may have updated this record.' };
    }

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
    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    console.error('[Serve] Fatal Error:', err);
    return { success: false, error: 'An unexpected error occurred during serving.' };
  }
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
}): Promise<ActionResult> {
  const { familyId, adjustment, eventName } = params;

  try {
    const { data: serving, error: fetchError } = await supabase
      .from('servings')
      .select('id, plates_used')
      .eq('event_name', eventName)
      .eq('family_id', familyId)
      .single();

    if (fetchError || !serving) {
      return { success: false, error: 'Record not found.' };
    }

    const oldUsed = serving.plates_used || 0;
    const newUsed = Math.max(0, oldUsed + adjustment);

    const { error: updateError } = await supabase
      .from('servings')
      .update({ plates_used: newUsed, last_updated: new Date().toISOString() })
      .eq('id', serving.id);

    if (updateError) {
      return { success: false, error: 'Failed to update record.' };
    }

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
  } catch (err) {
    console.error('[Adjust] Fatal Error:', err);
    return { success: false, error: 'An unexpected error occurred.' };
  }
}

export async function updateGuestCount(params: {
  role: UserRole;
  eventName: string;
  familyId: string;
  guests: number;
  stationId?: string;
}): Promise<ActionResult> {
  const { familyId, guests, eventName } = params;

  try {
    const { data: serving, error: fetchError } = await supabase
      .from('servings')
      .select('id, guests')
      .eq('event_name', eventName)
      .eq('family_id', familyId)
      .single();

    if (fetchError || !serving) {
      return { success: false, error: 'Record not found.' };
    }

    const oldGuests = serving.guests || 0;

    const { error: updateError } = await supabase
      .from('servings')
      .update({ guests: guests, last_updated: new Date().toISOString() })
      .eq('id', serving.id);

    if (updateError) {
      return { success: false, error: 'Failed to update guests.' };
    }

    await logAudit({
      role: params.role,
      eventName,
      familyId,
      actionType: 'UPDATE_GUESTS',
      details: `Updated guests from ${oldGuests} to ${guests}`,
      stationId: params.stationId,
      before: { guests: oldGuests },
      after: { guests: guests }
    });

    revalidatePath('/entry');
    revalidatePath('/food');
    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    console.error('[UpdateGuests] Fatal Error:', err);
    return { success: false, error: 'An unexpected error occurred.' };
  }
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

  return servings.map((s: any) => {
    const guests = s.guests || 0;
    const totalEntitled = s.families.family_size + guests;
    return {
      id: s.family_id,
      surname: s.families.surname,
      head_name: s.families.head_name,
      phone: s.families.phone,
      family_size: s.families.family_size,
      notes: s.families.notes,
      guests: guests,
      plates_entitled: totalEntitled,
      plates_used: s.plates_used,
      plates_remaining: Math.max(0, totalEntitled - s.plates_used),
      checked_in_at: s.checked_in_at
    };
  });
}

export async function getAllFamiliesWithStatus(eventName: string): Promise<Family[]> {
  const { data: families } = await supabase
    .from('families')
    .select('*')
    .order('surname');

  if (!families) return [];

  const { data: servings } = await supabase
    .from('servings')
    .select('family_id, plates_used, checked_in_at, guests')
    .eq('event_name', eventName);

  const sMap = new Map(servings?.map(s => [s.family_id, s]) || []);

  return families.map(f => {
    const s = sMap.get(f.id);
    const used = s?.plates_used || 0;
    const guests = s?.guests || 0;
    const totalEntitled = f.family_size + guests;

    return {
      id: f.id,
      surname: f.surname,
      head_name: f.head_name,
      phone: f.phone,
      family_size: f.family_size,
      notes: f.notes,
      guests: guests,
      plates_entitled: totalEntitled,
      plates_used: used,
      plates_remaining: Math.max(0, totalEntitled - used),
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
  const { count: totalFamilies } = await supabase.from('families').select('*', { count: 'exact', head: true });

  const { data: servings } = await supabase
    .from('servings')
    .select('family_id, plates_used, guests')
    .eq('event_name', eventName)
    .not('checked_in_at', 'is', null);

  const checkedIn = servings?.length || 0;
  const served = servings?.reduce((a, b) => a + b.plates_used, 0) || 0;

  // Entitled for checked-in families only (Standard for this app)
  let entitled = 0;
  if (servings && servings.length > 0) {
    const ids = servings.map(s => s.family_id);
    const { data: families } = await supabase.from('families').select('id, family_size').in('id', ids);
    const familyMap = new Map((families || []).map(f => [f.id, f.family_size]));

    entitled = servings.reduce((sum, s) => {
      const fSize = familyMap.get(s.family_id) || 0;
      return sum + fSize + (s.guests || 0); // Include guests
    }, 0);
  }

  return {
    totalFamilies: totalFamilies || 0,
    familiesCheckedIn: checkedIn,
    totalPlatesEntitled: entitled,
    totalPlatesServed: served
  };
}

export async function getDistinctEventNames(): Promise<string[]> {
  const { data, error } = await supabase
    .from('servings')
    .select('event_name')
    .limit(1);

  if (error || !data || data.length === 0) {
    return ["Live Session"]; // Robust fallback string
  }

  return [data[0].event_name];
}

/**
 * Returns the single active event name. 
 * Source of truth is the first event name found in servings, otherwise fallback.
 */
export async function getActiveEventName(): Promise<string> {
  const names = await getDistinctEventNames();
  return names[0];
}

export async function getEventSummaries(): Promise<AuditLogEntry[]> {
  const { data } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('action_type', 'EVENT_SUMMARY_SNAPSHOT')
    .order('created_at', { ascending: false });

  return (data || []) as AuditLogEntry[];
}

export async function getLastSync(eventName: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('created_at')
      .eq('action_type', 'SYNC')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return data.created_at;
  } catch (err) {
    return null;
  }
}

/**
 * Perform a GLOBAL reset of all runtime event data.
 * Captures a snapshot of the current state before clearing.
 */
export async function resetEvent(params: { eventName: string, stationId?: string }) {
  // 1. Capture Summary Snapshot of the current state
  const stats = await getEventStats(params.eventName);
  await logAudit({
    role: 'admin',
    eventName: params.eventName,
    familyId: null,
    actionType: 'EVENT_SUMMARY_SNAPSHOT',
    details: `Auto-captured summary for ${params.eventName}`,
    stationId: params.stationId,
    after: {
      ...stats,
      timestamp: new Date().toISOString()
    }
  });

  // 2. GLOBAL RESET: Delete ALL servings to ensure food counters and active members are zeroed out
  // This enforces the "ONE-EVENT-AT-A-TIME" rule at the data level.
  const { error: deleteError } = await supabase.from('servings').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

  if (deleteError) {
    console.error('[Reset] Failed to clear servings:', deleteError);
  }

  // 3. Clear normal audit logs for the current event name
  await supabase
    .from('audit_logs')
    .delete()
    .eq('event_name', params.eventName)
    .neq('action_type', 'EVENT_SUMMARY_SNAPSHOT');

  // 4. Update all relevant paths
  revalidatePath('/admin');
  revalidatePath('/food');
  revalidatePath('/entry');

  return { success: true, message: 'System fully reset. Summary archived.' };
}
