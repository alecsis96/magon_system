// @ts-ignore
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../../admin-web/src/types/database';

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co';
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_ANON_KEY ?? 'placeholder-anon-key';

if (
  !process.env.EXPO_PUBLIC_SUPABASE_URL ||
  !process.env.EXPO_PUBLIC_ANON_KEY
) {
  console.error(
    'Missing Expo public env vars: EXPO_PUBLIC_SUPABASE_URL and/or EXPO_PUBLIC_ANON_KEY. Configure them in EAS before building the APK.'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
