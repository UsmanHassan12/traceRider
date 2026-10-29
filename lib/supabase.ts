import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when the Supabase URL and public key are set (in .env.local or Vercel). */
export const configured = !!url && !!key;

let client: SupabaseClient | null = null;

/** Browser Supabase client, created on first use. */
export function sb(): SupabaseClient {
  if (!configured) throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  if (!client) client = createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}
