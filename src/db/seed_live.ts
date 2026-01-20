import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { families, mockEvent } from '@/src/db/seedData';

dotenv.config({ path: '.env.local' });

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // eslint-disable-next-line no-console
    console.error(
      'Missing Supabase env vars. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.'
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // 1) Ensure mockEvent exists in the events table
  // eslint-disable-next-line no-console
  console.log('Ensuring mock event exists...');
  const { error: eventError } = await supabase
    .from('events')
    .upsert(
      {
        name: mockEvent.name,
        coupons_per_member: mockEvent.coupons_per_member,
        guest_coupon_price: mockEvent.guest_coupon_price,
      },
      { onConflict: 'name' }
    );

  if (eventError) {
    // eslint-disable-next-line no-console
    console.error('Error inserting mock event:', eventError.message);
    process.exit(1);
  }

  // 2) Seed families
  // eslint-disable-next-line no-console
  console.log('Seeding families into Supabase...');

  const { error } = await supabase.from('families').insert(
    families.map((f) => ({
      surname: f.surname,
      head_name: f.head_name,
      package_type: f.package_type,
      family_size: f.family_size,
    }))
  );

  if (error) {
    // eslint-disable-next-line no-console
    console.error('Error seeding families:', error.message);
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log('Seeding completed successfully.');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Unexpected error during seeding:', err);
  process.exit(1);
});

