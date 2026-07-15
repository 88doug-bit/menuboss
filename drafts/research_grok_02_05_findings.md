# Research Brief — Product PRD Tasks 02–05 (Architecture, Testing, Functional Reqs, NFR/Roadmap/Hygiene)

**Agent:** Researcher  
**Branch:** `research/grok-02-05-product`  
**Date:** 2026-07-15  
**Audience:** Implementers for `grok_02`–`grok_05` Product PRD revision drafts  
**Scope:** Investigation only. **Do not** treat this as replacement prose. **Do not** invent features beyond the briefs.

**Primary inputs (read fully):**

| File | Role |
|------|------|
| `Product_PRD_v0.1.md` | Document under revision (v0.1 → v0.2) |
| `grok_02_product_prd_architecture_api.md` | §4, §6, §10 API rewrite |
| `grok_03_testing_strategy_section.md` | New Testing Strategy section |
| `grok_04_functional_reqs_edge_cases.md` | §8.1–§8.3, §8.7, §8.8 rewrite |
| `grok_05_nfr_roadmap_hygiene.md` | NFR section, §11, hygiene map |
| `drafts/grok_out_database_prd_v0.4.md` | Target data-model alignment |
| `drafts/claude_authored_sections.md` | Placeholders + RLS matrix + shopping/portion contracts |

---

## 1. Exact Product PRD section locations / line anchors

All line numbers refer to `Product_PRD_v0.1.md` as of 2026-07-15.

### Task 02 — Architecture & API (`drafts/grok_out_product_architecture.md`)

| Target | Heading (as in file) | Lines | Notes |
|--------|----------------------|-------|-------|
| **§4 full** | `## 4. Assumptions and Constraints` | **79–95** | Entire section body; stack, DB ref, JSONB list, auth hedging |
| **§6 full** | `## 6. Architecture Deep-Dive` | **111–209** | All subsections 6.1–6.9 |
| §6.1 | Overall Architecture Approach | 113–120 | Nest/Edge hybrid framing |
| §6.2 | Frontend Layer (React PWA) | 122–135 | Offline **background sync** L130; optimistic UI L135 |
| §6.3 | Backend Layer (Node/TypeScript) | 137–144 | NestJS **or** tRPC L138; Edge hybrid L144 — **retitle** to tRPC-in-Next.js |
| §6.4 | Database & Data Layer | 146–154 | DB PRD **v0.3** L147; `protein_portions` + blanket GIN L154 |
| §6.5 | Communication & Data Flow | 156–177 | Pattern 2 service-role L165; flow steps 3–4 protein_portions + service-role L174–175 |
| §6.6 | Security Architecture | 179–183 | “primarily RLS” + service role for privileged ops L181 |
| §6.7 | Technology table | 185–196 | Backend NestJS row L191; Offline background sync L196 |
| §6.8 | Offline & PWA Strategy | 198–202 | Offline **write queue** L200 — conflicts with D4 |
| §6.9 | Future Extensibility | 204–207 | Edge Functions L206 — keep only as future note |
| **§10 API** | `## 10. API & Backend Contracts (High-Level)` | **422–487** | First of two “Section 10”s; **not** Risks |
| §10.1 | Recommended API Style | 424–427 | “Recommended” + alternatives; `protein_portions` in rationale L425 |
| §10.2 | Router structure | 429–440 | Mostly keep; remove separate-service implication |
| §10.3 | Key Procedure Examples | 442–465 | **mealPlan.createOrUpdate** L444–447: `protein_portions`, `is_shared`, `visible_to_households` |
| | | | **mealPlan.generateShoppingList** L449–452: portion multipliers on ingredients |
| §10.4 | Responsibility Split | 467–476 | Shopping/portions = Backend only — update for SQL fn + RLS |
| §10.5 | Authentication & Context | 478–481 | Service role for shared plans L480 — **purge** per D1 |
| §10.6 | Future Considerations | 483–485 | Edge Functions L485 — future-only wording |

