'use server';

import { supabase } from '@/src/lib/supabase';
import { revalidatePath } from 'next/cache';

// =============================================================================
// TYPES
// =============================================================================

export type UserRole = 'volunteer' | 'admin';

/**
 * Family with computed plate information
 * - plates_entitled = members_count (1 member = 1 plate)
 * - plates_remaining = plates_entitled - plates_used
 */
export type Family = {
  family_id: string;        // Manual stable ID from sheet (e.g., "F001")
  family_name: string;
  head_name: string;
  phone: string;
  members_count: number;
  notes?: string | null;
  // Computed fields
  plates_entitled: number;  // = members_count
  plates_used: number;      // From servings table (0 if no record)
  plates_remaining: number; // = plates_entitled - plates_used
  checked_in_at?: string | null;   // NULL = not checked in yet
};

export type AuditLogEntry = {
  id: string;
  actor_role: UserRole;
  event_name: string;
  family_id: string | null;
  action_type: string;
  before_value: unknown;
  after_value: unknown;
  details: string;
  station_id?: string;
  created_at: string;
};

// =============================================================================
// HELPER: Audit Logging
// =============================================================================

async function logAudit(params: {
  role: UserRole;
  eventName: string;
  familyId: string | null;
  actionType: 'SYNC' | 'CHECK_IN' | 'SERVE' | 'ADJUST' | 'RESET';
  before?: unknown;
  after?: unknown;
  details?: string;
  stationId?: string;
}) {
  const { error } = await supabase.from('audit_logs').insert({
    actor_role: params.role,
    event_name: params.eventName,
    family_id: params.familyId,
    action_type: params.actionType,
    before_value: params.before,
    after_value: params.after,
    details: params.details,
    station_id: params.stationId || null,
  });

  if (error) {
    console.error('[logAudit] Failed:', error);
  }
}

// =============================================================================
// SEARCH FAMILIES
// =============================================================================
/**
 * Search families by name or phone number.
 * 
 * CRITICAL FIXES from previous version:
 * - Searches families table directly (NOT event_entries)
 * - All families are visible (NOT hidden until check-in)
 * - Uses ILIKE for case-insensitive partial matching (NOT exact =)
 * - No station-scoped filtering
 */
export async function searchFamilies(query: string, eventName: string): Promise<Family[]> {
  const trimmed = query.trim();

  if (trimmed.length < 2) {
    return [];
  }

  try {
    // Step 1: Search families directly with ILIKE (case-insensitive partial match)
    const { data: families, error: familiesError } = await supabase
      .from('families')
      .select('family_id, family_name, head_name, phone, members_count, notes')
      .or(`family_name.ilike.%${trimmed}%,head_name.ilike.%${trimmed}%,phone.ilike.%${trimmed}%`)
      .order('family_name', { ascending: true })
      .limit(25);

    if (familiesError) {
      console.error('[searchFamilies] Error:', familiesError);
      return [];
    }

    if (!families || families.length === 0) {
      return [];
    }

    // Step 2: Get serving records for these families for this event
    const familyIds = families.map(f => f.family_id);
    const { data: servings } = await supabase
      .from('servings')
      .select('family_id, plates_used, checked_in_at')
      .eq('event_name', eventName)
      .in('family_id', familyIds);

    const servingsMap = new Map(
      (servings || []).map(s => [s.family_id, { plates_used: s.plates_used, checked_in_at: s.checked_in_at }])
    );

    // Step 3: Build Family objects with computed fields
    return families.map(f => {
      const serving = servingsMap.get(f.family_id);
      const plates_used = serving?.plates_used ?? 0;
      const plates_entitled = f.members_count;

      return {
        family_id: f.family_id,
        family_name: f.family_name,
        head_name: f.head_name,
        phone: f.phone,
        members_count: f.members_count,
        notes: f.notes,
        plates_entitled,
        plates_used,
        plates_remaining: plates_entitled - plates_used,
        checked_in_at: serving?.checked_in_at,
      };
    });
  } catch (err) {
    console.error('[searchFamilies] Unexpected error:', err);
    return [];
  }
}

// =============================================================================
// CHECK IN FAMILY
// =============================================================================
/**
 * Check in a family at the Entry Gate.
 * Creates a servings record if one doesn't exist for this event.
 */
