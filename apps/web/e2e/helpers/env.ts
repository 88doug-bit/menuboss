/**
 * E2E environment helpers.
 * Suites SKIP (visibly) unless E2E_SUPABASE_URL is set — full GoTrue + Realtime stack required.
 */

export function isE2EEnabled(): boolean {
  return Boolean(process.env.E2E_SUPABASE_URL?.trim());
}

export function requireE2EEnv(): {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  baseURL: string;
} {
  const supabaseUrl = process.env.E2E_SUPABASE_URL?.trim();
  if (!supabaseUrl) {
    throw new Error(
      "E2E_SUPABASE_URL is required for E2E setup (local skip is handled by isE2EEnabled).",
    );
  }

  const anonKey =
    process.env.E2E_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!anonKey) {
    throw new Error(
      "E2E_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is required when E2E_SUPABASE_URL is set.",
    );
  }
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required in global-setup only (throwaway local stack).",
    );
  }

  return {
    supabaseUrl,
    anonKey,
    serviceRoleKey,
    baseURL: process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://localhost:3000",
  };
}

/** Anon + URL for specs (no service role). */
export function requireE2EClientEnv(): {
  supabaseUrl: string;
  anonKey: string;
} {
  const supabaseUrl = process.env.E2E_SUPABASE_URL?.trim();
  const anonKey =
    process.env.E2E_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "E2E_SUPABASE_URL and E2E_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) required.",
    );
  }
  return { supabaseUrl, anonKey };
}