**Out of Task 02 scope but stale (hygiene / other tasks):** Header L1–13, §3 L52–77, §7 L211–225, §9.2 editor UI L356–360 / shopping L375–379, dual Risks §10 L579+, Appendix A L601–602.

### Task 03 — Testing Strategy (`drafts/grok_out_testing_strategy.md`)

| Target | Location | Lines | Notes |
|--------|----------|-------|-------|
| **New section** | *Does not exist in v0.1* | — | Heading: `## Testing Strategy` (**unnumbered**; integrator applies number → **11** per hygiene map) |
| Placement | After Functional Requirements / before NFR | After §8 (~L321) or after §9? | Brief: after Functional Reqs / before NFR. Hygiene map final order places Testing **after API (§10)** as **§11**. Implementer uses unnumbered heading; integrator places after API rewrite. |
| **§9.3 flows (read-only)** | `### 9.3 Key User Flows` | **381–399** | Three named flows — E2E mandatory coverage (see §4 of this brief) |
| §8 features (read-only) | `## 8. Detailed Functional Requirements` | **227–321** | AC classes drive pyramid mapping; Task 04 rewrites ACs |
| Placeholder | In RLS subsection | — | Insert exactly: `<!-- CLAUDE_SECTION: RLS_TEST_MATRIX -->` (body in `claude_authored_sections.md` L161–188) |

### Task 04 — Functional Requirements (`drafts/grok_out_functional_reqs.md`)

| Target | Heading | Lines | Touch? |
|--------|---------|-------|--------|
| **§8.1** | Recipe & Ingredient Management | **229–241** | **Rewrite** (D7 + soft-delete / merge ACs) |
| **§8.2** | Portion Scaling & Food Safety | **243–253** | **Rewrite** (D3/D5/D17 model + edge ACs) |
| **§8.3** | Meal Planning & Calendar | **255–265** | **Rewrite** (D6/D8 + share ACs) |
| §8.4 | RecipeCombination | **267–277** | **Leave untouched** |
| §8.5 | ChefIdea | **279–289** | **Leave untouched** |
| §8.6 | Leftover Management | **291–300** | **Leave untouched** |
| **§8.7** | Shopping List Generation | **302–310** | **Rewrite** (D12/D14; kill “handled intelligently”) |
| **§8.8** | Search, Filtering & Discovery | **312–319** | **Rewrite** (D7 visibility language) |
| Note after §8 | product-level note | **323** | Leave; not a numbered subsection |

**Critical stale content in §8.2 today (must die in replacement):**
- FamilySettings “adult base protein amount (default 6 oz)” L244 → D17: Adult Male `PortionCategory.base_protein_oz` only
- “athlete flag per group” L245 → `athleteCount` integer with `athleteCount ≤ count`
- “Calculations respect household visibility … aggregate across participating households” L248 — portions are **plan-level** `MealPlanPortionRequirement` rows, not auto-aggregated from household membership

**Critical stale content in §8.7 today:**
- “applying the calculated portion multipliers from the plan” L304 → **wrong scaling model**; v1 scale is `servings / yield_servings` (Claude `SHOPPING_LIST_VIEW`)
- “handled intelligently” L305 → purge phrase + specify D12

### Task 05 — NFR, Roadmap, Hygiene (`drafts/grok_out_nfr_roadmap.md`)

