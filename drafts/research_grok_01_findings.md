# Research Brief — Database PRD v0.3 → v0.4

**Agent:** Researcher  
**Branch:** `research/grok-01-db-prd-v04`  
**Date:** 2026-07-15  
**Audience:** Implementer revising `Recipe_Meal_Planning_Database_PRD_v0.3.md` per `grok_01_database_prd_v0.4_revision.md`  
**Scope:** Investigation only. Do **not** treat this as the revised PRD. Do **not** invent features beyond the brief.

**Primary inputs (read fully):**
| File | Role |
|------|------|
| `grok_01_database_prd_v0.4_revision.md` | Authoritative revision instructions + decision register |
| `Recipe_Meal_Planning_Database_PRD_v0.3.md` | Document to revise (in place, not rewrite from scratch) |
| `drafts/claude_authored_sections.md` | Coordinator text for placeholders (map only; do not paste into PRD) |
| `Product_PRD_v0.1.md` | Product/architecture terminology (pre-review; many conflicts) |
| `Menu_Boss_design_concepts.md` | UX terminology (mostly aligned; non-schema) |

---

## 1. Section-by-section map of v0.3 (what must change)

### Document header (lines 1–9)
**Currently says:** Version 0.3 (Final Refinement); July 14, 2026; Status Draft for Review; Changes in v0.3 = `food_safety_profile` only.

**Must change:**
- Version → **0.4**
- Date → **July 15, 2026**
- Status → **"Revised per design review"**
- Add **Changes in v0.4** changelog summarizing **D5–D8, D12–D15, D17** and architecture decisions **D1, D2** (tRPC-in-Next, RLS sole auth)
- Keep author/audience style consistent with existing voice

### Critical Note to Reader (lines 11–13)
**Currently says:** DB layer only; revisions expected once architecture/auth/API/hosting defined; JSONB shapes, RLS, cardinalities may need adjustment.

**Must change (brief constraint):** Do **not** remove the block. Update to state the **system architecture is now decided** and the document **reflects the 2026-07 design review**. Retain purpose (DB layer for Product PRD incorporation) without “architecture not finalized” hedging for decided items.

### §1 Overview and Purpose
**Currently says:** Single family / three households; shared vs private plans; extensible classification; protein-focused portion scaling; hybrid relational + JSONB; queryability priorities.

**Must change:** Mostly **stable**. Soft-update only if needed so “hybrid JSONB” is not read as still applying to `protein_portions` / visibility (those move to normalized tables). Product framing (family, three households, shared vs private) stays.

### §2 Scope
**Currently says:** In-scope includes protein_portions JSONB, MealPlan shared/private, high-level RLS. Out-of-scope includes complete auth/RLS definitions, API, frontend.

**Must change:**
- In-scope wording: replace “Use of JSONB for flexible structures (**especially `protein_portions`**)” with JSONB for **fluid, non-filtered** structures only (`leftover_decay_path`, `food_safety_profile`, `other_global_defaults`, etc.)
- Mention normalized tables by name as in-scope concepts: `MealPlanHousehold`, `MealPlanPortionRequirement`, `Unit` (detail lives in coordinator placeholder)
- Out-of-scope can still exclude finalized UI/API code; RLS **policy body** is coordinator-owned (§7 placeholder), not Implementer prose
- D12 Unit model is now in-scope at the entity level

### §3 Assumptions
**Currently says:** Postgres/Supabase; hybrid model with `protein_portions` as JSONB example; three households; RLS primary isolation; React PWA + Node/TS; **“architecture has not yet been finalized”**; protein-only v1; modest scale.

**Must change (major):**
- Replace “not yet finalized” hedging with **decided architecture**:
  - **D2:** Backend = **tRPC hosted inside the Next.js app**; **no NestJS**; **Supabase Edge Functions not used in v1**
  - **D1:** **RLS is sole authorization authority**; backend **forwards user JWT**; service role **only for system jobs** (migrations, audit)
  - **D3 + D14:** Portion calculation = **one pure TypeScript function in a shared package**; persisted totals derived/cached; **DB functions limited to shopping-list / weekly protein roll-up aggregation**
- Update hybrid-model sentence: JSONB no longer for portion requirements or visibility arrays
- Keep “revisions expected” **only** for genuinely open items (pantry, AI, multi-macro / full-meal scaling)
- Optional consistency: Product PRD still says NestJS/Edge/service-role writes — DB PRD must follow **brief (D1/D2)**, not Product PRD v0.1

