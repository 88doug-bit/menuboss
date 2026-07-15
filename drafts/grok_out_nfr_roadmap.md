## INTEGRATION NOTES

- Insert Part 1 as a new unnumbered `## Non-Functional Requirements` section; final numbering assigns it **§12** (after Testing Strategy §11, before Roadmap §13).
- Replace existing `## 11. Roadmap & Phasing` body with Part 2; renumber heading/subsections to **§13** per the hygiene map (Part 3).
- Delete the six orphaned NFR bullets currently at the end of §11 (lines 572–577 in Product PRD v0.1); content lives only in Part 1.
- Apply Part 3 hygiene checklist in full before declaring Product PRD v0.2 complete (header, renumbering, risks, references, terminology sweep).
- Do **not** author Testing Strategy here — placement only: new §11 between API (§10) and NFR (§12).
- Architecture reflections baked into roadmap (not separate rewrites of §4/§6/§10): D2 (tRPC in Next.js — no separate backend workstream), D5/D6 (normalized portion + visibility tables), D14 (shopping list = SQL function), D4 (read-only offline in Phase 1), D9/D10 (RLS matrix + E2E as Phase 1 gates), D16 (budget table in NFR; Phase 1 success cites budgets met).

---

=== PART 1: NFR SECTION ===

## Non-Functional Requirements

These requirements promote the former end-of-roadmap quality bullets into testable product constraints. Performance budgets (D16) are E2E-testable acceptance criteria for Phase 1 unless a row explicitly names another verification method.

### Usability & Extensibility

- Family admins must be able to add, edit, deactivate, and reorder categories, portion profiles (`PortionCategory`), units, tags, and food-safety guidance **without code changes or migrations** for routine vocabulary growth.
- Primary weekly workflows (view calendar week, adjust portion counts, generate shopping list, capture a ChefIdea) must be completable on a phone without desktop-only affordances.
- Empty, loading, error, and offline states must be explicit and actionable (never silent failure).
- Extensibility for future AI/orchestration must not require reworking the core MealPlan, portion, or visibility model (hooks via tRPC routers and stable SQL aggregation contracts).

### Performance

All budgets below replace vague “fast” / “feels fast” language. Phase 1 success requires these budgets to be met under the stated conditions. Verification methods are named per row.

| # | Scenario | Budget | Conditions | Verification |
|---|----------|--------|------------|--------------|
| P1 | Calendar week view interactive | **< 1.5 s** | Mid-range phone; cold PWA launch with warm application cache (service-worker-cached shell + recently used plan data) | Playwright E2E: time from navigation start to calendar interactive (controls usable, week grid rendered) |
| P2 | Shopping-list generation | **< 2 s** | 7-day multi-household plan set (shared + private plans in range); response ready for UI render | Playwright E2E (or integration timing of `generate_shopping_list` + tRPC format path if E2E harness is flaky): request → structured list displayed |
| P3 | Portion live-preview recompute | **< 100 ms** | Changing a single portion count or athlete count; pure client recompute via shared portion-calc package | Unit/micro-benchmark (Vitest) of the pure TypeScript function over representative fixtures; UI must not debounce beyond this for simple count edits |
| P4 | Search results | **< 500 ms** | Typical family corpus (hundreds of recipes + ChefIdeas); typed query returns first page of matches | Playwright E2E: keystroke-settled query → results list populated |
| P5 | Realtime propagation of shared-plan edits | **< 2 s** end-to-end | Two concurrent sessions (editor + observer in another household with membership); online | Playwright E2E with two browser contexts: save on A → visible update on B within budget |

Notes:
- Budgets are product acceptance criteria, not aspirational SLOs. Regressions that breach a budget fail CI the same way as functional regressions.
- Aggregation work for shopping lists and weekly protein roll-ups is performed by set-based SQL (`generate_shopping_list` and related functions per Database PRD v0.4 / D14); the application layer must not re-implement row-by-row aggregation that would make P2 unachievable.
- Portion live preview (P3) uses the shared pure TypeScript package (D3) so UI and server stay aligned without a network round-trip for every keystroke.

### Security & Privacy