| Target | Heading | Lines | Notes |
|--------|---------|-------|-------|
| **Orphan NFR bullets** | End of §11.6 | **572–577** | Six bullets; **promote** to new `## Non-Functional Requirements` (unnumbered → final **§12**); **delete** from §11 |
| **§11 full** | `## 11. Roadmap & Phasing` | **489–570** (+ orphan bullets through 577) | Revise 11.2–11.5; philosophy stay; remove NFR orphans |
| §11.1 | Guiding Principles | 491–495 | Soft; “JSONB structures” L494 still ok if narrowed |
| §11.2 | Phase 1 MVP | 497–520 | `protein_portions` L505; adult base L504; weak success criteria L514–518; PWA L511 |
| §11.3 | Phase 2 | 522–539 | background sync L530; “feels fast” L539 → budgets |
| §11.4 | Phase 3+ | 541–559 | Add density conversion + protein-driven recipe scaling candidates |
| §11.5 | Dependencies | 561–565 | DB PRD **v0.3** L562 → v0.4; RLS matrix as Phase 1 gate |
| §11.6 | Philosophy + NFR orphans | 567–577 | Keep philosophy L567–570; move L572–577 out |
| **Dual §10 Risks** | `## 10. Risks, Open Questions & Next Steps` | **579–597** | Renumber → **§14**; open Q cleanup (Part 3 hygiene) |
| Header | Document metadata | **1–13** | → v0.2, July 15 2026, changelog, authors |
| Appendix A | DB PRD reference | **601–602** | v0.3 → v0.4 filename; “artifacts folder” → repo root |
| Closing | End of Product PRD v0.1 | **606–608** | Replace with v0.2 close |

### Full document TOC (current) vs proposed final (hygiene)

| Current (v0.1) | Lines | Proposed final # (Task 05 map) |
|----------------|-------|--------------------------------|
| 1 Overview | 16 | 1 |
| 2 Goals | 29 | 2 |
| 3 Scope | 52 | 3 |
| 4 Assumptions | 79 | 4 *(Task 02 content)* |
| 5 Personas | 97 | 5 |
| 6 Architecture | 111 | 6 *(Task 02)* |
| 7 Data Model Ref | 211 | 7 *(hygiene: v0.4 + entity list)* |
| 8 Functional Reqs | 227 | 8 *(Task 04 partial)* |
| 9 UI/UX | 325 | 9 |
| **10 API** | 422 | **10** *(Task 02)* |
| **11 Roadmap** | 489 | **13** |
| **10 Risks** (duplicate number) | 579 | **14** |
| *(missing)* Testing | — | **11** *(Task 03)* |
| *(missing)* NFR section | orphans only | **12** *(Task 05 Part 1)* |

---

## 2. Terminology — purge vs retain

### Must be GONE from final v0.2 (hygiene sweep list + decision language)

Brief Task 05 Part 3 explicit purge list, expanded with anchors found in v0.1:

| Phrase / concept | Why purge | Sample anchors (v0.1) |
|------------------|-----------|------------------------|
| `protein_portions` | D5 → `MealPlanPortionRequirement` | L87, 154, 221, 425, 445, 505 |
| `visible_to_households` | D6 → `MealPlanHousehold` | L445 |
| `is_shared` **as stored/input field** | D6 derived from membership count > 1 | L445; UI “marks plan as shared” is **OK** as UX if derived |
| `NestJS` | D2 tRPC-in-Next only | L138, 191 |
| `Edge Functions` **outside future-work notes** | D2 not in v1 | L114, 143–144, 153, 206, 485, 587 |
| “background sync” **outside Phase 2** | D4 v1 read-only offline | L130, 196, 200, 530, 576 |
| “handled intelligently” | D12/D14 require deterministic spec | L305 |
| “GIN indexes on all JSONB” / blanket GIN | D13 index-by-query | L154 |
| Backend **service role** for user/shared writes | D1 JWT + RLS sole authority | L165, 175, 181, 480 |
| Database PRD **v0.3** / `…_v0.3.md` | → v0.4 | L11, 83, 87, 147, 213, 562, 602 |
| FamilySettings **adult base protein** as settings field | D17 Adult Male PortionCategory row | L244, 504 |
| Boolean **athlete flag per group** | D5 `athleteCount` | L245, 357 |
| Offline **edit queue / sync while offline** in v1 | D4 Phase 2 | L200, 576 |
| “portion multipliers” rescaling **ingredient lines** | Claude scale_factor = servings/yield | L304, 451, 378 |
| REST/GraphQL as equal API alternatives (in §10.1) | D2 tRPC confirmed | L427 |
| “architecture will be defined in subsequent work” (auth/RLS) | Decided; DB PRD v0.4 §7 | L89 |

### Retain (product language / still valid)