### §4.1 Household
**Currently:** `id`, `name`, `family_id`, `created_at`, `updated_at`, `is_active`; users belong to one household; MealPlans visible to one or more households.

**Must change:** Structurally **unchanged** except explicit note: **`is_active` deactivation is the only removal path (no hard delete)** (aligns with D6 RESTRICT on household FKs in coordinator schema).

### §4.1 User / Profile
**Currently:** `id`, `household_id`, `display_name`, `role`, `created_at`; RLS references this entity.

**Must change:** No decision-driven field renames. Leave structurally stable. RLS detail → §7 placeholder (do not expand policy text here).

### §4.1 Ingredient
**Currently:** master data; `food_safety_profile` JSONB; `is_user_added`; no `created_by_user_id`.

**Must change (D7):**
- **Family-global** visibility note (private/shared applies **only** to MealPlans)
- Add **`created_by_user_id`** for attribution symmetry
- Keep **`is_user_added`**
- Keep `food_safety_profile` JSONB

### §4.1 Recipe
**Currently:** already has `created_by_user_id`, `make_again_rating`, `leftover_decay_path`.

**Must change (D7):** Add **family-global** visibility note only. No removal of make-again / decay path.

### §4.1 RecipeIngredient
**Currently:** junction fields including `quantity`, `unit_id`.

**Must change:** No explicit delta in brief. Unit semantics clarified via new **Unit** table (placeholder). Do not invent new fields.

### §4.1 Category (D15)
**Currently:** `parent_id`, `category_type`, **`level`**, **`path`** (materialized or ltree), `sort_order`, etc.

**Must change:**
- **Remove `level` and `path`**
- Hierarchy = **`parent_id` + recursive CTEs only**
- One sentence: **ltree as future optimization** if taxonomy grows very large
- Drop present-tense “or via ltree extension” as a current option

### §4.1 Tag
**Currently:** flat tags with `tag_group`, UI color/icon.

**Must change:** None required by decisions. Leave as-is.

### §4.1 PortionCategory (D17)
**Currently:** lookup with `base_protein_oz`; recommended age/sex set including Adult Male default 6.0 oz.

**Must change:**
- Structure of rows **unchanged**
- Note **`base_protein_oz` is the single source of per-category base ounces** (D17)
- Rows **deactivated (`is_active = false`), never deleted**, once referenced by plans

### §4.1 FamilySettings (D17)
**Currently:** `adult_reference_protein_oz` (default 6.0), `athlete_multiplier`, `other_global_defaults` JSONB.

**Must change:**
- **Remove `adult_reference_protein_oz` entirely**
- Keep **`athlete_multiplier`** (default 1.5) and **`other_global_defaults`**
- Note adult base is edited via **Adult Male PortionCategory** row

### §4.1 MealPlan (D5, D6, D8)
**Currently:** `plan_date` **or** `start_date`/`end_date`; **`is_shared`**; **`visible_to_households` JSONB** (or junction “or”); `protein_portions` JSONB pointer; `created_by_*`.

**Must change:**
- **Date model:** `start_date` / `end_date` only — **remove `plan_date` alternative (D8)**
- **Remove stored `is_shared`** — shared-ness **derived** from MealPlanHousehold membership count > 1 (D6)
- **Remove `visible_to_households`** (D6)
- **Remove `protein_portions` JSONB** reference (D5)
- Keep `created_by_household_id`, `created_by_user_id`
- Relationships: has many **MealPlanAssignment**, **MealPlanHousehold**, **MealPlanPortionRequirement**

### §4.1 MealPlanAssignment (D5, D8)
**Currently:** `assignment_date`, `meal_slot`, `servings`, etc.; “may optionally override or reference plan-level `protein_portions`”.

**Must change:**
- State invariant: **`assignment_date` must fall within parent plan `[start_date, end_date]`** (enforcement details in coordinator section — state invariant only)
- **Delete** per-assignment protein_portions override sentence (D5; per-assignment portion overrides **out of scope v1**)

### §4.1 RecipeCombination / ChefIdea / Leftover Decay Path (D7)
**RecipeCombination:** already has `created_by_user_id` → add **family-global** note.  
**ChefIdea:** currently **missing `created_by_user_id`** → **add it** + family-global note.  
**Leftover Decay Path:** descriptive of JSONB on Recipe — keep; still family-global content via Recipe.

### NEW entities after MealPlan / MealPlanAssignment (not written by Implementer)
**v0.3 does not define:** `MealPlanHousehold`, `MealPlanPortionRequirement`, full **`Unit`** table (units only referenced via `unit_id` / `default_unit_id`).

