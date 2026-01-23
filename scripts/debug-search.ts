
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Try to find .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
console.log(`[Script] Loading env from: ${envPath}`);

if (fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath });
    if (result.error) {
        console.error('[Script] Error loading .env.local', result.error);
    } else {
        console.log('[Script] Environment loaded.');
    }
} else {
    console.warn('[Script] .env.local file NOT found!');
}

console.log('[Script] SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL || 'UNDEFINED');

// Use dynamic import to ensure env vars are loaded BEFORE external module runs
async function main() {
    try {
        const { supabase } = await import('../src/lib/supabase');

        const query = 'gada';
        const cleanQuery = query.trim().toLowerCase();
        console.log(`[Script] Testing search for: "${query}" (clean: "${cleanQuery}")`);

        console.log('[Script] Fetching all families...');
        const { data: allFamilies, error } = await supabase
            .from('families')
            .select('id, surname, head_name, phone, family_size');

        if (error) {
            console.error('[Script] Supabase Error:', error);
            return;
        }

        if (!allFamilies || allFamilies.length === 0) {
            console.warn('[Script] No families found in DB.');
            return;
        }

        console.log(`[Script] Fetched ${allFamilies.length} families directly from DB.`);
        console.log('[Script] First family sample:', allFamilies[0]);

        // Check for "gada" specifically in the raw data
        const gadas = allFamilies.filter(f =>
            (f.surname?.toLowerCase() || '').includes('gada') ||
            (f.head_name?.toLowerCase() || '').includes('gada')
        );
        console.log(`[Script] Manual check found ${gadas.length} families matching "gada" in raw data.`);
        if (gadas.length > 0) {
            console.log('[Script] Sample match:', gadas[0]);
        }

        // Now run exactly the same filter logic as the app
        const matches = allFamilies.filter(f =>
            (f.surname?.toLowerCase() || '').includes(cleanQuery) ||
            (f.head_name?.toLowerCase() || '').includes(cleanQuery) ||
            (f.phone && String(f.phone).includes(cleanQuery))
        );

        console.log(`[Script] Filter logic returned ${matches.length} matches.`);
    } catch (err) {
        console.error('[Script] Exception:', err);
    }
}

main();
