import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// eslint-disable-next-line no-console
console.log('[Supabase Client] Initializing with URL:', supabaseUrl);

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error(
    'Supabase env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
  );
  throw new Error('Supabase env vars missing. Cannot create client.');
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '');