- **RLS is the sole authorization authority** for data access. Every request-path Supabase client carries the caller’s JWT; there is no service-role path in interactive request handling (service role is limited to migrations and non-request audit jobs). Details: Database PRD v0.4 §7.
- Household isolation is absolute for private plans: a household must never read another household’s private MealPlans or memberships they are not party to. Shared plans are visible only to households with explicit `MealPlanHousehold` membership.
- The **RLS test matrix is a CI-blocking gate** (D10). Phase 1 is not complete until the matrix is green in continuous integration. Matrix placement and cases live in the Testing Strategy section (and coordinator-authored RLS matrix content).
- Family-level admin controls (settings, safety curation, vocabulary) are role-gated and audit-friendly (soft deletes + recommended triggers on sensitive tables).

### Reliability

- Soft deletes (or equivalent non-destructive deactivation) for recipes, plans, and reference data so historical meal plans remain interpretable.
- Assignment dates must remain within the parent MealPlan’s `[start_date, end_date]` range (DB trigger is authoritative; application validation is UX-only).
- Shared-plan concurrent edits (online) must not corrupt membership or portion-requirement rows; last-write semantics for a given row are acceptable in v1 if the UI surfaces save/sync status clearly.
- Offline behavior must degrade gracefully: never claim a write succeeded when the client is offline in v1 (see PWA / Offline).

### PWA / Offline

Per **D4**, v1 offline is **read-only cache**:

- **Cached for offline read:** recipes (recently viewed / starred / planned), ChefIdeas, categories/tags needed to render those entities, upcoming MealPlans the user can already see online, portion guidance, and food-safety notes for cached ingredients.
- **Not in v1:** offline writes, write queues, background sync of edits, or conflict resolution. Those move to Phase 2 and require an explicit conflict-resolution design first (merge strategy + user-visible conflict UX).
- Calendar and plan views **degrade gracefully** when offline (show last cached data with a clear offline indicator; disable mutating controls).
- Online optimistic updates remain allowed and expected; they are not a substitute for offline write support.
- App must be **installable** (PWA) on phone and desktop; installability is independent of offline write capability.

### Maintainability

- Single deployable application: **Next.js hosts the React PWA and tRPC procedures** (D2). No standalone NestJS service and no v1 Supabase Edge Functions workstream.
- Clean separation: UI and tRPC orchestration in the app; pure domain math in shared packages (e.g., portion-calc); set-based aggregation in PostgreSQL functions; authorization in RLS.
- End-to-end TypeScript type safety (tRPC + Zod) for procedure boundaries; SQL contracts covered by integration and TS↔SQL portion contract tests (see Testing Strategy).
- Schema and policy changes ship with tests in the same change set (migrations that add tables/policies extend the RLS matrix in the same PR).

---

=== PART 2: §11 ROADMAP ===

## 11. Roadmap & Phasing

