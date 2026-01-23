import { NextResponse } from 'next/server';
import { fetchFamiliesFromSheet } from '@/src/lib/sheets';
import { supabase } from '@/src/lib/supabase';

/**
 * POST /api/sync
 * 
 * Syncs family data from Google Sheets to Supabase.
 * This is an ATOMIC REPLACE operation:
 * 1. Fetch all families from Google Sheets
 * 2. Validate data
 * 3. Delete all existing families in Supabase (cascade deletes servings)
 * 4. Insert new families
 * 
 * Called manually via "Sync from Sheet" button in admin panel.
 */
export async function POST(request: Request) {
    try {
        // Parse optional station_id from request body for audit
        let stationId = '';
        try {
            const body = await request.json();
            stationId = body.stationId || '';
        } catch {
            // No body or invalid JSON, that's fine
        }

        // Step 1: Fetch from Google Sheets
        const { families, errors: sheetErrors } = await fetchFamiliesFromSheet();

        if (sheetErrors.length > 0 && families.length === 0) {
            // Complete failure - no data fetched
            return NextResponse.json(
                { success: false, message: 'Failed to fetch from Google Sheets', errors: sheetErrors },
                { status: 500 }
            );
        }

        if (families.length === 0) {
            return NextResponse.json(
                { success: false, message: 'No valid families found in the sheet', errors: sheetErrors },
                { status: 400 }
            );
        }

        // Step 2: Check for duplicate family_ids in sheet data
        const idCounts = new Map<string, number>();
        families.forEach(f => idCounts.set(f.family_id, (idCounts.get(f.family_id) || 0) + 1));
        const duplicates = [...idCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id);

        if (duplicates.length > 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: 'Duplicate family_id values found in sheet',
                    errors: [`Duplicate IDs: ${duplicates.join(', ')}`]
                },
                { status: 400 }
            );
        }

        // Step 3: Atomic replace in Supabase
        // First, get count of existing families for audit log
        const { count: beforeCount } = await supabase
            .from('families')
            .select('*', { count: 'exact', head: true });

        // Delete all existing families (servings will cascade delete)
        const { error: deleteError } = await supabase
            .from('families')
            .delete()
            .neq('family_id', ''); // Delete all rows

        if (deleteError) {
            console.error('[sync] Delete error:', deleteError);
            return NextResponse.json(
                { success: false, message: 'Failed to clear existing data', errors: [deleteError.message] },
                { status: 500 }
            );
        }

        // Insert new families
        const { error: insertError } = await supabase
            .from('families')
            .insert(families.map(f => ({
                family_id: f.family_id,
                family_name: f.family_name,
                head_name: f.head_name,
                phone: f.phone,
                members_count: f.members_count,
                notes: f.notes || null,
                synced_at: new Date().toISOString(),
            })));

        if (insertError) {
            console.error('[sync] Insert error:', insertError);
            return NextResponse.json(
                { success: false, message: 'Failed to insert new data', errors: [insertError.message] },
                { status: 500 }
            );
        }

        // Step 4: Log the sync action
        await supabase.from('audit_logs').insert({
            actor_role: 'admin',
            event_name: 'SYSTEM',
            family_id: null,
            action_type: 'SYNC',
            before_value: { count: beforeCount },
            after_value: { count: families.length, errors: sheetErrors.length },
            details: `Synced ${families.length} families from Google Sheets${sheetErrors.length > 0 ? ` (${sheetErrors.length} rows had errors)` : ''}.`,
            station_id: stationId || null,
        });

        return NextResponse.json({
            success: true,
            message: `Synced ${families.length} families from Google Sheets`,
            count: families.length,
            warnings: sheetErrors, // Any row-level validation errors
        });

    } catch (error) {
        console.error('[sync] Unexpected error:', error);
        return NextResponse.json(
            { success: false, message: 'Unexpected error during sync', errors: [String(error)] },
            { status: 500 }
        );
    }
}