**Must change:** After MealPlan/MealPlanAssignment entries, insert **literal placeholder only** (see §3 of this brief). Implementer may **mention** these tables by name in relationships elsewhere.

**Coordinator content covers (do not paste):** SQL DDL, invariants (membership ≥1, creating household always member, derived is_shared), portion row semantics (`count`/`athlete_count`, athlete_within_count), canonical protein formula, Unit dimension/factor_to_base, assignment-date triggers + Zod note.

### §4.2 Key JSONB Structures (D5)
**Currently:** Full `protein_portions` example + rationale + alternative junction mention; then leftover_decay_path; then food_safety_profile.

**Must change:**
- **DELETE** entire `protein_portions` example **and** its rationale/alternative block
- **Replace** with 2–3 sentences on **normalization decision (D5):** FK integrity to PortionCategory; `athlete_count` for mixed groups; trivial SQL aggregation; JSONB remains where data is fluid and **never filtered on**
- **KEEP** `leftover_decay_path` and `food_safety_profile` examples **unchanged**

### §5 Extensibility Strategy
**Currently:** vocabularies DB-driven; hierarchy parent_id + CTEs **or ltree**; JSONB for protein_portions and evolving structures; food_safety JSONB.

**Must change:**
- New portion profiles = **rows** (PortionCategory + MealPlanPortionRequirement) — **no JSONB keys**, no schema changes for new categories
- Category depth via **recursive CTEs** (ltree future-only, consistent with D15)
- **Unit** is explicit **admin-editable lookup (D12)**
- Drop language that treats `protein_portions` as the extensibility vehicle for portions

### §6 Data Integrity, Constraints, and Indexing (D8, D13, D14)
**Currently:** FKs; unique/check constraints; **GIN on all JSONB**; FTS via generated tsvector **or triggers**; soft-delete; functions/views for protein needs + shopping lists.

**Must change (rewrite per D13):**
- **Index-by-query-pattern only**; every index documented with the **query it serves**
- B-tree/FK indexes on junctions and date columns (as needed)
- Full-text: **generated tsvector columns only** — **drop trigger alternative**
- **NO blanket GIN on all JSONB**; JSONB **unindexed until a query needs one**
- Keep soft-delete pattern and check constraints
- Mention **assignment-date range invariant**
- Insert **`<!-- CLAUDE_SECTION: SHOPPING_LIST_VIEW -->`** where DB functions / shopping-list aggregation is discussed (D14)

### §7 Security and Access Control (D1, D9–D11 reference)
**Currently:** Full prose on RLS household isolation, Supabase Auth, family admin, audit logging.

**Must change:** Replace **entire section body** with placeholder only:
`<!-- CLAUDE_SECTION: RLS_POLICIES -->`  
Implementer writes **nothing else** in §7 body.

**Coordinator content covers (do not paste):** RLS sole authority + JWT clients; `current_household_id()` / `is_family_admin()`; policy shapes A/B/C (family-global content vs household-visibility vs admin vocabularies); anon deny; Realtime RLS; audit triggers. (RLS **test matrix** is Product PRD concern, not Database PRD §7.)

### §8 Open Items and Future Considerations
**See §5 of this brief** for KEEP vs REMOVE mapping. v0.3 currently mixes resolved architecture questions with true futures.

### Closing block
**Currently:** “End of Database PRD v0.3” + ready for Product PRD incorporation.

**Must change:** Version string to **v0.4**; optionally note design-review alignment. Output packaging per brief: Implementer’s full file begins with **`## INTEGRATION NOTES`** (change list), then full PRD — not part of this research file.

---

## 2. Exact field/entity deltas required by D1–D8, D12–D15, D17

Legend: **+** add · **−** remove · **~** change meaning/wording · **□** placeholder (Implementer does not author body) · **N/A** non-schema / architecture assumption only

### D1 — RLS sole authorization authority
| Area | Delta |
|------|--------|
| §3 Assumptions | ~ Backend uses **user JWT** Supabase clients; **service role only** for system jobs (migrations, audit) |
| §7 | □ Entire body → `<!-- CLAUDE_SECTION: RLS_POLICIES -->` |
| Entities | No field deltas; policies reference Profile/household membership |

### D2 — tRPC inside Next.js
| Area | Delta |
|------|--------|
| §3 Assumptions | ~ **tRPC hosted in Next.js app**; **no NestJS**; **no Edge Functions in v1** |
| §1–§2 | Soft align stack wording if present (v0.3 says “Node/TypeScript backend” generically — update to decided shape) |