export async function checkInFamily(params: {
  role: UserRole;
  eventName: string;
  familyId: string;
  stationId?: string;
}): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    // Check if family exists
    const { data: family, error: familyError } = await supabase
      .from('families')
      .select('family_id, family_name, head_name, members_count')
      .eq('family_id', params.familyId)
      .single();

    if (familyError || !family) {
      return { success: false, error: 'NOT_FOUND', message: 'Family not found in database.' };
    }

    // Check if already checked in
    const { data: existing } = await supabase
      .from('servings')
      .select('id, checked_in_at')
      .eq('event_name', params.eventName)
      .eq('family_id', params.familyId)
      .maybeSingle();

    if (existing?.checked_in_at) {
      return {
        success: false,
        error: 'ALREADY_CHECKED_IN',
        message: `${family.family_name} family is already checked in.`
      };
    }

    // Create or update servings record
    const now = new Date().toISOString();

    if (existing) {
      // Update existing record with check-in time
      await supabase
        .from('servings')
        .update({ checked_in_at: now, last_updated: now })
        .eq('id', existing.id);
    } else {
      // Insert new record
      await supabase
        .from('servings')
        .insert({
          event_name: params.eventName,
          family_id: params.familyId,
          plates_used: 0,
          checked_in_at: now,
        });
    }

    // Log the check-in
    await logAudit({
      role: params.role,
      eventName: params.eventName,
      familyId: params.familyId,
      actionType: 'CHECK_IN',
      after: { members_count: family.members_count, checked_in_at: now },
      details: `Check-in: ${family.family_name} (${family.head_name}), ${family.members_count} plates entitled${params.stationId ? ` at ${params.stationId}` : ''}.`,
      stationId: params.stationId,
    });

    revalidatePath('/entry');
    revalidatePath('/food');
    revalidatePath('/admin');

    return { success: true, message: `${family.family_name} checked in successfully.` };
  } catch (err) {
    console.error('[checkInFamily] Error:', err);
    return { success: false, error: 'UNKNOWN', message: 'Failed to check in. Please try again.' };
  }
}

// =============================================================================
// SERVE PLATES (Food Counter)
// =============================================================================
/**
 * Serve plates to a checked-in family.
 * 
 * CRITICAL: Uses atomic update with guard to prevent race conditions.
 * - Blocks if plates_remaining would go negative
 */
export async function servePlates(params: {
  role: UserRole;
  eventName: string;
  familyId: string;
  quantity: number;
  stationId?: string;
}): Promise<{ success: boolean; error?: string; message?: string; remaining?: number }> {
  const quantity = Math.max(0, Math.floor(params.quantity));

  if (quantity === 0) {
    return { success: false, error: 'INVALID', message: 'Quantity must be at least 1.' };
  }

  try {
    // Get family info for validation
    const { data: family } = await supabase
      .from('families')
      .select('family_id, family_name, members_count')
      .eq('family_id', params.familyId)
      .single();

    if (!family) {
      return { success: false, error: 'NOT_FOUND', message: 'Family not found.' };
    }

    // Get current serving record
    const { data: serving, error: servingError } = await supabase
      .from('servings')
      .select('id, plates_used, checked_in_at')
      .eq('event_name', params.eventName)
      .eq('family_id', params.familyId)
      .single();

    if (servingError || !serving) {
      return { success: false, error: 'NOT_CHECKED_IN', message: 'Family has not checked in yet.' };
    }

    if (!serving.checked_in_at) {
      return { success: false, error: 'NOT_CHECKED_IN', message: 'Family has not checked in yet.' };
    }

    const plates_entitled = family.members_count;
    const current_used = serving.plates_used;
    const plates_remaining = plates_entitled - current_used;

    if (quantity > plates_remaining) {
      return {
        success: false,
        error: 'INSUFFICIENT_PLATES',
        message: `Only ${plates_remaining} plate(s) remaining. Cannot serve ${quantity}.`
      };
    }

    const new_used = current_used + quantity;

    // ATOMIC UPDATE with guard condition to prevent race conditions
    const { data: updated, error: updateError } = await supabase
      .from('servings')
      .update({
        plates_used: new_used,
        last_updated: new Date().toISOString()
      })
      .eq('id', serving.id)
      .eq('plates_used', current_used)  // Guard: only update if value hasn't changed
      .select('plates_used')
      .maybeSingle();

    if (updateError) {
      console.error('[servePlates] Update error:', updateError);
      return { success: false, error: 'UPDATE_FAILED', message: 'Failed to record serving.' };
    }

    if (!updated) {
      // Someone else modified the record - race condition prevented
      return {
        success: false,
        error: 'CONCURRENCY',
        message: 'Another device just served plates. Please refresh and try again.'
      };
    }

    // Log the serving
    await logAudit({
      role: params.role,
      eventName: params.eventName,
      familyId: params.familyId,
      actionType: 'SERVE',
      before: { plates_used: current_used },
      after: { plates_used: new_used },
      details: `Served ${quantity} plate(s) to ${family.family_name}. Remaining: ${plates_entitled - new_used}${params.stationId ? ` at ${params.stationId}` : ''}.`,
      stationId: params.stationId,
    });

    revalidatePath('/food');
    revalidatePath('/admin');

    return {
      success: true,
      message: `Served ${quantity} plate(s).`,
      remaining: plates_entitled - new_used
    };
  } catch (err) {
    console.error('[servePlates] Error:', err);
    return { success: false, error: 'UNKNOWN', message: 'Failed to record serving.' };
  }
}

