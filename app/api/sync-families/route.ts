/**
 * Google Sheets → Supabase Sync Endpoint (Bulk Upsert with Batching)
 * 
 * PURPOSE:
 * - Reads family data from Google Sheets (source of truth)
 * - Syncs to Supabase using family_id as unique identifier
 * - Handles 3k+ rows with batching strategy
 * 
 * SAFETY:
 * - Idempotent: safe to run multiple times
 * - Server-only: no client exposure
 * - Batched operations: handles large datasets reliably
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

type FamilyRow = {
    family_id: string;
    surname: string;
    head_name: string;
    phone: string | null;
    family_size: number;
    status: string;
    notes: string | null;
    updated_at: string;
};

const BATCH_SIZE = 150; // Process 150 rows per batch to avoid timeouts

export async function POST(request: Request): Promise<NextResponse<SyncResult>> {
    const startTime = Date.now();

    console.log('[Sync] ========== SYNC REQUEST STARTED ==========');
    console.log('[Sync] Environment check:');
    console.log('[Sync] - GOOGLE_SHEETS_ID present:', !!process.env.GOOGLE_SHEETS_ID);
    console.log('[Sync] - GOOGLE_SERVICE_ACCOUNT_JSON present:', !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

    // Validate environment
    const sheetId = process.env.GOOGLE_SHEETS_ID;
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

    if (!sheetId) {
        console.error('[Sync] ERROR: Missing GOOGLE_SHEETS_ID');
        return NextResponse.json({
            success: false,
            stats: { total: 0, synced: 0, skipped: 0, errors: 1 },
            errors: ['Missing GOOGLE_SHEETS_ID in environment'],
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }

    if (!serviceAccountJson) {
        console.error('[Sync] ERROR: Missing GOOGLE_SERVICE_ACCOUNT_JSON');
        return NextResponse.json({
            success: false,
            stats: { total: 0, synced: 0, skipped: 0, errors: 1 },
            errors: ['Missing GOOGLE_SERVICE_ACCOUNT_JSON in environment. Please add service account credentials.'],
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
        // Parse service account JSON
        let credentials;
        try {
            console.log('[Sync] Parsing service account JSON...');
            credentials = JSON.parse(serviceAccountJson);
            console.log('[Sync] ✓ Service account JSON parsed successfully');
            console.log('[Sync] - Project ID:', credentials.project_id);
            console.log('[Sync] - Client email:', credentials.client_email);
        } catch (parseError) {
            console.error('[Sync] ERROR: Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:', parseError);
            return NextResponse.json({
                success: false,
                stats: { total: 0, synced: 0, skipped: 0, errors: 1 },
                errors: [`Invalid GOOGLE_SERVICE_ACCOUNT_JSON format: ${parseError instanceof Error ? parseError.message : String(parseError)}`],
                timestamp: new Date().toISOString()
            }, { status: 500 });
        }

        // Initialize Google Sheets API with service account
        console.log('[Sync] Initializing Google Auth...');
        const auth = new google.auth.GoogleAuth({
            credentials: credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });

        console.log('[Sync] Creating Sheets API client...');
        const sheets = google.sheets({ version: 'v4', auth });
        console.log('[Sync] ✓ Sheets API client created');

        console.log('[Sync] Reading from Google Sheets...');
        console.log('[Sync] - Sheet ID:', sheetId);
        console.log('[Sync] - Range: Sheet1!A2:G');

        // Read data from Sheet (columns A-G, data starts row 2)
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: 'Sheet1!A2:G', // A=family_id, B=surname, C=head_name, D=phone, E=family_size, F=status, G=notes
        });

        const rows = response.data.values || [];
        stats.total = rows.length;

        console.log(`[Sync] ✓ Retrieved ${rows.length} rows from Sheet`);

        if (rows.length === 0) {
            return NextResponse.json({
                success: true,
                stats,
                errors: ['Sheet is empty or has no data rows'],
                timestamp: new Date().toISOString()
            });
        }

        // Parse and validate all rows into array
        const validRows: FamilyRow[] = [];
        const timestamp = new Date().toISOString();

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNumber = i + 2; // Row 2 is first data row

            try {
                // Parse row data
                const family_id = String(row[0] || '').trim();       // Column A
                const surname = String(row[1] || '').trim();         // Column B
                const head_name = String(row[2] || '').trim();       // Column C
                const phone_raw = String(row[3] || '').trim();       // Column D
                const family_size_raw = row[4];                      // Column E
                const status_raw = String(row[5] || '').trim();      // Column F
                const notes_raw = String(row[6] || '').trim();       // Column G

                // Validation: family_id is required (primary key)
                if (!family_id) {
                    errors.push(`Row ${rowNumber}: Missing family_id (column A) - row skipped`);
                    stats.skipped++;
                    continue;
                }

                // Validation: surname required
                if (!surname) {
                    errors.push(`Row ${rowNumber} (${family_id}): Missing surname`);
                    stats.skipped++;
                    continue;
                }

                // Validation: head_name required
                if (!head_name) {
                    errors.push(`Row ${rowNumber} (${family_id}): Missing head_name`);
                    stats.skipped++;
                    continue;
                }

                // Parse phone (nullable)
                const phone = phone_raw || null;

                // Validation: family_size must be positive integer
                const family_size = parseInt(family_size_raw);
                if (isNaN(family_size) || family_size < 1) {
                    errors.push(`Row ${rowNumber} (${family_id}): Invalid family_size "${family_size_raw}" - must be ≥1`);
                    stats.skipped++;
                    continue;
                }

                // Parse status (must be 'active' or 'inactive', default 'active')
                let status = status_raw.toLowerCase() || 'active';
                if (status !== 'active' && status !== 'inactive') {
                    errors.push(`Row ${rowNumber} (${family_id}): Invalid status "${status_raw}" - defaulting to 'active'`);
                    status = 'active';
                }

                // Parse notes (nullable)
                const notes = notes_raw || null;

                // Add to valid rows
                validRows.push({
                    family_id,
                    surname,
                    head_name,
                    phone,
                    family_size,
                    status,
                    notes,
                    updated_at: timestamp
                });

            } catch (rowError) {
                const family_id = String(row[0] || '').trim() || 'UNKNOWN';
                errors.push(`Row ${rowNumber} (${family_id}): ${rowError instanceof Error ? rowError.message : String(rowError)}`);
                stats.skipped++;
            }
        }

        console.log(`[Sync] Validated ${validRows.length} rows, skipped ${stats.skipped}`);

        // Perform batched upserts for large datasets
        if (validRows.length > 0) {
            const batches: FamilyRow[][] = [];
            for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
                batches.push(validRows.slice(i, i + BATCH_SIZE));
            }

            console.log(`[Sync] Processing ${batches.length} batches (${BATCH_SIZE} rows per batch)`);

            let totalSynced = 0;

            for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
                const batch = batches[batchIndex];

                try {
                    const { error: upsertError, count } = await supabase
                        .from('families')
                        .upsert(batch, {
                            onConflict: 'family_id',
                            count: 'exact'
                        });

                    if (upsertError) {
                        errors.push(`Batch ${batchIndex + 1} failed: ${upsertError.message}`);
                        stats.errors += batch.length;
                        console.error(`[Sync] Batch ${batchIndex + 1} error:`, upsertError);
                    } else {
                        totalSynced += count || batch.length;
                        console.log(`[Sync] Batch ${batchIndex + 1}/${batches.length} completed: ${count || batch.length} rows`);
                    }
                } catch (batchError) {
                    errors.push(`Batch ${batchIndex + 1} exception: ${batchError instanceof Error ? batchError.message : String(batchError)}`);
                    stats.errors += batch.length;
                    console.error(`[Sync] Batch ${batchIndex + 1} exception:`, batchError);
                }
            }

            stats.synced = totalSynced;
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
