# Brief for Grok — Task 16 (Wave 3): PWA read-only offline, global search, performance-budget E2E

**Context:** The last Phase 1 feature block. Decision D4 is a hard boundary: v1 offline is **READ-ONLY** — no offline writes, no background sync, no queued mutations. Anything write-shaped while offline shows a clear "you're offline — changes can't be saved yet" state.

**Attachments required:** `Product_PRD_v0.2.md` (§3.1, §6.8 offline strategy, §8.8 search, §12 performance budgets P1–P5, §13.2 success criteria).

**Output:** one markdown file, saved as `drafts/grok_out_pwa_search_perf.md`, files as `### FILE:` headers + fenced blocks. Wave 2 conventions.

## 1. PWA read-only offline (D4 — §6.8)
- Service worker via **@serwist/next** (maintained successor to next-pwa/Workbox; if it conflicts with Next 16, fall back to hand-rolled `public/sw.js` + manual registration and say so in NOTES).
- `manifest.webmanifest`: name MenuBoss, icons (generate simple maskable SVG-based placeholder icons), standalone display, theme color.
- Caching strategy — read paths only:
  - App shell + static assets: stale-while-revalidate.
  - tRPC GET/query responses for recipes, chefIdeas, categories/tags, upcoming plans + portion breakdown, ingredient safety profiles: network-first with cache fallback (TanStack Query persister via `@tanstack/react-query-persist-client` + localStorage/IDB is acceptable and simpler than SW-level API caching — choose one, justify in NOTES).
  - NEVER cache or replay POST/mutation requests. No background sync registration anywhere.
- Offline UX: global offline banner; calendar degrades gracefully (cached range renders, other ranges show offline empty-state, §6.8); all save buttons disabled with tooltip while offline; portion preview still works offline (pure portion-calc, D3).
- Reconnect: invalidate all queries (fresh RLS-filtered data replaces cache).

## 2. Global search (§8.8 polish)
- Header search (desktop) / search tab sheet (mobile): one input querying recipes + chefIdeas + combinations + ingredients in parallel (existing list procedures with `q`), grouped results with type badges, keyboard navigation, recent-searches (localStorage).
- Results respect the D7 model automatically (family-global content; no plan data in search).

## 3. Performance-budget E2E (§12 P1–P5 — wire the numbers to CI)
Extend the Playwright suite (same env-guards as Wave 2 E2E):
- `perf-budgets.spec.ts`: P1 calendar interactive < 1.5 s (warm run, `performance.now` bracketed navigation), P2 shopping list generation < 2 s for the seeded multi-plan fixture, P4 search results < 500 ms, P5 realtime propagation < 2 s (reuse the Wave 2 two-context pattern's timing).
- P3 (portion preview < 100 ms) as a Vitest micro-benchmark on `calculateEffectiveProteinOz` + PortionGrid re-render (loose assert < 100 ms for 50 recomputes).
- Budgets in one exported constants file `apps/web/e2e/budgets.ts` so numbers live in one place; each spec message cites the §12 budget id.
- CI note in NOTES: these run in the existing database-gates job after the Wave 2 E2E step; flaky-margin guidance (soft-fail warning at budget, hard-fail at 2× budget) — implement the 2× hard threshold, log the raw timing always.

## Constraints
- D4 is non-negotiable: reviewers will grep for background-sync/mutation-queue code; none may exist.
- No new heavy deps beyond serwist (or none, if hand-rolled) and the query persister.
- Flag ambiguity with `<!-- TODO(coordinator): … -->`.