### D3 — Portion calc pure TS (shared package)
| Area | Delta |
|------|--------|
| §3 Assumptions | ~ Portion calculation = **one pure TS function** in shared package; **persisted totals derived/cached**, recomputed on settings change |
| §4.1 / §6 | ~ DB not primary home of portion formula; only sanctioned SQL mirror is shopping-list/roll-up (D14 / coordinator) |
| Schema | No new formula fields invented by Implementer |

### D4 — Offline read-only v1
| Area | Delta |
|------|--------|
| Database PRD | **No required schema delta** (product/PWA concern). Do not invent offline sync tables. Optional silence or one-line non-DB note only if Assumptions mention offline — v0.3 barely does; **do not invent**. |

### D5 — `protein_portions` JSONB → `MealPlanPortionRequirement`
| Entity / field | Delta |
|----------------|--------|
| `MealPlan.protein_portions` | **−** remove entirely |
| `MealPlanAssignment` override of plan-level portions | **−** remove mechanism; **out of scope v1** |
| `MealPlanPortionRequirement` | **+** new entity (name + relationship in §4.1; **schema body = placeholder**) |
| Fields (coordinator; mention only): | `meal_plan_id`, `portion_category_id`, `count`, `athlete_count`, `updated_at`; PK (meal_plan_id, portion_category_id); `athlete_count <= count` |
| §4.2 | **−** protein_portions JSON example/rationale; **+** 2–3 sentences normalization rationale |
| §5 | ~ portion extensibility via **rows**, not JSONB keys |
| §8 | **−** “JSONB vs normalized MealPlanPortionRequirement still open” |

### D6 — `visible_to_households` / stored `is_shared` → `MealPlanHousehold`
| Entity / field | Delta |
|----------------|--------|
| `MealPlan.visible_to_households` | **−** remove (JSONB or dual-option language) |
| `MealPlan.is_shared` | **−** as **stored** field; **~** concept becomes **derived** (membership count > 1) |
| `MealPlanHousehold` | **+** new junction (name + relationship; **schema body = placeholder**) |
| Fields (coordinator; mention only): | `meal_plan_id`, `household_id`, `added_by_user_id`, `created_at`; PK (meal_plan_id, household_id) |
| Household hard delete | ~ **deactivate via `is_active` only** (supports RESTRICT FKs) |
| §6 GIN on `visible_to_households` | **−** (column gone; no blanket GIN anyway) |

### D7 — Content entities family-global; visibility only on MealPlans
| Entity | Delta |
|--------|--------|
| Recipe | ~ **family-global** note; keep `created_by_user_id` |
| Ingredient | ~ **family-global** note; keep `is_user_added`; **+ `created_by_user_id`** |
| ChefIdea | ~ **family-global** note; **+ `created_by_user_id`** (currently missing) |
| RecipeCombination | ~ **family-global** note; keep `created_by_user_id` |
| MealPlan (+ children) | ~ only entities with private/shared **visibility** model |
| §7 | □ policies for family-global vs household-visibility (coordinator) |

### D8 — MealPlan is date-ranged container
| Entity / field | Delta |
|----------------|--------|
| `MealPlan.plan_date` | **−** remove as alternative |
| `MealPlan.start_date` / `end_date` | **+**/confirm as **required** date model |
| `MealPlanAssignment.assignment_date` | ~ **must be within** parent `[start_date, end_date]` |
| Enforcement | State invariant in §4.1 / §6; trigger/Zod details = coordinator NEW_TABLE_SCHEMAS (do not invent alternate enforcement) |

### D12 — Deterministic unit conversion (`Unit` table)
| Entity / field | Delta |
|----------------|--------|
| `Unit` | **+** explicit lookup entity (name + role in §4.1 / §5; **schema body = placeholder**) |
| Fields (coordinator; mention only): | `id`, `name`, `abbreviation`, `dimension` ∈ {mass, volume, count}, `factor_to_base`, `is_active`, `sort_order`, `created_at` |
| Rules (state briefly if Unit is described outside placeholder): | convert/sum **only within dimension**; cross-dimension lines separate; **density deferred** |
| Existing refs | `Ingredient.default_unit_id`, `RecipeIngredient.unit_id` already assume units — now have a defined lookup |

### D13 — Indexes by query pattern only
| Area | Delta |
|------|--------|
| §6 “GIN indexes on all JSONB” | **−** blanket rule |
| §6 FTS “or triggers” | **−** trigger option; **keep generated tsvector columns** |
| §6 index policy | ~ **every index named with serving query**; B-tree/FK on junctions + date columns as needed; JSONB unindexed until needed |
| Soft-delete / checks / FKs | keep |