// =============================================================================
// GET CHECKED-IN FAMILIES (Food Counter)
// =============================================================================
/**
 * Get all families that have checked in for this event.
 * Used by Food Counter to show who can be served.
 */
export async function getCheckedInFamilies(eventName: string): Promise<Family[]> {
  try {
    // Get all servings for this event where checked_in_at is set
    const { data: servings, error: servingsError } = await supabase
      .from('servings')
      .select('family_id, plates_used, checked_in_at')
      .eq('event_name', eventName)
      .not('checked_in_at', 'is', null)
      .order('checked_in_at', { ascending: false });

    if (servingsError || !servings || servings.length === 0) {
      return [];
    }

    // Get family details
    const familyIds = servings.map(s => s.family_id);
    const { data: families } = await supabase
      .from('families')
      .select('family_id, family_name, head_name, phone, members_count, notes')
      .in('family_id', familyIds);

    if (!families) return [];

    const familyMap = new Map(families.map(f => [f.family_id, f]));

    return servings
      .map(s => {
        const family = familyMap.get(s.family_id);
        if (!family) return null;

        const plates_entitled = family.members_count;
        const plates_used = s.plates_used;

        const result: Family = {
          family_id: family.family_id,
          family_name: family.family_name,
          head_name: family.head_name,
          phone: family.phone,
          members_count: family.members_count,
          notes: family.notes,
          plates_entitled,
          plates_used,
          plates_remaining: plates_entitled - plates_used,
          checked_in_at: s.checked_in_at,
        };
        return result;
      })
      .filter((f): f is Family => f !== null);
  } catch (err) {
    console.error('[getCheckedInFamilies] Error:', err);
    return [];
  }
}

// =============================================================================
// ADMIN: Get All Families with Serving Status
// =============================================================================
export async function getAllFamiliesWithStatus(eventName: string): Promise<Family[]> {
  try {
    const { data: families } = await supabase
      .from('families')
      .select('family_id, family_name, head_name, phone, members_count, notes')
      .order('family_name', { ascending: true });

    if (!families) return [];

    const familyIds = families.map(f => f.family_id);
    const { data: servings } = await supabase
      .from('servings')
      .select('family_id, plates_used, checked_in_at')
      .eq('event_name', eventName)
      .in('family_id', familyIds);

    const servingsMap = new Map(
      (servings || []).map(s => [s.family_id, { plates_used: s.plates_used, checked_in_at: s.checked_in_at }])
    );

    return families.map(f => {
      const serving = servingsMap.get(f.family_id);
      const plates_entitled = f.members_count;
      const plates_used = serving?.plates_used ?? 0;

      return {
        family_id: f.family_id,
        family_name: f.family_name,
        head_name: f.head_name,
        phone: f.phone,
        members_count: f.members_count,
        notes: f.notes,
        plates_entitled,
        plates_used,
        plates_remaining: plates_entitled - plates_used,
        checked_in_at: serving?.checked_in_at,
      };
    });
  } catch (err) {
    console.error('[getAllFamiliesWithStatus] Error:', err);
    return [];
  }
}