| Keep | Notes |
|------|-------|
| **MenuBoss** (no space) | Product name L20; design concepts use “Menu Boss” — prefer Product PRD form |
| Shared vs private meal plans | UX concept; storage is membership-derived |
| Shared badge / visual distinction | Derived from membership count > 1 |
| `leftover_decay_path`, `food_safety_profile`, `nutrition_data`, `other_global_defaults` | Allowed JSONB after D5/D6 narrow |
| PortionCategory names / age-sex bands | Still the row vocabulary |
| `athlete_multiplier` on FamilySettings | Kept; only adult base oz moves |
| Soft-delete, make-again rating, RecipeCombination, ChefIdea | Unchanged product concepts |
| Supabase Auth, Realtime, RLS (as authority) | Strengthen: RLS **sole** authority |
| Next.js, TanStack Query, Zod, Workbox/next-pwa | Stack stays; offline **read-only** v1 |
| Optimistic UI for **online** updates | Explicitly remain (D4) |
| Hybrid relational + JSONB **principle** | Scope narrowed, principle kept |
| tRPC routers list (`recipe`, `mealPlan`, …) | Structure mostly unchanged |
| Protein-only v1; multi-macro Phase 3 | Unchanged phasing |

### Prefer / introduce (decision-aligned)

| Prefer | Instead of |
|--------|------------|
| tRPC in Next.js (single deployable) | NestJS / separate Node service |
| User-JWT Supabase client on every procedure | Service-role writes in request path |
| `portionRequirements: Array<{portionCategoryId, count, athleteCount}>` | `protein_portions` JSONB |
| `householdIds: string[]` | `is_shared` + `visible_to_households` |
| `packages/portion-calc` pure TS (D3) | Ad-hoc backend-only calc |
| `generate_shopping_list` SQL + tRPC format (D14/D12) | Opaque “backend aggregates” |
| `start_date` / `end_date` + `assignment_date` in range | Unspecified date model |
| Database PRD **v0.4** | v0.3 |
| Read-only offline cache (D4) | Offline edits + background sync in v1 |

---

## 3. Cross-brief consistency risks

These are the places where Tasks 02–05 can **diverge from each other or from DB v0.4 / Claude** if implementers draft in isolation.

### 3.1 Offline (D4) — Tasks 02, 03, 05

| Surface | Must say |
|---------|----------|
| Task 02 §6.2 / §6.7 / §6.8 | Installable + **read-only** cache; no offline write queue; optimistic UI **online only** |
| Task 03 failure modes | “Offline cache serving **stale reads**”; not offline write conflict tests in Phase 1 |
| Task 05 NFR PWA + Phase 1 | Read-only offline; Phase 2 = offline edit + background sync **after conflict-resolution design** |
| Risk | Task 02 leaves “sync when reconnect” for edits while Task 05 Phase 1 success still implies offline editing |

### 3.2 Backend stack (D2) — Tasks 02, 03, 05

| Surface | Must say |
|---------|----------|
| Task 02 §4, §6.3, §6.5, §6.7, §10 | tRPC **hosted in Next.js**; no NestJS; Edge Functions only in §6.9 / §10.6 future |
| Task 03 | Integration tests = **tRPC procedures** against local Supabase — not Nest e2e |
| Task 05 roadmap | **No separate backend workstream**; Phase 1 “API layer” = Next route handlers |
| Risk | §10.1 still sounding “recommended vs REST”; §6.5 Pattern 1 direct Supabase vs tRPC — both OK if JWT+RLS, but Pattern 2 must not use service role |

### 3.3 Portion model (D3/D5/D17) — Tasks 02, 03, 04, 05 + Claude