### D14 — Shopping-list / weekly protein roll-up = set-based SQL
| Area | Delta |
|------|--------|
| §6 DB functions discussion | □ insert `<!-- CLAUDE_SECTION: SHOPPING_LIST_VIEW -->` |
| Implementer prose | Do **not** invent SQL signature/shape; coordinator owns contract |
| §3 | Align: DB functions limited to this aggregation class |

### D15 — Category hierarchy = parent_id + recursive CTEs
| Field | Delta |
|-------|--------|
| `Category.level` | **−** remove |
| `Category.path` | **−** remove |
| Hierarchy approach | ~ **parent_id + recursive CTEs only** |
| ltree | ~ **future optimization note only**, not v1 design |

### D17 — Remove `FamilySettings.adult_reference_protein_oz`
| Field / note | Delta |
|--------------|--------|
| `FamilySettings.adult_reference_protein_oz` | **−** remove |
| `FamilySettings.athlete_multiplier` | keep (default 1.5) |
| `FamilySettings.other_global_defaults` | keep JSONB |
| `PortionCategory.base_protein_oz` | ~ **single source of truth** for base ounces; Adult Male row = editable adult base |

### D9–D11, D16 (context only — not Implementer schema work)
| Decision | Database PRD impact |
|----------|---------------------|
| D9–D11 testing | D10 RLS matrix lives in Product PRD / coordinator; §7 is placeholder only |
| D16 performance budgets | Product PRD concern; **not** Database PRD v0.4 scope |

### Entity summary table (v0.3 → v0.4)

| Entity | Action |
|--------|--------|
| Household | ~ deactivation-only removal note |
| User / Profile | stable |
| Ingredient | ~ family-global; + `created_by_user_id` |
| Recipe | ~ family-global |
| RecipeIngredient | stable (Unit defined elsewhere) |
| Category | − `level`, − `path`; CTE-only hierarchy |
| Tag | stable |
| PortionCategory | ~ SSoT note for `base_protein_oz`; deactivate-not-delete note |
| FamilySettings | − `adult_reference_protein_oz` |
| MealPlan | − `plan_date` alt, − `is_shared` stored, − `visible_to_households`, − `protein_portions`; confirm `start_date`/`end_date`; + relationships to new junctions |
| MealPlanAssignment | ~ date-range invariant; − portion override |
| RecipeCombination | ~ family-global |
| ChefIdea | ~ family-global; + `created_by_user_id` |
| Leftover decay (JSONB on Recipe) | keep |
| **MealPlanHousehold** | **+ new** (placeholder body) |
| **MealPlanPortionRequirement** | **+ new** (placeholder body) |
| **Unit** | **+ new** (placeholder body) |

---

## 3. Placeholders that must appear literally

Exact HTML comment strings (character-for-character). Implementer inserts these and writes **nothing else** at those positions.

| # | Location | Exact string |
|---|----------|--------------|
| 1 | §4.1 after MealPlan / MealPlanAssignment entries (where detailed defs of MealPlanHousehold, MealPlanPortionRequirement, Unit belong) | `<!-- CLAUDE_SECTION: NEW_TABLE_SCHEMAS -->` |
| 2 | §6 where shopping-list / roll-up function belongs | `<!-- CLAUDE_SECTION: SHOPPING_LIST_VIEW -->` |
| 3 | §7 entire section body (Security and Access Control) | `<!-- CLAUDE_SECTION: RLS_POLICIES -->` |

### What coordinator sections cover (map only — **do not paste into PRD**)

| Placeholder | Covers |
|-------------|--------|
| `NEW_TABLE_SCHEMAS` | MealPlanHousehold DDL + invariants (min membership, derived shared, RESTRICT); MealPlanPortionRequirement DDL + count/athlete_count semantics + canonical protein formula + FamilySettings DRY note; Unit DDL + dimension conversion rule; assignment-date trigger + Zod enforcement note |
| `SHOPPING_LIST_VIEW` | `generate_shopping_list(p_meal_plan_ids uuid[])` contract, join shape, return columns, scale_factor simplification, soft-delete rule, sibling weekly protein roll-up + contract test |
| `RLS_POLICIES` | Full §7 replacement: authority model, helpers, policy shapes A/B/C, anon, Realtime, audit |

**Also in coordinator file but NOT a Database PRD placeholder:** `CLAUDE_SECTION: RLS_TEST_MATRIX` → Product PRD testing section. Implementer must **not** insert this into Database PRD v0.4.

