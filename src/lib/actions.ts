'use server';

import { supabase } from '@/src/lib/supabase';
import { revalidatePath } from 'next/cache';

export type ActiveEntryStatus = 'ACTIVE' | 'FOOD_EXHAUSTED' | 'CLOSED';
export type UserRole = 'volunteer' | 'admin';

export type FamilyRow = {
  id: string;
  surname: string;
  head_name: string;
  phone: string;
  family_size: number;
};

export type ActiveEntry = {
  id: string;
  event_id: string;
  family_id: string;
  surname: string;
  head_name: string;
  members_present: number;
  guest_count: number;
  member_coupons: number;
  guest_coupons: number;
  total_coupons: number;
  remaining_coupons: number;
  status: ActiveEntryStatus;
  created_at: string;
};

export type AuditLogEntry = {
  id: string;
  actor_role: UserRole;
  event_id: string;
  family_id: string;
  action_type: string;
  before_value: any;
  after_value: any;
  details: string;
  created_at: string;
};

/**
 * Helper to log actions for dispute resolution
 */
async function logAudit(params: {
  role: UserRole;
  eventId: string;
  familyId: string;
  actionType: 'CHECK_IN' | 'CONSUME' | 'ADJUST' | 'CLOSE' | 'REOPEN' | 'UNDO_CHECK_IN';
  before?: any;
  after?: any;
  details?: string;
}) {
  const { error } = await supabase.from('audit_logs').insert({
    actor_role: params.role,
    event_id: params.eventId,
    family_id: params.familyId,
    action_type: params.actionType,
    before_value: params.before,
    after_value: params.after,
    details: params.details,
  });

  if (error) {
    console.error('[logAudit] Error:', error);
  }
}

async function getOrCreateEventByName(params: {
  name: string;
  coupons_per_member: number;
  guest_coupon_price: number;
}): Promise<{ id: string; coupons_per_member: number }> {
  const existing = await supabase
    .from('events')
    .select('id,coupons_per_member')
    .eq('name', params.name)
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    console.error('[getOrCreateEventByName] Supabase Error:', existing.error);
    throw existing.error;
  }
  if (existing.data) return existing.data;

  const inserted = await supabase
    .from('events')
    .insert({
      name: params.name,
      coupons_per_member: params.coupons_per_member,
      guest_coupon_price: params.guest_coupon_price,
    })
    .select('id,coupons_per_member')
    .single();

  if (inserted.error) {
    console.error('[getOrCreateEventByName] Insert Supabase Error:', inserted.error);
    throw inserted.error;
  }
  return inserted.data;
}

export async function searchFamilies(query: string): Promise<FamilyRow[]> {
  const trimmed = query.trim();

  try {
    const base = supabase
      .from('families')
      .select('id,surname,head_name,phone,family_size')
      .order('surname', { ascending: true })
      .limit(25);

    const res = trimmed
      ? await base.or(`surname.ilike.%${trimmed}%,head_name.ilike.%${trimmed}%,phone.ilike.%${trimmed}%`)
      : await base;

    if (res.error) {
      console.error('[searchFamilies] Supabase Error:', res.error);
      return [];
    }
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    console.error('[searchFamilies] caught error:', err);
    return [];
  }
}

export async function checkInFamily(params: {
  role: UserRole;
  eventName: string;
  familyId: string;
  members_present: number;
  guest_count: number;
  coupons_per_member: number;
  guest_coupon_price: number;
}): Promise<{
  id?: string;
  error?: string;
  message?: string;
}> {
  const members = Math.max(0, params.members_present);
  const guests = Math.max(0, params.guest_count);

  const event = await getOrCreateEventByName({
    name: params.eventName,
    coupons_per_member: params.coupons_per_member,
    guest_coupon_price: params.guest_coupon_price,
  });

  const member_coupons = members;
  const guest_coupons = guests;
  const total_coupons = member_coupons + guest_coupons;

  try {
    const { data: inserted, error } = await supabase
      .from('event_entries')
      .insert({
        event_id: event.id,
        family_id: params.familyId,
        members_present: members,
        guest_count: guests,
        member_coupons,
        guest_coupons,
        total_coupons,
        remaining_coupons: total_coupons,
        status: total_coupons > 0 ? 'ACTIVE' : 'FOOD_EXHAUSTED',
      })
      .select('id,status')
      .single();

    if (error) {
      if (error.code === '23505') {
        return {
          error: 'DUPLICATE_ENTRY',
          message: 'Family already checked in for this event.'
        };
      }
      throw error;
    }

    await logAudit({
      role: params.role,
      eventId: event.id,
      familyId: params.familyId,
      actionType: 'CHECK_IN',
      after: { members, guests, total_coupons },
      details: `Checked in locally with ${members} members and ${guests} guests.`
    });

    revalidatePath('/food');
    revalidatePath('/admin');
    revalidatePath('/entry');
    return { id: inserted.id };
  } catch (err: any) {
    console.error('[checkInFamily] Error:', err);
    return { error: 'UNKNOWN_ERROR', message: 'Failed to record entry.' };
  }
}

