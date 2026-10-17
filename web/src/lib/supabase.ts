import { createClient } from "@supabase/supabase-js";

// The publishable (anon) key is safe in the browser: the database only grants it
// read access to the open-data tables and execute on the brief functions.
export function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in web/.env.local (see web/.env.example).",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