**Uncertainty rule (brief):** where unsure, use `<!-- TODO(coordinator): question -->` rather than guessing — not a CLAUDE_SECTION, but allowed inline.

---

## 4. Voice / terminology consistency notes

### Keep (Database PRD v0.3 voice and product language)
- Formal, structured PRD tone; section numbering; entity-first descriptions with “Key fields” / “Relationships”
- Product name context: recipe & meal planning for **one family / three households**
- **Shared vs private** meal plans (concept remains; storage model changes)
- Entity names: **Household, Ingredient, Recipe, RecipeIngredient, Category, Tag, PortionCategory, FamilySettings, MealPlan, MealPlanAssignment, RecipeCombination, ChefIdea**
- **leftover_decay_path** / “daughter element” leftover language; **make_again_rating** (1–5)
- **food_safety_profile** with FDA/EPA-style guidance
- Portion dimensions: age, sex, athlete; protein-only v1 with path to multi-macro
- Supabase / PostgreSQL; soft-delete pattern; family administrator role
- Hybrid relational + JSONB **as a principle**, but scoped correctly after D5/D6

### Change (decision-aligned terminology)
| Prefer in v0.4 | Avoid / retire |
|----------------|----------------|
| `MealPlanPortionRequirement` (`count`, `athlete_count`) | `protein_portions` JSONB; boolean `athlete` per group |
| Derived shared-ness from `MealPlanHousehold` membership | Stored `is_shared`; `visible_to_households` JSONB array |
| `start_date` / `end_date` container | `plan_date` or dual-option date model |
| `parent_id` + recursive CTEs | `level` / `path` / current ltree as v1 |
| Index-by-query-pattern; generated tsvector FTS | “GIN on all JSONB”; FTS via triggers |
| tRPC inside Next.js; RLS sole auth; user JWT | NestJS; Edge Functions v1; service-role user writes |
| PortionCategory `base_protein_oz` as adult/base SSoT | `FamilySettings.adult_reference_protein_oz` |
| Family-global content + MealPlan-only visibility | Implying content is household-private |

### Product name spelling
| Source | Spelling |
|--------|----------|
| `Menu_Boss_design_concepts.md` | “Menu Boss” (with space) |
| `Product_PRD_v0.1.md` | “MenuBoss” (no space) |
| Database PRD v0.3 | Does not brand-title the product in header (“Recipe & Meal Planning Application”) |

**Recommendation for Implementer:** Keep Database PRD product title style as in v0.3 (descriptive, not brand-forced). If mentioning the product name once, prefer **MenuBoss** to match Product PRD, or avoid branding. Flag for coordinator rather than inventing a rename pass.

```html
<!-- TODO(coordinator): Canonical product name spelling — "MenuBoss" (Product PRD) vs "Menu Boss" (design concepts). Database PRD v0.3 avoids brand in title; confirm preferred form if v0.4 mentions product name. -->
```

### Design concepts alignment (terminology to preserve for Product/UI consistency)
- Shared vs private plans and calendar clarity
- Portion scaling (age/sex/athlete), food safety surfacing, RecipeCombination, ChefIdea, leftover decay paths
- “Make again” rating language
- These docs are **UX-facing**; they do not dictate JSONB vs tables — **no need to update design concepts for D5/D6 storage**, but product language “shared badge” should remain compatible with **derived** shared-ness

### Profile entity naming
- DB PRD: “User / Profile”
- Coordinator SQL: `profile(id)`
- Product PRD: “profiles or household_members”
- **Keep** “User / Profile” in DB PRD unless coordinator standardizes; do not invent `household_members` table in v0.4 without a decision.

```html
<!-- TODO(coordinator): Confirm canonical table name profile vs profiles vs household_members for Product PRD ↔ Database PRD alignment. -->
```

---

## 5. Open items — KEEP vs REMOVE in §8

### REMOVE from §8 (resolved by design review)

| v0.3 open item (paraphrase) | Resolved by |
|-----------------------------|-------------|
| Final decision JSONB `protein_portions` vs normalized `MealPlanPortionRequirement` | **D5** (normalized) |
| Visibility storage / dual JSONB-or-junction language (implied by model + D6) | **D6** (`MealPlanHousehold`; derived shared) |
| Detailed RLS + complete auth model “pending final system architecture” | **D1** + architecture decided; **§7 placeholder** owns policy text |
| Full-text search implementation details as open choice (tsvector vs triggers) | **D13** (generated tsvector only) |
| (Implicit) architecture stack undecided | **D1, D2** → move resolution into §3, not §8 |

