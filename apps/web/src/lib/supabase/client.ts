/**
 * Browser Supabase client (anon key + cookie session via @supabase/ssr).
 * Used by auth UI, session provider, and realtime subscriptions.
 */
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
}
