import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Prefer Service Role Key for server-side actions to bypass RLS/Policies
const supabaseKey = supabaseServiceKey || supabaseAnonKey;
const keyType = supabaseServiceKey ? 'SERVICE_ROLE' : 'ANON';

// eslint-disable-next-line no-console
console.log(`[Supabase Client] Initializing with URL: ${supabaseUrl}`);
// eslint-disable-next-line no-console
console.log(`[Supabase Client] Using Key Type: ${keyType} (Starts with: ${supabaseKey?.substring(0, 5)}...)`);

if (!supabaseUrl || !supabaseKey) {
  // eslint-disable-next-line no-console
  console.error(
    'Supabase env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or ANON KEY).'
  );
  throw new Error('Supabase env vars missing. Cannot create client.');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false, // Server-side actions context usually doesn't need session persistence
    autoRefreshToken: false,
  }
});