export async function deleteEntry(params: {
  role: UserRole;
  entryId: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const { data: entry, error: fetchError } = await supabase
      .from('event_entries')
      .select('id,event_id,family_id,remaining_coupons,total_coupons')
      .eq('id', params.entryId)
      .single();

    if (fetchError || !entry) {
      return { success: false, message: 'Entry not found.' };
    }

    // Hardening: Only allow delete if no coupons have been consumed yet OR if admin
    if (params.role !== 'admin' && entry.remaining_coupons !== entry.total_coupons) {
      return { success: false, message: 'Cannot undo: Food already served! Please contact Admin.' };
    }

    const { error: deleteError } = await supabase.from('event_entries').delete().eq('id', params.entryId);
    if (deleteError) throw deleteError;

    await logAudit({
      role: params.role,
      eventId: entry.event_id,
      familyId: entry.family_id,
      actionType: 'UNDO_CHECK_IN',
      before: { id: entry.id, remaining: entry.remaining_coupons },
      details: `Check-in reversed for ${entry.family_id}.`
    });

    revalidatePath('/food');
    revalidatePath('/admin');
    revalidatePath('/entry');
    return { success: true, message: 'Check-in reversed successfully.' };
  } catch (err: any) {
    console.error('[deleteEntry] error:', err);
    return { success: false, message: 'Failed to reverse check-in.' };
  }
}

export async function consumeCoupons(params: {
  role: UserRole;
  entryId: string;
  quantity: number;
}): Promise<{ success: boolean; error?: string; message?: string }> {
  const deduction = Math.max(0, params.quantity);

  // Fetch current state to check status and calculate next values
  const { data: current, error: fetchError } = await supabase
    .from('event_entries')
    .select('id,remaining_coupons,status,event_id,family_id')
    .eq('id', params.entryId)
    .single();

  if (fetchError || !current) return { success: false, error: "NOT_FOUND", message: "Entry not found." };
  if (current.status === 'CLOSED') return { success: false, error: "CLOSED", message: "Entry is closed." };

  if (current.remaining_coupons < deduction) {
    return { success: false, error: "INSUFFICIENT_COUPONS", message: `Only ${current.remaining_coupons} coupons left.` };
  }

  const nextRemaining = current.remaining_coupons - deduction;
  const nextStatus: ActiveEntryStatus = nextRemaining === 0 ? 'FOOD_EXHAUSTED' : (current.status as ActiveEntryStatus);

  // HARDENING: Atomic check using the fetched 'remaining_coupons' as a condition
  // This prevents race conditions where two volunteers click at the same time.
  const { error: updateError, data: updated } = await supabase
    .from('event_entries')
    .update({
      remaining_coupons: nextRemaining,
      status: nextStatus
    })
    .eq('id', params.entryId)
    .eq('remaining_coupons', current.remaining_coupons) // THE GUARDRAIL
    .select('id')
    .maybeSingle();

  if (updateError) throw updateError;

  // If no row was updated, it means someone else changed it in between.
  if (!updated) {
    return {
      success: false,
      error: 'CONCURRENCY_ERROR',
      message: 'Someone else just redeemed coupons for this family. Please refresh.'
    };
  }

  await logAudit({
    role: params.role,
    eventId: current.event_id,
    familyId: current.family_id,
    actionType: 'CONSUME',
    before: { remaining: current.remaining_coupons },
    after: { remaining: nextRemaining },
    details: `Deducted ${deduction} plate(s). Remaining: ${nextRemaining}.`
  });

  revalidatePath('/food');
  revalidatePath('/admin');
  return { success: true, message: `Redeemed ${deduction} plate(s).` };
}

export async function adjustCoupons(params: {
  role: UserRole;
  entryId: string;
  adjustment: number;
  details: string;
}): Promise<{ success: boolean; message: string }> {
  if (params.role !== 'admin') {
    return { success: false, message: 'Access Denied: Admin role required for adjustments.' };
  }

  try {
    const { data: current, error: fetchError } = await supabase
      .from('event_entries')
      .select('id,remaining_coupons,status,event_id,family_id,total_coupons')
      .eq('id', params.entryId)
      .single();

    if (fetchError || !current) return { success: false, message: 'Entry not found.' };

    const nextTotal = Math.max(0, current.total_coupons + params.adjustment);
    const nextRemaining = Math.max(0, current.remaining_coupons + params.adjustment);
    const nextStatus: ActiveEntryStatus = nextRemaining > 0 && current.status === 'FOOD_EXHAUSTED'
      ? 'ACTIVE'
      : (nextRemaining === 0 ? 'FOOD_EXHAUSTED' : current.status as ActiveEntryStatus);

    const { error: updateError } = await supabase
      .from('event_entries')
      .update({
        total_coupons: nextTotal,
        remaining_coupons: nextRemaining,
        status: nextStatus
      })
      .eq('id', params.entryId);

    if (updateError) throw updateError;

    await logAudit({
      role: 'admin',
      eventId: current.event_id,
      familyId: current.family_id,
      actionType: 'ADJUST',
      before: { total: current.total_coupons, remaining: current.remaining_coupons },
      after: { total: nextTotal, remaining: nextRemaining },
      details: params.details || `Adjusted by ${params.adjustment}.`
    });

    revalidatePath('/admin');
    revalidatePath('/food');
    return { success: true, message: 'Coupons adjusted successfully.' };
  } catch (err) {
    console.error('[adjustCoupons] error:', err);
    return { success: false, message: 'Failed to adjust coupons.' };
  }
}