| Surface | Must say |
|---------|----------|
| Canonical formula | Claude `NEW_TABLE_SCHEMAS`: Σ over rows of `((count − athlete_count) + athlete_count × athlete_multiplier) × base_protein_oz` |
| Task 02 §10.3 | Input shape `portionRequirements[]`; persist rows under user JWT; calc via shared package |
| Task 03 | Flagship **unit** target = portion-calc package; **contract test** TS ↔ SQL weekly protein roll-up |
| Task 04 §8.2 | Admins edit **PortionCategory.base_protein_oz** (Adult Male = 6 oz reference); FamilySettings keeps **multiplier only**; `athleteCount ≤ count`; zero counts → 0 oz + empty shopping list; deactivate category behavior; **derived totals never stale** after settings change; live preview **&lt;100 ms** (D16) |
| Task 05 Phase 1 | No `protein_portions` in feature list; success includes contract test green |
| Risk | Task 04 keeps “FamilySettings adult base” wording; Task 02 still mentions JSONB portions; dual formula implementations without contract test callout |

### 3.4 Visibility / sharing (D6/D7) — Tasks 02, 04 + Claude RLS

| Surface | Must say |
|---------|----------|
| API | `householdIds: string[]`; creating household always member; `is_shared` derived |
| Task 04 §8.3 | Unshare removes visibility realtime; creating household **cannot** be removed; non-creating shared members **view-only v1** (matches Claude policy shape B) |
| Task 04 §8.1 / §8.8 | Recipes/ingredients/ideas/combinations **family-global**; only MealPlans visibility-filtered |
| Task 02 §6.5 example flow | Write under user JWT; RLS authorizes; Realtime to authorized subscribers |
| Risk | §8.8 “results respect household visibility” for recipes must be **removed** for content; keep for plan-derived surfaces only |

### 3.5 Shopping list (D12/D14) — Tasks 02, 03, 04 + Claude SHOPPING_LIST_VIEW

| Surface | Must say |
|---------|----------|
| Scale | `scale_factor = assignment.servings / recipe.yield_servings` — protein **informs servings**, does **not** rescale ingredient lines in v1 |
| Conversion | Within dimension via `factor_to_base`; cross-dimension = **separate lines** (e.g. flour g + cups) |
| Optional | `is_optional` → separate Optional group |
| Authz | SQL `SECURITY INVOKER` + RLS; tRPC formats only |
| Task 03 | Integration target = `generate_shopping_list`; soft-deleted recipes still contribute |
| Task 05 Phase 3 | Named candidate: **protein-driven automatic recipe scaling** (needs protein ingredient tagging) |
| Risk | Task 04 §8.7 and Task 02 §10.3 disagree on “portion multipliers”; UI §9.2 L378 (“Quantities already adjusted for the calculated portions”) is **out of rewrite scope** but contradicts D14 — flag for hygiene/integrator |

### 3.6 Date range (D8) — Tasks 02, 04

| Surface | Must say |
|---------|----------|
| Plans | `start_date` / `end_date` |
| Assignments | `assignment_date` within range; shrink range rejected while assignments stranded |
| Task 03 | Integration: assignment-date triggers |
| Risk | §9.3 Flow “tap a day → Add to Plan” still valid UX; need plan container dates under the hood without Task 03 inventing schema |

### 3.7 Performance budgets (D16) — Tasks 03, 04, 05

| Budget | Verification | Cross-ref |
|--------|--------------|-----------|
| Calendar week view &lt; **1.5 s** (mid-range phone, cold PWA, warm cache) | Playwright E2E | Task 05 NFR table |
| Shopping list &lt; **2 s** (7-day multi-household) | Playwright | Task 05 + Task 03 E2E shopping |
| Portion live preview &lt; **100 ms** | Unit benchmark | Task 04 §8.2 AC + Task 05 |
| Search &lt; **500 ms** | Playwright | Task 05 |
| Realtime shared-plan prop &lt; **2 s** | Two-browser Playwright | Task 03 + Task 05 |
| Risk | Task 04 cites &lt;100 ms without Task 05 owning the full table; Task 05 Phase 1 success must require “performance budgets met” without restating vague “fast” |

### 3.8 Testing gates (D9/D10) — Tasks 03, 05 (+ Claude matrix)