Also **do not re-list** as open: stored `is_shared`, `visible_to_households`, `adult_reference_protein_oz`, Category `level`/`path` as open design questions.

### KEEP in §8 (genuinely open)

Per brief §8 instructions and v0.3 residual truth:

1. **Multi-macro / full-meal scaling** beyond protein-only (roadmap; not v1)
2. **PantryStock / inventory** tracking for advanced planning and waste reduction
3. **AI integration strategy** (recipe generation, suggestions, substitutions) — model should stay queryable
4. **food_safety_profile** evolution toward dedicated lookup/junction / population-specific automation
5. **Performance validation** of aggregation queries at real data volumes (budgets themselves are Product/D16; **validation** still open for DB)
6. **Maturation** of RecipeCombination / ChefIdea / leftover_decay_path toward richer linking or more normalized structures **as usage is observed** (still valid; not “resolved by D5”)

### Optional tighten (voice, not removal of topic)
- v0.3 §8 mentions “Maturation of the new v0.2 entities…” — keep substance; drop implication that architecture is still choosing JSONB-vs-junction for **portions/visibility** (those are closed).
- Do **not** keep “exact responsibility for full-meal scaling” as if stack ownership is unknown; stack is decided — scaling **product** design remains open.

---

## 6. Cross-document inconsistencies (flag for coordinator)

Each item includes a recommended `<!-- TODO(coordinator): ... -->` for the Implementer to optionally leave in the draft if they must touch adjacent wording, or for Integrator follow-up on Product PRD.

### 6.1 Product PRD v0.1 vs design brief / future DB PRD v0.4

| Topic | Product PRD v0.1 | Brief / DB v0.4 target | Flag |
|-------|------------------|------------------------|------|
| Backend framework | NestJS **or** tRPC; Edge Functions optional | **tRPC in Next.js only**; no NestJS; no Edge Functions v1 | Architecture |
| Authz / service role | Backend may use service role for writes / shared plans | **RLS sole authority**; JWT clients; service role = system jobs only | Security |
| Data model ref | Incorporates DB PRD **v0.3**; `protein_portions` JSONB | DB **v0.4**; normalized portions | Version skew |
| Visibility | `is_shared`, `visible_to_households` in API inputs | Derived shared; `MealPlanHousehold` | Schema/API |
| FamilySettings | Editable **adult base protein** + athlete multiplier | Adult base on **PortionCategory** only; settings keep multiplier | DRY / D17 |
| JSONB strategy | Heavily used including protein_portions; GIN on JSONB | Protein/visibility not JSONB; no blanket GIN | Indexing |
| Offline | Background sync for offline **edits** | **D4:** v1 offline = **read-only** cache | Product phasing |
| Shopping list | Backend aggregates with portion multipliers on ingredients | Coordinator: scale_factor = servings/yield; protein **informs** servings, does not auto-scale ingredients | Scaling semantics |
| Direct Supabase from FE | Preferred for simple CRUD | Compatible with D1 if JWT + RLS; Product still implies dual path with service-role backend | Clarify data flow |
| Phase 2 packaging | Enhanced shopping lists, nutrition, offline improvements, admin tools | Align later; DB v0.4 already assumes Unit + set-based shopping function | Phasing |

**Recommended coordinator TODOs (Product PRD revision track, not DB invent):**

```html
<!-- TODO(coordinator): Product PRD v0.1 still documents NestJS/Edge Functions, service-role writes, protein_portions JSONB, is_shared/visible_to_households, and FamilySettings.adult base. Align Product PRD to D1–D8, D12–D15, D17 when Database PRD v0.4 is integrated. -->
```

```html
<!-- TODO(coordinator): Product PRD offline strategy (background sync of edits) conflicts with D4 (v1 offline read-only). Confirm Product PRD Phase wording. -->
```

```html
<!-- TODO(coordinator): Product PRD shopping-list text implies portion multipliers rescale ingredients; coordinator SHOPPING_LIST_VIEW uses servings/yield scale_factor and defers protein-driven ingredient scaling to Phase 3. Align Product §8.7 / §10. -->
```

```html
<!-- TODO(coordinator): Database PRD version reference in Product PRD §4/§7/Appendix still says v0.3 — bump to v0.4 after merge. -->
```

### 6.2 Design concepts vs brief

| Topic | Design concepts | Conflict? |
|-------|-----------------|-----------|
| Shared vs private UX | Required clarity | **No** — derived shared still supports badge |
| Portion UI counts + athlete | Yes | **No** — maps to count/athlete_count |
| Live protein totals | Yes | **No** — pure TS calc (D3) |
| Shopping list “respects portion calculations” | Yes | **Soft** — same servings/yield vs auto protein-scale nuance as Product PRD |
| PWA mobile-first | Yes | **No** for DB |
| Entity names RecipeCombination, ChefIdea, decay paths | Yes | **Aligned** |

