# Brief for Grok — Task 13 (Wave 2): Playwright E2E (§9.3 flows) + Realtime Scenario-11 integration test

**Context:** Wave 2 verification layer. Product PRD v0.2 §11 mandates Playwright E2E over the §9.3 flows, and the RLS matrix's **Scenario 11 (Realtime parity / unshare cutoff)** is explicitly deferred to this integration suite (see `supabase/tests/rls/README.md`). These tests target the screens from Tasks 11–12 and the Task 10 backend.

**Attachments required:** `Product_PRD_v0.2.md` (§9.3 flows, §11 Testing Strategy, §12 performance budgets), `grok_11_calendar_plan_screens.md`, `grok_12_content_screens.md`.

**Output:** one markdown file, saved as `drafts/grok_out_e2e_realtime.md`, repo files as `### FILE:` headers + fenced blocks. **Extensionless relative imports.**

## Environment reality (design for it)
- These suites need the FULL Supabase stack (GoTrue auth + Realtime). The dev machine has **no Docker** — locally these suites are SKIPPED; they run in CI against `supabase start`. Guard: skip unless `E2E_SUPABASE_URL` is set. Never silently pass — skipped must be visible in output.
- Test users: seed personas have profiles but no auth users. Provide `apps/web/e2e/global-setup.ts` that creates auth users for member_a/admin_a/member_b **via the Supabase admin API using `SUPABASE_SERVICE_ROLE_KEY` from env** — this is TEST SETUP against a throwaway local stack, the one sanctioned service-role context (never in app code). Auth user ids MUST equal the seeded profile UUIDs. Store per-persona `storageState` files for reuse.

## 1. Playwright E2E — §9.3 flows (apps/web/e2e/)
- `plan-shared-meal.spec.ts` — Flow 1 end-to-end as member_a: open calendar → day → add plan → search/select recipe (assert safety note visible for a seeded seafood recipe) → set portion counts (assert live total updates and matches the portion-calc value) → share with Household B → save. Then, **in a second browser context as member_b**, assert the plan appears on B's calendar (realtime or reload ≤ 2 s — §12 budget P5).
- `capture-leftover-idea.spec.ts` — Flow 2: open a cooked recipe → add decay-path entries → as another persona, view and navigate a linked entry.
- `capture-chef-idea.spec.ts` — Flow 3: capture idea with tags → find via browse filter and via global search.
- `shopping-list.spec.ts` — generate list for a multi-plan selection; assert Optional grouping and cross-dimension separate lines.
- Mobile viewport projects (`iPhone 14`) for flows 1 and 3 (§11 mobile-first mandate).
- Performance budget assertions where cheap: calendar interactive < 1.5 s (P1) via `page.waitForLoadState` timing on a warm run; do not build a perf harness — one timed assertion per budgeted flow.

## 2. Scenario 11 — Realtime unshare cutoff (apps/web/e2e/realtime-cutoff.spec.ts)
The security assertion pgTAP cannot make. Two `@supabase/supabase-js` clients (no browser needed — pure integration test, but keep it in the Playwright suite for env reuse):
1. member_b subscribes to postgres_changes on `meal_plan` + children for a plan shared A→B; assert an event arrives when member_a edits (parity positive case).
2. member_a (or admin) **unshares B**. Assert member_b receives **no further events** for subsequent edits (poll a collector array over a 5 s window).
3. Belt-and-braces: member_b's refetch of the plan now returns zero rows (the notify-then-refetch fallback is safe even if an event leaked).
4. member_c control: subscribed from the start, receives nothing at any point.
Document loudly in the spec header: if assertion 2 fails on the real stack, the app's notify-then-refetch design (Task 11) is the guaranteed safety net (never render event payloads) — but file it as a SECURITY finding, not a flake.

## 3. CI wiring
Extend `.github/workflows/ci.yml` `database-gates` job (do not create a new job): after the pgTAP step — install Playwright browsers (chromium only), build + start the app against the local stack (`NEXT_PUBLIC_SUPABASE_URL`/anon key from `supabase status`), run the E2E suites with `E2E_SUPABASE_URL` set. Keep the existing steps untouched.

## Constraints
- No service-role usage outside `global-setup.ts`. No `page.waitForTimeout` sleeps — use expect-polling.
- Selectors: `data-testid` attributes; list the testids Tasks 11/12 must expose in your `## NOTES` block so the coordinator can reconcile.
- Flag ambiguity with `<!-- TODO(coordinator): … -->`.
