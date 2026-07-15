## INTEGRATION NOTES

- Insert this section into Product PRD v0.2 after Functional Requirements and before Non-Functional Requirements.
- Heading is unnumbered (`## Testing Strategy`); apply section numbering at integration time.
- Replace `<!-- CLAUDE_SECTION: RLS_TEST_MATRIX -->` with the coordinator-authored RLS test matrix (do not invent matrix rows here).
- Aligns with D3 (portion calc as pure TS unit-test target), D9 (full pyramid), D10 (RLS matrix as CI-blocking Phase 1 criterion), D11 (edge cases covered by AC mapping, not restated here), D12 (deterministic unit conversion tests), D14 (shopping-list SQL as integration target), and the TS↔SQL contract test binding portion formula to SQL roll-ups.
- Phase success criteria in the Roadmap should reference the Phase 1 gates listed under “Per-Phase Expectations” (RLS matrix green, contract test green, §9.3 E2E green).
- Functional-requirement acceptance criteria (including edge cases) are authored elsewhere; this section only defines *how* each class of AC is covered at the appropriate pyramid layer.

---

## Testing Strategy

MenuBoss treats automated testing as a first-class product requirement, not an afterthought. The family depends on correct portion math, trustworthy household isolation, and reliable shared planning; regressions in those areas are product failures. The project therefore errs toward **too many tests rather than too few**. Every functional-requirement acceptance criterion maps to **at least one automated test** at the appropriate layer of the pyramid. A feature is not “done” until its acceptance criteria are covered by automated tests and those tests pass in CI.

Coverage is layered deliberately. Pure calculation and schema validation live at the unit layer so they run in milliseconds and pin correctness without a database. Multi-tenant authorization, set-based aggregation, and procedure contracts live at the integration layer against a real local Supabase instance so RLS and SQL behavior are never mocked away. End-to-end flows exercise the PWA the family actually uses, including mobile viewports and multi-browser shared-plan scenarios. Edge cases specified as acceptance criteria in Functional Requirements are not re-listed here; this strategy defines **how** each class of edge case receives coverage (unit, integration, E2E, or failure-mode suite).

Tools and targets are named product-level commitments: **Vitest** for unit and integration suites, **local Supabase via CLI** for integration fidelity, and **Playwright** for E2E over the documented §9.3 user flows and related critical paths. The goal is confidence that Phase 1 MVP features remain correct as the schema, RLS policies, and UI evolve—not ceremony for its own sake.

### Test Pyramid & Tooling

#### Unit (Vitest)

Unit tests cover pure, deterministic logic with no network or database dependency. Primary targets:

- **Portion calculation package (D3):** The flagship unit-test surface. Cover all PortionCategory combinations × athlete counts × FamilySettings changes (base protein ounces via PortionCategory, athlete multiplier). Explicit cases for zero-count categories, deactivated PortionCategories still readable on historical plans but excluded from new entry surfaces, and boundary athlete counts (`athlete_count` within `count`). Live recalculation behavior is asserted at the pure-function boundary so UI and procedures share one trusted implementation.
- **Unit conversion (D12):** Table-driven / property-style tests over the `Unit` lookup model. Within-dimension sums convert via `factor_to_base`; cross-dimension conversion falls back to the documented deterministic policy (no silent unit mash-ups); unknown or unsupported units fail closed with a clear error rather than inventing a conversion.
- **Zod schemas:** Valid, invalid, and boundary inputs for tRPC procedure inputs and shared domain shapes (counts ≥ 0, date ranges, soft enums, optional JSONB payloads such as `food_safety_profile` and `leftover_decay_path` structure at the validation boundary).
- **Pure UI logic:** Selection helpers, derived “shared” badge from household membership count, filter/query composition for search where it is pure, and other presentation logic free of I/O.

#### Integration (Vitest + local Supabase via CLI)

Integration tests run against a **local Supabase** instance started via the Supabase CLI so PostgreSQL, RLS, triggers, and SQL functions behave as in production. Primary targets:

- **Every tRPC procedure:** Happy path plus failure paths—invalid input (schema rejection), RLS-denied access (wrong household / unshared plan), and not-found. Procedures are exercised with real JWTs representing family users across households so authorization is never stubbed.
- **Database triggers and invariants:** Assignment-date constrained to parent MealPlan date range; audit / soft-delete behavior that keeps historical plans coherent; other documented check constraints that protect planning integrity.
- **`generate_shopping_list` SQL function (D14):** Multi-plan and multi-household fixtures that assert ingredient aggregation, portion-scaled quantities, deduplication, and visibility respect (shared vs private plans). This is the primary set-based integration target for shopping and related roll-ups.
- **TS ↔ SQL contract test:** Shared fixtures drive the pure TypeScript portion formula (D3) and the SQL shopping/roll-up implementation (D14) and **require identical numeric outputs**. This pin prevents silent drift between client/server calculation and database aggregation. The contract test is a non-skippable CI gate (see CI Gates).

#### E2E (Playwright)