| Gate | Owner text |
|------|------------|
| RLS matrix green in CI | Task 03 placeholder → Claude matrix; Task 05 Phase 1 success criteria |
| §9.3 E2E green | Task 03 defines; Task 05 success criterion |
| TS↔SQL portion contract | Task 03 defines; Task 05 Phase 1 success |
| Migrations extend matrix same PR | Task 03 CI gates |
| Risk | Task 05 invents matrix content; Task 03 renumbers as “§11 Testing” instead of unnumbered heading |

### 3.9 Sections neither Task 02–04 rewrites but still contradict decisions

| Location | Stale claim | Who fixes |
|----------|-------------|-----------|
| §7 L211–225 | v0.3; `protein_portions` on MealPlan | Hygiene map (Task 05 Part 3) + integrator |
| §3 L64, 76 | Offline-capable; Phase 2 “offline improvements” | Soft hygiene; Phase 2 wording should match D4 design task |
| §9.2 L356–360 | Athlete **toggles**; FamilySettings adult base implied | **Not** in Task 04 scope — **flag for coordinator/integrator** |
| §9.2 L378 | Quantities adjusted for calculated portions | Same — contradicts D14 scale_factor |
| Header L11–12 | “revisions expected as architecture refined” | Task 05 version/changelog |

```html
<!-- TODO(coordinator): §9.2 MealPlan Editor and Shopping List View still describe athlete toggles and portion-multiplier shopping quantities. Tasks 02–05 do not rewrite §9; integrator should align UI copy with D5/D14 after functional/API rewrites land. -->
```

### 3.10 Alignment with `drafts/grok_out_database_prd_v0.4.md`

DB v0.4 draft already states D1–D8, D12–D15, D17. Product implementers should **mirror** that terminology, not re-argue NestJS/JSONB portions. Product §4/§7 must cite **v0.4** and `Recipe_Meal_Planning_Database_PRD_v0.4.md` (file may land at integration).

Claude placeholders Product authors must **not** paste bodies for (except Task 03 RLS marker):

| Marker | Product location |
|--------|------------------|
| `<!-- CLAUDE_SECTION: RLS_TEST_MATRIX -->` | Testing Strategy (Task 03) only |
| `NEW_TABLE_SCHEMAS` / `SHOPPING_LIST_VIEW` / `RLS_POLICIES` | Database PRD only — Product **references** contracts by name, does not embed SQL |

---

## 4. §9.3 user flows summary (for Testing Strategy author)

Source: `Product_PRD_v0.1.md` **L381–399**. Task 03 E2E must cover these three **plus** shopping-list generation and calendar realtime (two browser contexts), with mobile-viewport runs.

### Flow A — Plan a Shared Meal (L383–389)

| Step | User action | System / data implications for tests |
|------|-------------|--------------------------------------|
| 1 | Calendar → day → “Add to Plan” | Plan date range (D8); calendar primary nav |
| 2 | Search/browse recipes (safety notes visible) | Family-global recipes (D7); food_safety_profile surfacing |
| 3 | Select recipe → enter/adjust portion counts (age/sex/athlete) | `MealPlanPortionRequirement` count + athleteCount (D5); not boolean flag |
| 4 | Live total protein calculation | Shared pure TS portion-calc (D3); &lt;100 ms (D16) |
| 5 | Mark shared with specific households | `householdIds` / MealPlanHousehold (D6); creating household always member |
| 6 | Save → other households realtime calendar update | User JWT write + RLS (D1); Realtime RLS; &lt;2 s prop (D16) |

**E2E assertions (product-level):** second browser as other household sees plan; third household does not; shared badge derived; portion total matches fixture formula.

### Flow B — Capture & Use a Leftover Idea (L391–394)

| Step | User action | Test implications |
|------|-------------|-------------------|
| 1 | After cooking, open recipe used | Recipe detail; soft-delete still readable if planned |
| 2 | “Creative Leftovers” → add decay path entries | `leftover_decay_path` JSONB write; family-global content |
| 3 | Another member views same recipe → sees repurposing + links | Cross-user visibility of content (not MealPlan RLS); link navigation |

**E2E:** two users/contexts optional; at minimum create path then browse as second session.

### Flow C — Capture a ChefIdea (L396–399)

