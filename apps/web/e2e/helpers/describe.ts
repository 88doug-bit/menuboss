/**
 * Env-gated describe: when E2E_SUPABASE_URL is unset, the suite is SKIPPED
 * (visible in Playwright output — never a silent pass).
 */
import { test } from "@playwright/test";
import { isE2EEnabled } from "./env";

export const SKIP_REASON =
  "E2E_SUPABASE_URL not set — full Supabase (GoTrue + Realtime) required; skipped on machines without Docker";

/**
 * Runs `test.describe` when E2E env is present; otherwise `test.describe.skip`
 * with the skip reason appended to the suite title (visible in reporters).
 */
export function e2eDescribe(title: string, fn: () => void): void {
  if (isE2EEnabled()) {
    test.describe(title, fn);
  } else {
    test.describe.skip(`${title} — SKIPPED: ${SKIP_REASON}`, fn);
  }
}
