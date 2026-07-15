/**
 * Supabase JS helpers for E2E (user JWT only — no service role).
 * Used by realtime-cutoff and fixture seeding after auth users exist.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PERSONAS, type PersonaKey } from "../personas";
import { requireE2EClientEnv } from "./env";

export function createAnonClient(): SupabaseClient {
  const { supabaseUrl, anonKey } = requireE2EClientEnv();
  return createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

/** Sign in as a seed persona with password (user JWT client). */
export async function signInAs(
  persona: PersonaKey,
): Promise<SupabaseClient> {
  const client = createAnonClient();
  const creds = PERSONAS[persona];
  const { data, error } = await client.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });
  if (error || !data.session) {
    throw new Error(
      `signInAs(${persona}) failed: ${error?.message ?? "no session"}`,
    );
  }
  return client;
}