| Step | User action | Test implications |
|------|-------------|-------------------|
| 1 | Sees/hears idea | Entry point “Capture Idea” |
| 2 | Quick form + tags | Same category/tag system as recipes; `created_by` attribution |
| 3 | Later search/browse by tag finds idea with recipes | Global search (D7); not household-filtered |

### Additional E2E surfaces required by Task 03 brief (not named in §9.3)

1. **Shopping-list generation** — select plan(s) → list; multi-plan dedup; optional group; soft-deleted recipe badge; empty plan → empty list; budget &lt;2 s.  
2. **Calendar realtime** — two Playwright contexts; edit shared plan online; peer updates &lt;2 s.  
3. **Mobile viewport** — PWA mobile-first; run key flows at phone width.

### Failure-mode classes (Task 03) mapped to flows

| Failure class | Related flow / surface |
|---------------|------------------------|
| Offline cache stale reads | Calendar/recipe browse after disconnect (Flow A/B read paths) |
| Realtime disconnect/reconnect | Flow A step 6 |
| Concurrent online edits shared plan | Flow A; last-write / no offline merge in v1 |
| Soft-deleted entities in historical views | Plans + shopping still show badged recipes; search hides them (§8.1 AC) |

### Phase 1 vs Phase 2 testing (do not conflate)

- **Phase 1:** §9.3 E2E + shopping + realtime + RLS matrix + contract test + unit pyramid.  
- **Phase 2:** offline **write** sync + conflict scenarios (only after conflict-resolution design — Task 05 roadmap).

---

## 5. Dual §10 numbering and hygiene map obligations

### The defect

| # | Title | Start line | End (approx) |
|---|-------|------------|--------------|
| **10 (first)** | API & Backend Contracts (High-Level) | **422** | **487** |
| **11** | Roadmap & Phasing | **489** | **577** (incl. NFR orphans) |
| **10 (second)** | Risks, Open Questions & Next Steps | **579** | **597** |

Markdown heading text is literally `## 10.` twice. Internal prose “see Section 7” exists (L11, L83) but **no** prose currently says “see Section 10”, so renumber risk is mainly **TOC order + new sections + Appendix**, not many in-body “§10” strings.

### Proposed final order (Task 05 Part 3 — implementer hygiene checklist must restate)

| Final # | Section | Source |
|---------|---------|--------|
| 1–7 | Unchanged structure | Soft hygiene (v0.4 refs in §4/§7) |
| 8 | Functional Requirements | Task 04 partial replace |
| 9 | UI/UX | Unchanged body; optional integrator UI stale flags |
| **10** | API & Backend Contracts | Task 02 (currently first §10) |
| **11** | Testing Strategy | **New** Task 03 |
| **12** | Non-Functional Requirements | **New** Task 05 Part 1 (from L572–577 + D16) |
| **13** | Roadmap & Phasing | Task 05 Part 2 (currently §11) |
| **14** | Risks, Open Questions & Next Steps | Currently second §10 |

### What the hygiene map must fix (checklist for Task 05 author)

1. **Renumbering map** — every old → new heading as above; list cross-refs:
   - `Database PRD v0.3` → `v0.4` / `Recipe_Meal_Planning_Database_PRD_v0.4.md` (L11, 83, 87, 147, 213, 562, 602)
   - “see Section 7” stays §7 (stable) unless Testing/NFR insertions change nothing about §7 number — **§7 number unchanged** under proposed map
   - Roadmap self-references “Phase 1/2/3” stay; any future “see Testing Strategy” from §6/§10 (Task 02 may add) → final §11
   - NFR orphan bullets L572–577: **move** to §12, **delete** from Roadmap
   - Second `## 10. Risks…` → `## 14. Risks…` (or unnumbered until integrator applies numbers — brief wants numbered map)