<!-- Integrator: renumber this section to §13 (### 13.1–13.6) per Part 3 hygiene map. Keep subsection titles; only numbers change. -->

### 11.1 Guiding Principles for Phasing

- Deliver a usable core experience as quickly as possible (MVP that the family can actually use for weekly planning).
- Prioritize features that provide immediate daily value (portion scaling, shared calendar, food safety surfacing, basic shopping lists).
- Build extensibility foundations early (categories, tags, normalized portion/visibility tables, constrained JSONB) so later features can leverage them without rework.
- Treat **testing and performance budgets as Phase 1 deliverables**, not follow-on polish (D9/D10/D16).
- Defer complex or lower-frequency features (advanced AI, full pantry tracking, detailed multi-macro nutrition, offline writes) to later phases.
- Prefer one clear implementation path: **tRPC inside Next.js**, RLS as sole auth authority, shopping-list aggregation in SQL — no parallel “maybe NestJS / maybe Edge Functions” backend tracks in Phase 1 (D2).

### 11.2 Phase 1 – Foundation (MVP)

**Goal:** A working system the family can use for recipe management, portion-aware meal planning across households, and basic shopping list generation — with security, tests, and performance budgets proven in CI.

**Key Features:**
- Recipe & Ingredient CRUD with hierarchical categories and flexible tagging (family-global content).
- Food safety profiles on ingredients (FDA-style mercury guidance + frequency recommendations) with contextual display.
- Editable portion defaults via **PortionCategory** base ounces and **FamilySettings.athlete_multiplier** (admin-curated rows; no duplicate adult-base field).
- MealPlan as a date-ranged container with **normalized `MealPlanPortionRequirement` rows** (`portion_category_id`, `count`, `athlete_count`) and automatic totals via the shared portion-calc package (no `protein_portions` JSONB).
- Shared vs. private MealPlans via **`MealPlanHousehold` membership** (shared-ness derived from membership count > 1), RLS enforcement, and realtime calendar updates.
- Basic RecipeCombination support (grouping recipes into complete meals with notes and 1–5 rating).
- ChefIdea capture with full tagging support.
- Leftover decay path recording on recipes.
- Shopping list generation from one or more MealPlans via the **`generate_shopping_list` SQL function** (D14); tRPC formats results and applies within-dimension unit conversion / cross-dimension separate lines (D12).
- **PWA foundation:** installable app + **read-only offline cache** of recipes, upcoming plans, portion guidance, and safety notes (D4). Offline writes and background sync are **out of scope for Phase 1**.
- Core search and filtering.
- Testing infrastructure and CI gates per Testing Strategy (unit / integration / E2E / RLS matrix).

**Success Criteria:**
- Family can plan a full week (shared + private) and generate a shopping list.
- Portion calculations work correctly for mixed adult/child/athlete households (including athlete_count within count).
- Food safety notes appear when relevant ingredients are used.
- Realtime updates work reliably for shared plans (within performance budget P5).
- **RLS test matrix green in CI** (D10).
- **TS↔SQL portion contract test green** (shared pure function and SQL roll-up agree on fixtures).
- **§9.3 E2E flows green** (plan a shared meal; capture & use a leftover idea; capture a ChefIdea), plus shopping-list and dual-context realtime coverage as defined in Testing Strategy (D9).
- **Performance budgets met** (NFR Performance table, D16): calendar week < 1.5 s, shopping list < 2 s, portion live-preview < 100 ms, search < 500 ms, realtime propagation < 2 s.

**Estimated Effort:** Highest priority — aim for a functional alpha within 4–8 weeks depending on team size. No separate backend service workstream: API surface is tRPC route handlers in the Next.js app (D2).

### 11.3 Phase 2 – Polish & Core Value Expansion

**Goal:** Improve daily usability, reduce friction, and expand the “chef tools” that make the system feel like a true family knowledge base. Introduce offline editing only after conflict behavior is designed.

**Key Features:**
- Enhanced shopping list experience (better grouping, check-off, export, optional persistence).
- Improved RecipeCombination workflow and template reuse.
- Stronger surfacing of leftover decay paths and ChefIdeas in relevant contexts.
- **Offline editing + background sync**, **preceded by** an explicit **conflict-resolution design** (documented decision: merge strategy, last-write vs. field-merge rules, and user-visible conflict UX). Until that design is approved, offline remains read-only.
- Better mobile/PWA experience (cache invalidation polish, install/update UX, meeting and holding performance budgets under wider data volumes).
- Admin tools for easier management of categories, PortionCategories, Units, and food safety data.
- Basic nutrition roll-ups beyond just protein (optional).
- Make-again ratings influencing discovery (“Family Favorites” views).
- Refined calendar UX and filtering.

**Success Criteria:**
- Family actively uses ChefIdeas and leftover decay paths as part of their normal workflow.
- Shopping list generation becomes a regular, trusted part of meal planning.
- Mobile experience meets the NFR **performance budget table** under representative family data (not subjective “feels fast”).
- If offline editing ships in this phase: conflict-resolution design is documented, implemented, and covered by automated tests (including multi-tab / reconnect scenarios).

### 11.4 Phase 3+ – Advanced Capabilities & AI

**Goal:** Add intelligence and deeper automation while leveraging the strong data foundation built in Phases 1–2.

**Potential Features:**
- AI-assisted features:
  - Recipe suggestions based on available ingredients, preferences, or past ratings
  - Intelligent substitution recommendations
  - Auto-generation or enhancement of meal plans
  - Summarization or improvement of ChefIdeas
- Full multi-macro / detailed nutritional tracking and goals
- Pantry / inventory tracking with expiry and waste reduction suggestions
- More advanced reporting (weekly nutrition summaries, waste reduction metrics)
- Richer integration between RecipeCombinations, decay paths, and meal planning
- Potential external integrations (grocery delivery, smart kitchen devices)
- **Density-based cross-dimension unit conversion** (mass ↔ volume via density tables) — Phase 3 candidate only; v1/v2 keep strict within-dimension conversion with separate lines for cross-dimension pairs (D12).
- **Protein-driven automatic recipe scaling** (scale full ingredient lists from protein targets) — requires reliable tagging/identification of protein ingredients; explicit Phase 3+ candidate, not implied by v1 portion math.

**Success Criteria:**
- AI features provide genuine time savings without feeling gimmicky.
- The system measurably helps reduce food waste and decision fatigue.
- Any cross-dimension conversion or auto-scaling ships with clear provenance (density sources, which ingredients are “protein drivers”) and automated tests.

### 11.5 Dependencies & Sequencing Notes

- Phase 1 depends on a solid database schema per **Database PRD v0.4** (`Recipe_Meal_Planning_Database_PRD_v0.4.md`), including normalized `MealPlanPortionRequirement` / `MealPlanHousehold` / `Unit`, and working RLS + Realtime.
- The **RLS test matrix is a Phase 1 gate**, not an afterthought: schema/policy work is incomplete until the matrix is green in CI (D10).
- Food safety profiles and portion calculation (shared TypeScript package + SQL roll-up contract) should be built early — they influence shopping lists, calendar summaries, and many later features.
- Shopping-list correctness depends on the D14 SQL function and D12 unit rules; UI-only aggregation is not an acceptable Phase 1 path.
- RecipeCombination and ChefIdea features have relatively low dependencies and can be added in parallel with core meal planning once auth/RLS and basic recipe CRUD exist.
- Offline writes (Phase 2) depend on completing the conflict-resolution design task before implementation.
- AI features (Phase 3) should only begin once the core data model and user workflows are stable and well-understood.
- There is **no separate NestJS or Edge Functions delivery track** in Phase 1–2; optional Edge Functions remain a future hosting note only (architecture D2).

### 11.6 Overall Philosophy

This roadmap is intentionally front-loaded with high-value, frequently used features while keeping the system extensible and **provably correct** (tests + budgets). The family should feel the benefit of the app early — better portion accuracy, easier shared planning, safety awareness, and knowledge capture — rather than waiting for a “perfect” v1 that includes offline editing or AI.

The phased approach also allows for learning and adjustment based on real family usage before investing heavily in offline conflict systems, density conversion, automatic full-recipe scaling, or advanced AI capabilities.

<!-- Orphaned NFR bullets formerly here are deleted; see Part 1 Non-Functional Requirements. -->

---

=== PART 3: HYGIENE MAP ===

## Hygiene map (integrator checklist)

Apply in order. Check off each item. This section is **instructions**, not prose for the PRD body.

### 1. Renumbering

**Problem:** Two “Section 10”s exist in v0.1 — `## 10. API & Backend Contracts` (~line 422) and `## 10. Risks, Open Questions & Next Steps` (~line 579). Testing Strategy and NFR are new.

**Proposed final section order:**

| Final # | Title | Source |
|--------:|-------|--------|
| 1 | Overview and Purpose | unchanged |
| 2 | Goals and Success Metrics | unchanged |
| 3 | Scope | unchanged |
| 4 | Assumptions and Constraints | unchanged (content may be replaced by Task 02 draft) |
| 5 | User Personas and Key Use Cases | unchanged |
| 6 | Architecture Deep-Dive | unchanged (content may be replaced by Task 02 draft) |
| 7 | Data Model Reference | unchanged |
| 8 | Detailed Functional Requirements | unchanged (content may be replaced by Task 04 draft) |
| 9 | UI/UX & Interaction Requirements | unchanged |
| 10 | API & Backend Contracts (High-Level) | was §10 API; **number stays 10** |
| 11 | Testing Strategy | **NEW** (Task 03 draft only — do not invent body here) |
| 12 | Non-Functional Requirements | **NEW** (Part 1 of this file) |
| 13 | Roadmap & Phasing | was §11 → **§13** (Part 2 of this file) |
| 14 | Risks, Open Questions & Next Steps | was duplicate §10 → **§14** |
| — | Appendix A: Incorporated Database PRD | appendix (unnumbered or “Appendix A”) |

**Subsection renumbers (Roadmap):**

| Old | New |
|-----|-----|
| 11.1 Guiding Principles for Phasing | 13.1 |
| 11.2 Phase 1 – Foundation (MVP) | 13.2 |
| 11.3 Phase 2 – Polish & Core Value Expansion | 13.3 |
| 11.4 Phase 3+ – Advanced Capabilities & AI | 13.4 |
| 11.5 Dependencies & Sequencing Notes | 13.5 |
| 11.6 Overall Philosophy | 13.6 |

**API subsections:** `10.1`–`10.6` remain `10.1`–`10.6` (only Risks moves off “10”).

**Internal cross-references to update (`old → new`):**

| Location (v0.1 anchor) | Old reference | New reference |
|------------------------|---------------|---------------|
| Important Note (header block) | Database PRD **v0.3** (see Section 7 and Appendix A) | Database PRD **v0.4** (see Section 7 and Appendix A) — section number unchanged |
| §4 Assumptions, stack bullet | Database PRD **v0.3** (see Section 7) | Database PRD **v0.4** (see Section 7) |
| §4 Data Model bullet | Database PRD **v0.3** | Database PRD **v0.4** |
| §6.4 Core Database | Database PRD **v0.3** | Database PRD **v0.4** |
| §7 Data Model Reference | Database PRD **v0.3** / `..._v0.3.md` | Database PRD **v0.4** / `Recipe_Meal_Planning_Database_PRD_v0.4.md` |
| §10 API closing sentence | “aligned with the data model defined in the Database PRD” | keep wording; ensure nearby explicit version is **v0.4** if version is stated |
| §11.5 Dependencies (after Part 2 insert) | was v0.3 | already **v0.4** in Part 2; after renumber becomes **§13.5** |
| Any prose “Section 11” / “§11 Roadmap” introduced by drafts | §11 Roadmap | **§13 Roadmap** |
| Any prose “Section 10 Risks” / “§10 Risks” | §10 Risks | **§14 Risks** |
| Success criteria / Testing Strategy referring to UI flows | §9.3 | **§9.3** (unchanged) |
| NFR / Security referring to DB policies | DB PRD §7 | DB PRD **v0.4 §7** (version bump only) |
| Architecture/API drafts that say “see Testing Strategy section” | unnumbered | after integration: **§11 Testing Strategy** |
| Architecture/API drafts that say “see Non-Functional Requirements” or “performance budget table” | unnumbered | after integration: **§12 Non-Functional Requirements** |
| §3.3 Phased Approach (summary bullets) | Phase 2 “PWA offline improvements”; Phase 3 “fuller scaling” | Align summary with §13: Phase 1 read-only offline; Phase 2 offline edit + conflict design; Phase 3+ density conversion + protein-driven scaling candidates <!-- TODO(coordinator): whether §3.3 is rewritten in-line or left as short pointer to §13 --> |

**Insertion order for integrator:**
1. Apply Task 02/04 content replacements under existing headings if those drafts are ready.
2. Insert Testing Strategy as **§11**.
3. Insert NFR (Part 1) as **§12**.
4. Replace Roadmap with Part 2; renumber to **§13**.
5. Renumber Risks to **§14**; apply cleanup in checklist item 2.
6. Sweep terminology (item 5) and references (item 4).

### 2. Risks / Open Questions cleanup

**Key Risks — update:**

| Action | Item |
|--------|------|
| **Update** | Over-engineering risk: note that the **2026-07 design review pared v1 scope** — offline writes / background sync deferred to Phase 2 (D4); portion and visibility models **normalized** (D5/D6) instead of flexible JSONB; single Next.js+tRPC deployable (D2). Mitigation remains focused scope + extensibility, now with explicit deferrals. |
| **Keep** | Complexity of multi-household portion aggregation and visibility — addressed by `MealPlanPortionRequirement` + `MealPlanHousehold` + RLS matrix gate. |
| **Keep** | Keeping food safety guidance current — family admin curation + source attribution in JSONB. |

**Open Questions — remove (resolved):**

| Remove | Resolution |
|--------|------------|
| Exact split of logic between React frontend, Node backend, and Supabase Edge Functions | **D2:** tRPC in Next.js; Edge Functions not in v1 |
| Detailed RLS policy design and auth flows | **Database PRD v0.4 §7** + RLS test matrix (D1/D10) |
| Prioritization and detailed specs for **shopping list generation** | **D12/D14** (and Functional Requirements / SQL function contract) — remove shopping-list half only |

**Open Questions — keep / rewrite:**

| Keep | Notes for integrator wording |
|------|------------------------------|
| Prioritization of **nutrition roll-ups** (beyond protein) | Still open; shopping-list side is decided |
| UI/UX patterns for surfacing food safety notes and leftover decay paths without clutter | Still open |
| Roadmap timing for AI-assisted features | Still open (Phase 3+ candidates only) |

**Immediate Next Steps — refresh suggestions:**

- Integrate design-review drafts (architecture, functional ACs, testing strategy, NFR/roadmap) into Product PRD v0.2.
- Implement Phase 1 against Database PRD v0.4 with RLS matrix and performance budgets as CI gates.
- Produce wireframes for key screens (calendar, plan editor / portion counts, shopping list, ChefIdea capture) using normalized portion/visibility UX (household multi-select; portion requirement rows).
- Schedule Phase 2 **conflict-resolution design** spike before any offline-write implementation.

### 3. Header / version

Update document header fields:

```markdown
**Document Version:** 0.2  
**Date:** July 15, 2026  
**Status:** Draft — design review revisions integrated  
**Author:** Grok + Claude (design review revisions)  
```

**Changelog block** (≤8 lines summarizing the 16 decisions) — insert after author / audience lines:

```markdown
**Changes in v0.2 (2026-07 design review):**  
- Auth: RLS sole authority; user-JWT clients only on request paths (D1).  
- Stack: tRPC hosted in Next.js; no NestJS; no v1 Edge Functions (D2).  
- Domain: shared pure portion-calc package (D3); v1 offline = read-only cache (D4).  
- Schema: normalized MealPlanPortionRequirement (D5) and MealPlanHousehold (D6); family-global content (D7); plan date ranges (D8).  
- Quality: Testing Strategy + CI gates (D9); RLS matrix Phase 1 blocker (D10); edge cases as FR acceptance criteria (D11).  
- Ops rules: deterministic Unit conversion (D12); query-pattern indexes (D13); shopping list SQL function (D14); category CTEs (D15).  
- NFR: concrete performance budgets (D16); PortionCategory base ounces single source (D17).  
- Structure: Testing Strategy §11, NFR §12, Roadmap §13, Risks §14; Database PRD reference → v0.4.  
```

Also update the Important Note block to cite **Database PRD v0.4** and state that architecture/API/auth decisions from the design review are reflected (no longer “revisions expected” for those topics).

### 4. References

| Check | Action |
|-------|--------|
| ☐ | Replace every **`Database PRD v0.3`** / **`v0.3`** database filename with **`v0.4`** / `Recipe_Meal_Planning_Database_PRD_v0.4.md` |
| ☐ | Appendix A: change “artifacts folder” → **repo root** (or “repository root”) |
| ☐ | Appendix A filename: `Recipe_Meal_Planning_Database_PRD_v0.4.md` |
| ☐ | Remove trailing line **`End of Product PRD v0.1 (Sections Started)`** and the invitation paragraph that follows |
| ☐ | Replace closing with a v0.2 line, e.g. **`End of Product PRD v0.2`** — living document; further changes tracked via changelog |
| ☐ | Ensure Important Note / §7 / Appendix A are mutually consistent on version and filename |

### 5. Terminology sweep list

Integrator must verify each phrase is **GONE** from the final Product PRD v0.2 body (except where explicitly allowed below). Search case-sensitively and for common variants.

| Phrase / pattern | Must be gone? | Allowed residual |
|------------------|---------------|------------------|
| `protein_portions` | Yes | Changelog / “removed in v0.2” historical notes only |
| `visible_to_households` | Yes | Changelog / historical notes only |
| `is_shared` **as stored field** | Yes as stored/input column | Derived “shared” badge / UX language OK if not a DB field |
| `NestJS` | Yes | Changelog “no NestJS” only |
| `Edge Functions` | Yes outside future-work notes | §6.9-style **future** extensibility only; not v1 architecture or open questions |
| `background sync` | Yes outside Phase 2 | Phase 2 roadmap + conflict-design wording only |
| `handled intelligently` | Yes | Replace with D12 rules (within-dimension conversion; cross-dimension separate lines) |
| `GIN indexes on all JSONB` / blanket GIN-on-JSONB | Yes | Query-pattern indexes per DB PRD v0.4 §6 only |

**Additional consistency checks (recommended, not exclusive):**

| Check | Expectation after integration |
|-------|-------------------------------|
| Offline writes in Phase 1 | None |
| Shopping list implementation | SQL function `generate_shopping_list` (+ tRPC format), not ad-hoc app-side multi-query aggregation as the source of truth |
| Portion API/model | Arrays of `{ portionCategoryId, count, athleteCount }` / table rows — not JSONB blob |
| Visibility API/model | `householdIds` / `MealPlanHousehold` — not `is_shared` + `visible_to_households` JSONB |
| Performance language | Points at §12 budget table; no “feels fast” as a success criterion |
| Testing language | Points at §11; Phase 1 success includes RLS matrix, contract test, §9.3 E2E |

### 6. Explicit non-goals for this task’s output

- ☐ Do **not** paste a Testing Strategy body from this file (Task 03 owns it) — only ensure **§11 placement** in the renumber map.
- ☐ Do **not** re-litigate D1–D17 in Risks as open questions.
- ☐ After sweep, run a full-document search for the terminology table before merge.
