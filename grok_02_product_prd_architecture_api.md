# Brief for Grok — Task 02: Rewrite Product PRD Architecture & API Sections

**You are revising sections of a document you originally authored.** A design review of the MenuBoss PRDs completed on 2026-07-14 made sixteen decisions. Your task: produce replacement text for the Product PRD's **§4 (Assumptions and Constraints), §6 (Architecture Deep-Dive, all subsections), and §10 (API & Backend Contracts — the section starting "10.1 Recommended API Style")**.

**Attachment required:** `Product_PRD_v0.1.md`.

**Output:** a single markdown file the user will save as `drafts/grok_out_product_architecture.md`. Begin with an `## INTEGRATION NOTES` block (one line per change), then the three replacement sections, each under a clear delimiter heading: `=== REPLACEMENT: §4 ===`, `=== REPLACEMENT: §6 ===`, `=== REPLACEMENT: §10 API ===`.

---

## Decision register (items you are implementing are bolded)

- **D1** RLS is the *sole* authorization authority. Every backend procedure uses a Supabase client carrying the **caller's JWT**; there is NO service-role path in request handling (service role = migrations/audit jobs only). Backend does not re-validate visibility — RLS does.
- **D2** Backend = **tRPC hosted inside the Next.js app** (route handlers). No standalone NestJS. Supabase Edge Functions explicitly **not used in v1** (remove them as an alternative; they may be mentioned once under future extensibility).
- **D3** Portion calculation = **one pure TypeScript function in a shared package** (e.g., `packages/portion-calc`), imported by the UI live preview, tRPC procedures, and offline cache. Persisted totals are cached derived values, recomputed when FamilySettings/PortionCategory change.
- **D4** v1 offline = **read-only cache** (recipes, upcoming plans, portion guidance, safety notes). Offline writes, background sync, and conflict resolution move to Phase 2. Optimistic UI updates remain for *online* use.
- **D5** Per-plan portion counts are normalized rows: `MealPlanPortionRequirement` (`portion_category_id`, `count`, `athlete_count`). API inputs/outputs use arrays of these rows — no `protein_portions` JSONB anywhere.
- **D6** Plan visibility = `MealPlanHousehold` junction rows. API input: `householdIds: string[]`. `is_shared` is derived (membership count > 1), not a stored/input field.
- **D7** Recipes/Ingredients/ChefIdeas/Combinations are family-global; only MealPlans have visibility semantics.
- **D8** MealPlan has `start_date`/`end_date`; assignments have `assignment_date` within that range.
- **D12** Unit conversion is deterministic within a dimension (mass/volume/count via `factor_to_base`); cross-dimension pairs are listed separately, never guessed.
- **D14** Shopping-list aggregation + weekly protein roll-up = a single set-based SQL function (`generate_shopping_list`), SECURITY INVOKER so RLS filters it. Backend only formats results and applies the D12 separate-lines fallback.
- D9–D11, D16: testing and NFR sections are other tasks — do not write them, but §6/§10 may reference "see Testing Strategy section".

## Section instructions

### §4 Assumptions and Constraints
- Stack line becomes: React PWA built with **Next.js, hosting tRPC procedures in the same app** + Supabase (PostgreSQL). Reference Database PRD **v0.4**.
- Auth bullet: RLS is the sole authorization authority (D1); detailed policies now specified in DB PRD v0.4 §7 (no longer "will be defined in subsequent architecture work").
- Data-model bullet: hybrid relational + JSONB, but note JSONB is now limited to `food_safety_profile`, `leftover_decay_path`, `nutrition_data`, `FamilySettings.other_global_defaults` (D5/D6 normalized the rest).

### §6 Architecture Deep-Dive (full rewrite of all subsections)
- **6.1:** update guiding principles — single deployable, RLS-as-sole-authority.
- **6.2 Frontend:** keep framework/state/UI/calendar/forms content, but PWA features = installable + **read-only offline caching** (D4); remove "background sync for edits made while offline"; optimistic updates apply online.
- **6.3:** retitle **"Server Layer (tRPC in Next.js)"**. Remove NestJS and the Edge Functions hybrid option. Responsibilities: input validation (Zod), orchestration of the shared `portion-calc` package (D3), calling `generate_shopping_list` (D14), admin operations, future AI orchestration. Explicitly: procedures execute with the caller's JWT; authorization belongs to RLS (D1).
- **6.4:** unchanged in spirit; update JSONB strategy sentence (narrowed scope per D5/D6) and note indexing is by query pattern (DB PRD v0.4 §6).
- **6.5:** Pattern 2 becomes "via tRPC procedures in the Next.js app (user-context Supabase client)". Rewrite the example data flow: backend validates *input shape* (Zod), computes portion totals with the shared function, writes plan + `MealPlanHousehold` + `MealPlanPortionRequirement` rows **under the user's JWT — RLS authorizes the write**; Realtime broadcasts to authorized subscribers.
- **6.6 Security:** RLS sole authority; service role never in request paths; audit via triggers; reference DB PRD v0.4 §7 for policy shapes and the RLS test matrix.
- **6.7 table:** Backend row → "tRPC in Next.js (single deployable)"; Offline row → "Workbox/next-pwa — read-only cache v1"; remove NestJS mention.
- **6.8 Offline & PWA:** read-only strategy (D4): what is cached, cache invalidation on reconnect, calendar graceful degradation, and an explicit note that offline *editing* is a Phase 2 feature contingent on a conflict-resolution design.
- **6.9 Future extensibility:** AI orchestration stays; Edge Functions may be mentioned here only as a possible future venue.

### §10 API & Backend Contracts
- **10.1:** tRPC confirmed (no longer "recommended vs alternatives") — hosted in the Next.js app.
- **10.2:** router list unchanged, minus any wording implying a separate service.
- **10.3 procedures:** update signatures: `mealPlan.createOrUpdate` input = plan fields (`startDate`, `endDate`), assignments array, `portionRequirements: Array<{portionCategoryId, count, athleteCount}>` (D5), `householdIds: string[]` (D6); logic = Zod validation → shared portion-calc → persist under user JWT (D1). `mealPlan.generateShoppingList` = thin wrapper over the `generate_shopping_list` SQL function (D14), applying D12 formatting. Remove `protein_portions` JSONB from all examples.
- **10.4 responsibility table:** update rows to match (RLS enforcement row: "RLS (sole authority)"; shopping list row: "SQL function + tRPC formatting").
- **10.5:** procedures receive the user's Supabase session; **no service-role usage in request handling** (D1); Zod on all inputs.
- **10.6:** AI routers future; Edge Functions only as a possible future note.

## Constraints
- Preserve the document's voice and heading numbering exactly (§ numbers will be re-mapped later by another task — keep the current numbers).
- Do not invent features. Where uncertain, insert `<!-- TODO(coordinator): question -->`.
- Do not write the Testing Strategy, NFR, roadmap, or functional-requirement sections — other tasks own those.