End-to-end tests drive the React PWA through the product’s critical journeys. Coverage includes:

- **§9.3 Flow — Plan a Shared Meal:** Calendar → add to plan → search/browse with safety notes visible → adjust portion counts → live protein total → share with specific households → save → second household observes the update.
- **§9.3 Flow — Capture & Use a Leftover Idea:** Open recipe after cooking → add leftover decay path entries → another family member views suggested repurposing options and links.
- **§9.3 Flow — Capture a ChefIdea:** Capture Idea form with tags → later search/browse finds the idea alongside recipes.
- **Shopping-list generation:** From one or more MealPlans with portion-adjusted, consolidated quantities.
- **Calendar realtime propagation:** Two browser contexts (two households/users) verifying that a shared-plan edit appears for authorized participants and does not leak to non-members.
- **Mobile-viewport runs:** Playwright projects at phone/tablet sizes; MenuBoss is mobile-first PWA, so critical flows must pass on mobile viewports, not desktop alone.

#### RLS Test Matrix

Row Level Security is the sole authorization authority. The RLS test matrix is a **CI-blocking Phase 1 acceptance criterion**. Matrix content is coordinator-authored and must not be duplicated here.

<!-- CLAUDE_SECTION: RLS_TEST_MATRIX -->

### Failure-Mode Coverage

Beyond happy-path and standard AC mapping, the following operational failure modes have explicit automated coverage expectations:

| Failure mode | Expectation | Primary layer |
| --- | --- | --- |
| **Offline cache serving stale reads** | v1 offline is **read-only**: cached recipes, upcoming plans, and portion guidance remain readable; write attempts are blocked or deferred with clear UX. Tests assert stale-but-safe reads and no silent offline writes. | E2E (+ unit for cache policy helpers where pure) |
| **Realtime disconnect / reconnect** | Shared calendar recovers after connection loss: missed updates reconcile; UI sync state is honest during disconnect. | E2E (two contexts) + integration where channel/subscription helpers are testable |
| **Concurrent edits to a shared plan (online)** | Last-write and conflict behavior is defined and tested so two authorized users editing the same plan do not corrupt assignments or portion requirements. | Integration + E2E |
| **Soft-deleted entities in historical views** | Soft-deleted recipes/ingredients remain visible in historical meal plans and shopping lineage where product rules require it, but are hidden from active browse/search. | Integration + E2E |

Additional edge-case classes (zero portions, deactivated categories, empty membership invariants, invalid date ranges, etc.) are specified as acceptance criteria under Functional Requirements and are covered at the unit or integration layer according to whether the behavior is pure calculation or DB/RLS-enforced.

### CI Gates

All automated suites **block merge** to the main integration branch:

1. **Unit (Vitest)** — must be green.
2. **Integration (Vitest + local Supabase)** — must be green, including procedure failure paths and SQL function fixtures.
3. **E2E (Playwright)** — must be green for required §9.3 flows, shopping-list generation, realtime dual-context scenarios, and mobile-viewport projects in the required set.
4. **RLS test matrix** — **non-skippable**. Failures block merge; the matrix is not an optional “nightly only” suite.
5. **TS ↔ SQL contract test** — **non-skippable**. Portion formula and SQL roll-up/shopping outputs must match on shared fixtures.

**Migration policy:** Any migration that adds tables or RLS policies **must extend the RLS test matrix in the same PR**. PRs that introduce new protected entities or policies without corresponding matrix cases fail review and CI policy checks. Similarly, changes to portion calculation or shopping/roll-up SQL require updating shared contract fixtures when behavior intentionally changes (documented fixture updates, not silent skew).

### Per-Phase Expectations

**Phase 1 (MVP / Foundation):** Full pyramid for all Phase 1 MVP features (recipes & ingredients, categories/tags, portion scaling, food safety surfacing, MealPlan + calendar, shared/private via household membership, RecipeCombination, ChefIdea, leftover decay paths, basic shopping list generation, PWA foundation, core search/filter).

**Phase 1 success criteria (testing):**
- RLS test matrix **green** (CI-blocking).
- TS ↔ SQL contract test **green** (CI-blocking).
- §9.3 E2E flows **green** (plan shared meal; leftover idea; ChefIdea), plus shopping-list generation and dual-context calendar realtime.
- Unit coverage green for portion-calc (D3) and unit conversion (D12); integration green for `generate_shopping_list` and tRPC procedure happy/failure paths for shipped procedures.
- Offline: read-only cache behavior covered for core recipe and plan reads.

**Phase 2:** Add coverage for offline-write sync (when writes leave read-only offline), conflict scenarios under improved offline/background sync, enhanced shopping-list persistence/check-off flows, and expanded admin tooling paths. Existing Phase 1 gates remain mandatory; new suites extend, not replace, them.

**Phase 3+:** Extend the pyramid for each new capability (AI-assisted flows, multi-macro nutrition, pantry) with the same AC-to-test mapping rule; no feature ships without automated coverage at the appropriate layer.