export async function updateEntryStatus(params: {
  role: UserRole;
  entryId: string;
  newStatus: 'CLOSED' | 'ACTIVE';
}): Promise<{ success: boolean; message: string }> {
  if (params.role !== 'admin') {
    return { success: false, message: 'Access Denied: Admin role required.' };
  }

  try {
    const { data: current, error: fetchError } = await supabase
      .from('event_entries')
      .select('id,remaining_coupons,status,event_id,family_id')
      .eq('id', params.entryId)
      .single();

    if (fetchError || !current) return { success: false, message: 'Entry not found.' };

    let statusToSet: ActiveEntryStatus = params.newStatus as ActiveEntryStatus;
    if (params.newStatus === 'ACTIVE' && current.remaining_coupons === 0) {
      statusToSet = 'FOOD_EXHAUSTED';
    }

    const { error: updateError } = await supabase
      .from('event_entries')
      .update({ status: statusToSet })
      .eq('id', params.entryId);

    if (updateError) throw updateError;

    await logAudit({
      role: 'admin',
      eventId: current.event_id,
      familyId: current.family_id,
      actionType: params.newStatus === 'CLOSED' ? 'CLOSE' : 'REOPEN',
      before: { status: current.status },
      after: { status: statusToSet },
      details: `Status manually changed to ${statusToSet}`
    });

    revalidatePath('/admin');
    revalidatePath('/food');
    return { success: true, message: `Entry ${params.newStatus === 'CLOSED' ? 'closed' : 'reopened'} successfully.` };
  } catch (err) {
    console.error('[updateEntryStatus] error:', err);
    return { success: false, message: 'Failed to update status.' };
  }
}

export async function getActiveEntries(eventName: string): Promise<ActiveEntry[]> {
  try {
    const { data: event } = await supabase.from('events').select('id').eq('name', eventName).single();
    if (!event) return [];

    const res = await supabase
      .from('event_entries')
      .select('id,event_id,family_id,members_present,guest_count,member_coupons,guest_coupons,total_coupons,remaining_coupons,status,created_at,families(surname,head_name)')
      .eq('event_id', event.id)
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: false });

    if (res.error) throw res.error;

    return (res.data || []).map((row: any) => ({
      ...row,
      surname: row.families?.surname ?? '',
      head_name: row.families?.head_name ?? '',
    }));
  } catch (err) {
    console.error('[getActiveEntries] error:', err);
    return [];
  }
}

export async function getAllEntries(eventName: string): Promise<ActiveEntry[]> {
  try {
    const { data: event } = await supabase.from('events').select('id').eq('name', eventName).single();
    if (!event) return [];

    const res = await supabase
      .from('event_entries')
      .select('id,event_id,family_id,members_present,guest_count,member_coupons,guest_coupons,total_coupons,remaining_coupons,status,created_at,families(surname,head_name)')
      .eq('event_id', event.id)
      .order('created_at', { ascending: false });

    if (res.error) throw res.error;

    return (res.data || []).map((row: any) => ({
      ...row,
      surname: row.families?.surname ?? '',
      head_name: row.families?.head_name ?? '',
    }));
  } catch (err) {
    console.error('[getAllEntries] error:', err);
    return [];
  }
}

export async function getEntryHistory(familyId: string, eventId: string): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('family_id', familyId)
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getEventSnapshot(eventName: string): Promise<{
  totalFamilies: number;
  totalPlatesServed: number;
  totalGuests: number;
}> {
  try {
    const { data: event } = await supabase.from('events').select('id').eq('name', eventName).single();
    if (!event) return { totalFamilies: 0, totalPlatesServed: 0, totalGuests: 0 };

    const { data: entries, error } = await supabase
      .from('event_entries')
      .select('total_coupons,remaining_coupons,guest_count')
      .eq('event_id', event.id);

    if (error) throw error;

    const snapshot = (entries || []).reduce(
      (acc, entry) => {
        acc.totalFamilies += 1;
        acc.totalPlatesServed += (entry.total_coupons - entry.remaining_coupons);
        acc.totalGuests += entry.guest_count;
        return acc;
      },
      { totalFamilies: 0, totalPlatesServed: 0, totalGuests: 0 }
    );

    return snapshot;
  } catch (err) {
    console.error('[getEventSnapshot] error:', err);
    return { totalFamilies: 0, totalPlatesServed: 0, totalGuests: 0 };
  }
}
