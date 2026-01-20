'use server';

import { supabase } from '@/src/lib/supabase';
import { revalidatePath } from 'next/cache';

export type ActiveEntryStatus = 'ACTIVE' | 'COMPLETED';

export type FamilyRow = {
  id: string;
  surname: string;
  head_name: string;
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
  total_coupons: number;
  remaining_coupons: number;
  status: ActiveEntryStatus;
};

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
      .select('id,surname,head_name,family_size')
      .order('surname', { ascending: true })
      .limit(25);

    const res = trimmed
      ? await base.ilike('surname', `%${trimmed}%`)
      : await base;

    // Debug logging to help trace live Supabase responses
    console.log('[searchFamilies] query:', trimmed, 'data:', res.data, 'error:', res.error);

    if (res.error) {
      console.error('[searchFamilies] Full Supabase Error:', res.error);
      throw res.error;
    }
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[searchFamilies] caught error:', JSON.stringify(err, null, 2));
    return [];
  }
}

export async function checkInFamily(params: {
  eventName: string;
  familyId: string;
  members_present: number;
  guest_count: number;
  coupons_per_member: number;
  guest_coupon_price: number;
}): Promise<{
  id?: string;
  total_coupons?: number;
  remaining_coupons?: number;
  status?: ActiveEntryStatus;
  error?: string;
  message?: string;
  isDuplicate?: boolean;
}> {
  const members = Math.max(0, params.members_present);
  const guests = Math.max(0, params.guest_count);

  const event = await getOrCreateEventByName({
    name: params.eventName,
    coupons_per_member: params.coupons_per_member,
    guest_coupon_price: params.guest_coupon_price,
  });

  // Check for existing entry to determine if it's a duplicate
  const existing = await supabase
    .from('event_entries')
    .select('id')
    .eq('event_id', event.id)
    .eq('family_id', params.familyId)
    .maybeSingle();

  const isDuplicate = !!existing.data;

  // New calculation: 1 plate per person
  const total_coupons = members + guests;

  try {
    const inserted = await supabase
      .from('event_entries')
      .insert({
        event_id: event.id,
        family_id: params.familyId,
        members_present: members,
        guest_count: guests,
        total_coupons,
        remaining_coupons: total_coupons,
        status: 'ACTIVE',
      })
      .select('id,total_coupons,remaining_coupons,status')
      .single();

    if (inserted.error) {
      if (inserted.error.code === '23505') {
        return {
          error: 'DB_BLOCK',
          message: 'Cannot re-enter: Database is set to strictly one entry per family. Please contact the admin to allow duplicates.'
        };
      }
      console.error('[checkInFamily] Supabase Error:', inserted.error);
      throw inserted.error;
    }

    revalidatePath('/food');
    return { ...inserted.data, isDuplicate };
  } catch (err: any) {
    if (err.code === '23505') {
      return {
        error: 'DB_BLOCK',
        message: 'Cannot re-enter: Database is set to strictly one entry per family. Please contact the admin to allow duplicates.'
      };
    }
    throw err;
  }
}

export async function consumeCoupons(
  entryId: string,
  quantity: number
): Promise<ActiveEntry | { error: string; message: string }> {
  const deduction = Math.max(0, quantity);

  const current = await supabase
    .from('event_entries')
    .select('id,remaining_coupons,status,event_id,family_id,members_present,guest_count,total_coupons')
    .eq('id', entryId)
    .maybeSingle();

  if (current.error) {
    console.error('[consumeCoupons] Fetch Supabase Error:', current.error);
    throw current.error;
  }
  if (!current.data) return { error: "NOT_FOUND", message: "Entry not found." };

  if (current.data.remaining_coupons < deduction) {
    return { error: "INSUFFICIENT_COUPONS", message: "Not enough coupons remaining." };
  }

  const nextRemaining = current.data.remaining_coupons - deduction;
  const nextStatus: ActiveEntryStatus = nextRemaining === 0 ? 'COMPLETED' : (current.data.status as ActiveEntryStatus);

  const updated = await supabase
    .from('event_entries')
    .update({ remaining_coupons: nextRemaining, status: nextStatus })
    .eq('id', entryId)
    .select(
      'id,event_id,family_id,members_present,guest_count,total_coupons,remaining_coupons,status,families(surname,head_name)'
    )
    .single();

  if (updated.error) {
    console.error('[consumeCoupons] Update Supabase Error:', updated.error);
    throw updated.error;
  }

  revalidatePath('/food');

  const fam = (updated.data as any).families;
  return {
    id: updated.data.id,
    event_id: updated.data.event_id,
    family_id: updated.data.family_id,
    members_present: updated.data.members_present,
    guest_count: updated.data.guest_count,
    total_coupons: updated.data.total_coupons,
    remaining_coupons: updated.data.remaining_coupons,
    status: updated.data.status as ActiveEntryStatus,
    surname: fam?.surname ?? '',
    head_name: fam?.head_name ?? '',
  };
}

export async function getActiveEntries(): Promise<ActiveEntry[]> {
  try {
    const res = await supabase
      .from('event_entries')
      .select(
        'id,event_id,family_id,members_present,guest_count,total_coupons,remaining_coupons,status,families(surname,head_name)'
      )
      .eq('status', 'ACTIVE')
      .order('id', { ascending: false })
      .limit(100);

    // Debug logging to help trace live Supabase responses
    console.log('[getActiveEntries] data:', res.data, 'error:', res.error);

    if (res.error) {
      console.error('[getActiveEntries] Full Supabase Error:', res.error);
      throw res.error;
    }

    const rows = Array.isArray(res.data) ? res.data : [];

    return rows.map((row: any) => ({
      id: row.id,
      event_id: row.event_id,
      family_id: row.family_id,
      members_present: row.members_present,
      guest_count: row.guest_count,
      total_coupons: row.total_coupons,
      remaining_coupons: row.remaining_coupons,
      status: row.status as ActiveEntryStatus,
      surname: row.families?.surname ?? '',
      head_name: row.families?.head_name ?? '',
    }));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[getActiveEntries] caught error:', JSON.stringify(err, null, 2));
    return [];
  }
}