```html
<!-- TODO(coordinator): Optional design-concepts footnote that shared state is derived from household membership count (not a stored is_shared flag) — UX-only doc, low priority. -->
```

### 6.3 Brief vs Claude-authored sections (for Implementer awareness)

These are **not** Implementer conflicts if placeholders are used correctly:

- Claude includes full SQL and invariants; Implementer **names** tables and states high-level relationships/invariants only where instructed (e.g., assignment_date range, deactivate-not-delete).
- Claude restates D17 FamilySettings removal — Implementer must apply that in FamilySettings **and** rely on placeholder for formula text (avoid **duplicating** long formula prose outside placeholder if it would create dual maintenance; brief does **not** require Implementer to restate the full Σ formula in §4.1).
- Claude assignment-date enforcement = triggers + Zod; brief says state invariant only — **do not** invent a CHECK constraint that references the parent table.

### 6.4 Internal v0.3 self-inconsistencies the revision should clean up

| Issue | Notes |
|-------|--------|
| MealPlan date: `plan_date` **or** `start_date`/`end_date` | Dual option → **D8** single model |
| Visibility: JSONB array **or** junction | Dual option → **D6** junction only |
| Portions: JSONB preferred but §8 still open to junction | Dual option → **D5** junction only |
| Category: `path` materialized **or** ltree | → **D15** neither in v1 |
| Units referenced (`unit_id`) but no Unit entity | → **D12** define via placeholder |
| ChefIdea missing `created_by_user_id` while Recipe/RecipeCombination have it | → **D7** add |
| “Architecture not finalized” throughout while Product PRD already drafts Nest/tRPC | → **D1/D2** decided; DB PRD should stop hedging on decided stack |

### 6.5 Out of scope for Implementer (do not invent)

- New entities beyond MealPlanHousehold, MealPlanPortionRequirement, Unit
- Offline sync tables, pantry schema, AI tables
- Full RLS policy SQL or shopping-list SQL in Implementer prose
- Performance budget numbers (D16)
- RLS test matrix (Product PRD / coordinator)
- Renaming MealPlan → something else; multi-family tenancy; public sharing

---

## 7. Implementer checklist (quick)

1. Start output with `## INTEGRATION NOTES` (one line per change), then full PRD.
2. Header → v0.4, July 15 2026, “Revised per design review”, Changes in v0.4 for D5–D8, D12–D15, D17 + D1/D2.
3. Update Critical Note (architecture decided / design review reflected).
4. Rewrite §3 assumptions per D1, D2, D3, D14; open-item hedging only for pantry/AI/multi-macro.
5. Apply all §4.1 field/entity deltas in §2 of this brief; insert `NEW_TABLE_SCHEMAS` placeholder.
6. Rewrite §4.2: delete protein_portions block; keep leftover + food_safety examples.
7. Update §5 extensibility (rows, CTEs, Unit).
8. Rewrite §6 per D13; insert `SHOPPING_LIST_VIEW` placeholder; assignment-date invariant.
9. §7 body = only `RLS_POLICIES` placeholder.
10. §8: remove resolved items; keep pantry, AI, multi-macro, food-safety normalization, performance validation, entity maturation.
11. Preserve voice; no new features; use `<!-- TODO(coordinator): ... -->` when uncertain.
12. Do **not** paste content from `drafts/claude_authored_sections.md`.

---

## 8. Source path index (absolute)

- Design brief: `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f642a-b38f-78a2-ba5f-cfa3f6f79b1f\grok_01_database_prd_v0.4_revision.md`
- DB PRD v0.3: `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f642a-b38f-78a2-ba5f-cfa3f6f79b1f\Recipe_Meal_Planning_Database_PRD_v0.3.md`
- Claude sections: `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f642a-b38f-78a2-ba5f-cfa3f6f79b1f\drafts\claude_authored_sections.md`
- Product PRD: `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f642a-b38f-78a2-ba5f-cfa3f6f79b1f\Product_PRD_v0.1.md`
- Design concepts: `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f642a-b38f-78a2-ba5f-cfa3f6f79b1f\Menu_Boss_design_concepts.md`
- **This research file:** `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f642a-b38f-78a2-ba5f-cfa3f6f79b1f\drafts\research_grok_01_findings.md`

---

*End of research brief. No revised PRD produced.*