// =============================================================================
// ADMIN: Adjust Plates
// =============================================================================
export async function adjustPlates(params: {
  role: UserRole;
  eventName: string;
  familyId: string;
  adjustment: number;
  reason: string;
  stationId?: string;
}): Promise<{ success: boolean; message: string }> {
  if (params.role !== 'admin') {
    return { success: false, message: 'Admin access required.' };
  }

  try {
    const { data: serving } = await supabase
      .from('servings')
      .select('id, plates_used')
      .eq('event_name', params.eventName)
      .eq('family_id', params.familyId)
      .single();

    if (!serving) {
      return { success: false, message: 'No serving record found for this family.' };
    }

    const newPlatesUsed = Math.max(0, serving.plates_used + params.adjustment);

    await supabase
      .from('servings')
      .update({ plates_used: newPlatesUsed, last_updated: new Date().toISOString() })
      .eq('id', serving.id);

    await logAudit({
      role: 'admin',
      eventName: params.eventName,
      familyId: params.familyId,
      actionType: 'ADJUST',
      before: { plates_used: serving.plates_used },
      after: { plates_used: newPlatesUsed },
      details: params.reason || `Admin adjustment: ${params.adjustment > 0 ? '+' : ''}${params.adjustment} plates.`,
      stationId: params.stationId,
    });

    revalidatePath('/food');
    revalidatePath('/admin');

    return { success: true, message: 'Plates adjusted successfully.' };
  } catch (err) {
    console.error('[adjustPlates] Error:', err);
    return { success: false, message: 'Failed to adjust plates.' };
  }
}

// =============================================================================
// ADMIN: Get Event Statistics
// =============================================================================
export async function getEventStats(eventName: string): Promise<{
  totalFamilies: number;
  familiesCheckedIn: number;
  totalPlatesEntitled: number;
  totalPlatesServed: number;
}> {
  try {
    // Total families in system
    const { count: totalFamilies } = await supabase
      .from('families')
      .select('*', { count: 'exact', head: true });

    // Families checked in and their plates
    const { data: servings } = await supabase
      .from('servings')
      .select('family_id, plates_used')
      .eq('event_name', eventName)
      .not('checked_in_at', 'is', null);

    const familiesCheckedIn = servings?.length ?? 0;
    const totalPlatesServed = (servings || []).reduce((sum, s) => sum + s.plates_used, 0);

    // Get total plates entitled for checked-in families
    if (servings && servings.length > 0) {
      const familyIds = servings.map(s => s.family_id);
      const { data: families } = await supabase
        .from('families')
        .select('members_count')
        .in('family_id', familyIds);

      const totalPlatesEntitled = (families || []).reduce((sum, f) => sum + f.members_count, 0);

      return {
        totalFamilies: totalFamilies ?? 0,
        familiesCheckedIn,
        totalPlatesEntitled,
        totalPlatesServed,
      };
    }

    return {
      totalFamilies: totalFamilies ?? 0,
      familiesCheckedIn: 0,
      totalPlatesEntitled: 0,
      totalPlatesServed: 0,
    };
  } catch (err) {
    console.error('[getEventStats] Error:', err);
    return { totalFamilies: 0, familiesCheckedIn: 0, totalPlatesEntitled: 0, totalPlatesServed: 0 };
  }
}

// =============================================================================
// ADMIN: Get Audit History
// =============================================================================
export async function getAuditHistory(eventName: string, familyId?: string): Promise<AuditLogEntry[]> {
  try {
    let query = supabase
      .from('audit_logs')
      .select('*')
      .eq('event_name', eventName)
      .order('created_at', { ascending: false })
      .limit(100);

    if (familyId) {
      query = query.eq('family_id', familyId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[getAuditHistory] Error:', err);
    return [];
  }
}

// =============================================================================
// ADMIN: Reset Event (clear all servings for an event)
// =============================================================================
export async function resetEvent(params: {
  eventName: string;
  stationId?: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const { count } = await supabase
      .from('servings')
      .select('*', { count: 'exact', head: true })
      .eq('event_name', params.eventName);

    const { error } = await supabase
      .from('servings')
      .delete()
      .eq('event_name', params.eventName);

    if (error) throw error;

    await logAudit({
      role: 'admin',
      eventName: params.eventName,
      familyId: null,
      actionType: 'RESET',
      before: { servings_count: count },
      after: { servings_count: 0 },
      details: `Reset event: Cleared ${count || 0} serving records.`,
      stationId: params.stationId,
    });

    revalidatePath('/food');
    revalidatePath('/admin');
    revalidatePath('/entry');

    return { success: true, message: `Reset complete. Cleared ${count || 0} records.` };
  } catch (err) {
    console.error('[resetEvent] Error:', err);
    return { success: false, message: 'Failed to reset event.' };
  }
}
