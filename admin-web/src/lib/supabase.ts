import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

// Nota: Estas claves las sacaremos de tu panel de Supabase más adelante.
// Por ahora usamos variables de entorno de Vite.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'URL_TEMPORAL';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'KEY_TEMPORAL';

if (supabaseUrl === 'URL_TEMPORAL' || supabaseKey === 'KEY_TEMPORAL') {
  console.error(
    'Supabase env missing: verify VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the deployment environment.',
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey);

