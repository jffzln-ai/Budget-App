import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  // Fails loudly at build/runtime rather than silently connecting to nothing -
  // easier to debug than a blank screen with no explanation.
  throw new Error(
    'Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env (local) or in your Vercel project settings (deployed).'
  );
}

export const supabase = createClient(url, publishableKey);
