/**
 * Global teardown — soft-delete the meal plans this run created so the
 * shared local dev DB's calendar stays clean between E2E runs. No-ops
 * without E2E env (same skip contract as global-setup).
 */
import { signInAs } from "./helpers/supabase";
import { cleanupE2EPlans } from "./helpers/cleanup";

export default async function globalTeardown(): Promise<void> {
  if (!process.env.E2E_SUPABASE_URL) return;
  const memberA = await signInAs("member_a");
  await cleanupE2EPlans(memberA, "global-teardown");
}
