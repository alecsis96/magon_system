// @ts-ignore
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../../admin-web/src/types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.EXPO_PUBLIC_ANON_KEY as string;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);