2. **Risks / open questions cleanup (L586–591)**

   | Open question (v0.1) | Disposition |
   |----------------------|-------------|
   | Split React / Node / Edge Functions | **Remove** — decided D2 |
   | Detailed RLS + auth flows | **Remove** — DB PRD v0.4 §7 + Testing matrix |
   | Shopping list prioritization/specs | **Remove or narrow** — D12/D14 decided; nutrition roll-up prioritization may **remain** open |
   | Food-safety / leftover UX patterns | **Keep** |
   | AI roadmap timing | **Keep** |
   | Over-engineering risk L582 | **Update** — review pared v1 (offline writes deferred; normalized model) |

3. **Header / version**
   - Version **0.2**, date **July 15, 2026**, status revised per design review  
   - Changelog ≤8 lines covering 16 decisions  
   - Author: **Grok + Claude (design review revisions)**

4. **References & closing**
   - Appendix A: correct filename + **repo root** not “artifacts folder”  
   - Remove “End of Product PRD v0.1 (Sections Started)” + invitation paragraph L606–608  
   - Closing line for v0.2  

5. **Terminology sweep** — verify purge list in §2 of this research file is absent after all task drafts merge (especially phrases that live **outside** Task 02/04 rewrite ranges: §3, §7, §9.2, Appendix).

6. **New section placement for integrator**
   - Task 03 output: unnumbered `## Testing Strategy`  
   - Task 05 Part 1: unnumbered `## Non-Functional Requirements`  
   - Integrator inserts: after API (§10), Testing (§11), NFR (§12), then Roadmap (§13), Risks (§14)

### Cross-task numbering discipline

| Task | Keep numbers in draft? | Why |
|------|------------------------|-----|
| 02 | **Yes** — §4, §6.x, §10.x as today | Brief: “§ numbers re-mapped later; keep current numbers” |
| 03 | **No numbers** on Testing heading | Brief explicit |
| 04 | **Yes** — §8.1, 8.2, 8.3, 8.7, 8.8 | Do not renumber; do not touch 8.4–8.6 |
| 05 | Roadmap keep **11.x** in draft; hygiene map describes **final** 13.x | Part 3 is instructions, not renumbered full doc |

---

## 6. Implementer quick checklist (by task)

### Task 02
- [ ] Replace L79–95, L111–209, L422–487 only  
- [ ] D1 JWT/RLS sole; D2 tRPC-in-Next; D3 shared portion-calc; D4 read-only offline; D5/D6 API shapes; D14 SQL shopping  
- [ ] No Testing/NFR/roadmap/functional prose  
- [ ] May say “see Testing Strategy section” without inventing its content  

### Task 03
- [ ] Philosophy + pyramid (Vitest / local Supabase / Playwright)  
- [ ] Exact RLS placeholder string  
- [ ] §9.3 three flows + shopping + dual-context realtime + mobile  
- [ ] CI non-skippable: matrix + contract test  
- [ ] Phase 1/2/3 expectations; no matrix body  

### Task 04
- [ ] Only §8.1, 8.2, 8.3, 8.7, 8.8  
- [ ] Every D11 edge case as **testable AC**  
- [ ] Align scaling story with Claude servings/yield (not protein line rescale)  
- [ ] D17 adult base on PortionCategory  

### Task 05
- [ ] NFR section with D16 table + verification method  
- [ ] Phase 1/2/3 + dependencies updates; delete orphan NFR from roadmap  
- [ ] Hygiene map: dual §10, open Q cleanup, version, refs, terminology sweep, internal cross-ref list  

---

## 7. Source path index (absolute)

- Product PRD: `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f642d-34d7-7202-9d4d-0e90766ce568\Product_PRD_v0.1.md`
- Briefs: `…\grok_02_product_prd_architecture_api.md`, `…\grok_03_testing_strategy_section.md`, `…\grok_04_functional_reqs_edge_cases.md`, `…\grok_05_nfr_roadmap_hygiene.md`
- DB draft: `…\drafts\grok_out_database_prd_v0.4.md`
- Claude sections: `…\drafts\claude_authored_sections.md`
- Prior research pattern: `…\drafts\research_grok_01_findings.md`
- **This file:** `…\drafts\research_grok_02_05_findings.md`

---

*End of research brief. No full replacement sections produced.*
