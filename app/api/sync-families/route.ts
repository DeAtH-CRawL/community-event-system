/**
 * Google Sheets → Supabase Sync Endpoint (Bulk Upsert)
 * 
 * PURPOSE:
 * - Reads family data from Google Sheets (source of truth)
 * - Performs SINGLE bulk upsert into Supabase
 * - Uses phone as unique identifier
 * 
 * SAFETY:
 * - Idempotent: safe to run multiple times
 * - Server-only: no client exposure
 * - Bulk operation: ~10x faster than row-by-row
 */

import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { supabase } from '@/src/lib/supabase';

// Type definitions
type SyncResult = {
    success: boolean;
    stats: {
        total: number;
        synced: number;
        skipped: number;
        errors: number;
    };
    errors: string[];
    timestamp: string;
};

export async function POST(request: Request): Promise<NextResponse<SyncResult>> {
    const startTime = Date.now();

    // Validate environment
    const sheetId = process.env.GOOGLE_SHEETS_ID;
    const apiKey = process.env.GOOGLE_SHEETS_API_KEY;

    if (!sheetId || !apiKey) {
        return NextResponse.json({
            success: false,
            stats: { total: 0, synced: 0, skipped: 0, errors: 1 },
            errors: ['Missing GOOGLE_SHEETS_ID or GOOGLE_SHEETS_API_KEY in environment'],
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }

    const stats = {
        total: 0,
        synced: 0,
        skipped: 0,
        errors: 0
    };
    const errors: string[] = [];

    try {
        // Initialize Google Sheets API
        const sheets = google.sheets({ version: 'v4', auth: apiKey });

        // Read data from Sheet (assumes headers in row 1, data starts row 2)
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: 'Sheet1!A2:E', // Columns: surname, head_name, phone, family_size, notes
        });

        const rows = response.data.values || [];
        stats.total = rows.length;

        if (rows.length === 0) {
            return NextResponse.json({
                success: true,
                stats,
                errors: ['Sheet is empty or has no data rows'],
                timestamp: new Date().toISOString()
            });
        }

        // Parse and validate all rows into array
        const validRows: Array<{
            surname: string;
            head_name: string;
            phone: string;
            family_size: number;
            updated_at: string;
        }> = [];

        const timestamp = new Date().toISOString();

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNumber = i + 2; // Row 2 is first data row

            try {
                // Parse row data (column A = family_id is ignored)
                const surname = String(row[1] || '').trim();        // Column B
                const head_name = String(row[2] || '').trim();      // Column C
                const phone = String(row[3] || '').trim();          // Column D
                const family_size_raw = row[4];                     // Column E

                // Validation: phone is required (unique key)
                if (!phone) {
                    errors.push(`Row ${rowNumber}: Missing phone (required)`);
                    stats.skipped++;
                    continue;
                }

                // Validation: surname required
                if (!surname) {
                    errors.push(`Row ${rowNumber}: Missing surname`);
                    stats.skipped++;
                    continue;
                }

                // Validation: head_name required
                if (!head_name) {
                    errors.push(`Row ${rowNumber}: Missing head_name`);
                    stats.skipped++;
                    continue;
                }

                // Validation: family_size must be positive integer
                const family_size = Number(family_size_raw);
                if (isNaN(family_size) || family_size < 1) {
                    errors.push(`Row ${rowNumber}: Invalid family_size "${family_size_raw}"`);
                    stats.skipped++;
                    continue;
                }

                // Add to valid rows
                validRows.push({
                    surname,
                    head_name,
                    phone,
                    family_size,
                    updated_at: timestamp
                });

            } catch (rowError) {
                errors.push(`Row ${rowNumber}: ${rowError instanceof Error ? rowError.message : String(rowError)}`);
                stats.skipped++;
            }
        }

        // Perform SINGLE bulk upsert
        if (validRows.length > 0) {
            const { error: upsertError, count } = await supabase
                .from('families')
                .upsert(validRows, {
                    onConflict: 'phone',
                    count: 'exact'
                });

            if (upsertError) {
                errors.push(`Bulk upsert failed: ${upsertError.message}`);
                stats.errors = validRows.length;
            } else {
                stats.synced = count || validRows.length;
            }
        }

        // Log sync to audit trail
        await supabase.from('audit_logs').insert({
            actor_role: 'system',
            event_name: 'SYNC',
            action_type: 'SYNC',
            details: `Synced ${stats.synced} families from Google Sheets. Total rows: ${stats.total}, Skipped: ${stats.skipped}, Errors: ${stats.errors}`,
            before_value: null,
            after_value: stats
        });

        const duration = Date.now() - startTime;
        console.log(`[Sync] Completed in ${duration}ms:`, stats);

        return NextResponse.json({
            success: stats.errors === 0,
            stats,
            errors,
            timestamp
        });

    } catch (error) {
        console.error('[Sync] Fatal error:', error);
        return NextResponse.json({
            success: false,
            stats,
            errors: [error instanceof Error ? error.message : String(error)],
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
}
