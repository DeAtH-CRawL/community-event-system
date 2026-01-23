import { NextResponse } from 'next/server';
import { supabase } from '@/src/lib/supabase';
import { fetchFamiliesFromSheet } from '@/src/lib/sheets';

/**
 * SYNC ENDPOINT
 * 
 * Logic:
 * 1. Fetch rows from Google Sheet
 * 2. For each row:
 *    - Try to find existing family by PHONE (if present)
 *    - OR try to find by Head Name + Surname (case insensitive)
 *    - Upsert accordingly
 * 
 * This ensures data persistence (IDs don't change) and allows Admin edits.
 */
export async function POST(request: Request) {
    try {
        const { rows, errors } = await fetchFamiliesFromSheet();

        if (rows.length === 0) {
            return NextResponse.json({ success: false, message: 'No data or Sheet error', errors }, { status: 400 });
        }

        let updated = 0;
        let inserted = 0;

        for (const row of rows) {
            // 1. Find Match
            let match = null;

            // Try Phone Match First
            if (row.phone) {
                const { data } = await supabase
                    .from('families')
                    .select('id')
                    .eq('phone', row.phone)
                    .maybeSingle();
                match = data;
            }

            // Try Name Match Second (if no phone match)
            if (!match) {
                const { data } = await supabase
                    .from('families')
                    .select('id')
                    .ilike('surname', row.surname)
                    .ilike('head_name', row.head_name)
                    .maybeSingle();
                match = data;
            }

            // 2. Upsert
            const payload = {
                surname: row.surname,
                head_name: row.head_name,
                phone: row.phone,
                family_size: row.family_size,
                notes: row.notes,
                updated_at: new Date().toISOString()
            };

            if (match) {
                await supabase.from('families').update(payload).eq('id', match.id);
                updated++;
            } else {
                await supabase.from('families').insert(payload);
                inserted++;
            }
        }

        // Log this sync
        await supabase.from('audit_logs').insert({
            actor_role: 'system',
            event_name: 'SYNC',
            action_type: 'SYNC',
            details: `Synced ${rows.length} rows. Inserted: ${inserted}, Updated: ${updated}. Errors: ${errors.length}`
        });

        return NextResponse.json({
            success: true,
            stats: { inserted, updated, errors: errors.length },
            errors
        });

    } catch (err) {
        return NextResponse.json({ success: false, message: String(err) }, { status: 500 });
    }
}
