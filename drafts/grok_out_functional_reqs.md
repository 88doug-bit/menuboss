## INTEGRATION NOTES

- **Target document:** Product PRD (`Product_PRD_v0.1.md` → v0.2). Replace only §8.1, §8.2, §8.3, §8.7, and §8.8 under **§8 Detailed Functional Requirements**.
- **Do not touch:** §8.4 RecipeCombination, §8.5 ChefIdea, §8.6 Leftover Management. Do not renumber sections.
- **Decisions implemented:** D3 (derived portion totals via pure TS shared function), D5 (`MealPlanPortionRequirement` with `count`/`athleteCount`), D6/D7 (household membership on plans only; content family-global), D8 (`start_date`/`end_date` + in-range `assignment_date`), D11 (edge-case ACs), D12 (deterministic same-dimension unit conversion; cross-dimension separate lines), D14 (set-based shopping-list SQL function; optional ingredients separate).
- **Related schema language:** Aligns with Database PRD v0.4 and coordinator sections (`MealPlanHousehold`, `MealPlanPortionRequirement`, `Unit`, `generate_shopping_list`). Product text stays at product level; no SQL DDL here.
- **Paste instructions:** For each delimiter block below, replace the matching `### 8.x …` subsection (heading through its Acceptance Criteria block, exclusive of the next `###`) with the content under that delimiter (including the `###` heading).
- **§8.4–§8.6:** Leave unchanged in the PRD even though D7 also implies family-global visibility for combinations/ideas; those sections may be aligned in a later hygiene pass if needed.

---

=== REPLACEMENT: §8.1 ===

### 8.1 Recipe & Ingredient Management
- Users can create, view, edit, and soft-delete recipes and ingredients. Hard delete is never offered in the UI; soft-delete preserves historical integrity for meal plans and shopping lists.
- **Recipes and ingredients are family-global (D7):** every authenticated family member can browse and use them. Visibility filtering does **not** apply to recipe or ingredient content. Each record stores `created_by` (user) attribution for provenance; attribution does not restrict read access.
- Recipes support rich instructions (structured steps with optional timers, temperatures, techniques), yield/servings, prep/cook/total time, source attribution, and images.
- Ingredients support master data with default units, optional nutritional data, and `food_safety_profile` (JSONB).
- Hierarchical categories (nutrition taxonomy) and flexible tags (meal type, cuisine, preparation method, dietary, difficulty, etc.) can be assigned to both recipes and ingredients. Categories support unlimited depth via parent-child relationships.
- Food safety information (FDA categories, risk levels such as mercury, recommended frequency, population-specific notes) is displayed prominently when viewing or selecting ingredients/recipes that have safety profiles.
- Family administrators can curate and update food safety profiles and global category/tag lists without code changes.
- Search and basic filtering work across recipe title, description, ingredients, categories, and tags. Soft-deleted recipes and ingredients are excluded from browse/search result sets.
- Soft-deleted recipes remain visible wherever they are already assigned—both historical and active/future meal plans—and are **badged as deleted** in those contexts so planners know the source recipe was removed from the catalog. Soft-deleted recipes do not appear in recipe browsers or global search.
- Un-deleting a soft-deleted recipe restores it to browse/search and clears the deleted badge on plan surfaces that still reference it.
- Soft-deleting an ingredient that is still referenced by one or more recipes is allowed. Affected recipes are **badged** (e.g., “references deleted ingredient”) so cooks can replace or restore the ingredient; the soft-deleted ingredient is hidden from normal ingredient pickers/search.
- Ingredient names must be unique within the family catalog **case-insensitively** at creation time. An attempt to create a duplicate name is rejected with a clear message and a **merge suggestion** pointing at the existing ingredient (users may open/edit the existing record instead of creating a parallel one).

**Acceptance Criteria (examples):**
- A user can add a new seafood ingredient and attach an FDA-aligned mercury profile with recommended serving frequency in under 2 minutes.
- Changing a recipe’s category or tags immediately affects search and filtering results for all family members (family-global catalog).
- Any family member can open a recipe created by another household’s cook; the recipe detail shows creator attribution and is not filtered by household.
- Soft-deleted recipes are hidden from active browsing and global search.
- Soft-deleted recipes remain visible (with a clear “deleted” badge) on historical meal plans **and** on active/future plans that still assign them.
- Un-deleting a soft-deleted recipe restores it to browse/search and removes the deleted badge from plan views that reference it.
- Soft-deleting an ingredient still used by recipes succeeds; each affected recipe shows a badge or warning that it references a deleted ingredient; hard delete of ingredients is not available in the UI.
- Creating an ingredient named “Olive Oil” when “olive oil” already exists is rejected with a clear duplicate-name message and a merge/open suggestion for the existing record.
- Creating an ingredient with a distinct name (no case-insensitive match) succeeds and appears in family-wide search.

---

=== REPLACEMENT: §8.2 ===

### 8.2 Portion Scaling & Food Safety
- Portion needs for a MealPlan are stored as **`MealPlanPortionRequirement` rows** (D5): each row is `(portionCategoryId, count, athleteCount)`. The legacy boolean “athlete flag per group” and `protein_portions` JSONB are removed. `athleteCount` is the number of people within `count` who receive the athlete multiplier; the constraint **`athleteCount ≤ count`** is enforced (application validation + database check).
- Family administrators edit **per-category base protein ounces** on `PortionCategory` rows. The **Adult Male** category row is the 6 oz family reference default; other categories carry their own `base_protein_oz` values. There is no separate FamilySettings “adult base oz” field—base ounces live only on PortionCategory (single source of truth).
- Family administrators edit the family-wide **athlete multiplier** on `FamilySettings` (default 1.5×).
- When creating or editing a MealPlan, users enter **`count` and `athleteCount` per PortionCategory** (e.g., adult male/female, adolescent bands, child, senior). Rows with `count = 0` are not kept; absence of a row means zero people in that category.
- **Displayed total protein requirement is always derived (D3):** a single pure TypeScript function in a shared package (`packages/portion-calc` or equivalent) computes:

  ```
  effective_protein_oz(plan) =
    Σ over requirement rows r:
      ( (r.count − r.athlete_count)
        + r.athlete_count × family_settings.athlete_multiplier )
      × portion_category.base_protein_oz
  ```

  The UI live preview, server procedures, and offline-capable read paths all use this same function. Totals are recomputed whenever FamilySettings or PortionCategory base values change. **No stored/stale total is ever shown as authoritative.**
- Live preview of the calculated total updates as the user changes counts (target: **&lt;100 ms** feedback for count edits; ties to product performance budgets).
- Food safety notes (especially mercury risk and frequency guidance for seafood) are surfaced contextually when recipes containing flagged ingredients are added to plans or viewed.
- Portion **counts** are plan-scoped (entered for that MealPlan). Shared plans do not auto-merge counts from other households; the creating household (or editor) sets the requirement rows for the plan. Calculated protein totals inform the planner’s **servings** choices on assignments; they do not silently rewrite ingredient lines (see §8.7).

**Acceptance Criteria (examples):**
- Entering `count = 2`, `athleteCount = 1` for Adult Male with base 6 oz and athlete multiplier 1.5× yields displayed total contribution `(1 + 1×1.5) × 6 = 15` oz from that category (plus any other categories).
- Submitting or saving a requirement with `athleteCount > count` is rejected with a clear, user-visible message (e.g., athlete count cannot exceed people in that category); the invalid row is not persisted.
- A plan where every portion category has `count = 0` (or no requirement rows) displays **0 oz** required and does not error.
- Generating a shopping list for a zero-count plan produces an **empty list without error** (see also §8.7).
- Deactivating a PortionCategory: existing plans that already have requirement rows for that category still **display and calculate** using its stored base ounces; the deactivated category is **not offered** when adding or editing requirement rows on new or updated plans.
- Changing FamilySettings `athlete_multiplier` or any PortionCategory `base_protein_oz` mid-week immediately changes the **displayed** protein totals on **all** plans that use those values—no plan shows a previously cached/stale total as the live requirement.
- After a settings/base change, reopening any plan editor or calendar protein summary shows totals that match a fresh call to the shared pure calculation function (acceptance: no UI surface presents a stored total that disagrees with the pure function over current settings + requirement rows).
- Changing counts in the plan editor updates the live protein preview in under 100 ms under normal local conditions (performance budget).
- When a recipe containing shrimp is added to a plan, relevant FDA “Good Choices” guidance and serving frequency notes appear without extra clicks.
- Family admins can adjust the athlete multiplier and Adult Male (or any category) base ounces and see the change reflected in subsequent calculations and displays across the family.

---

=== REPLACEMENT: §8.3 ===

### 8.3 Meal Planning & Calendar
- Users create MealPlans as **date-ranged containers** with required **`start_date` and `end_date` (D8)**. Recipes are assigned via MealPlanAssignment rows that carry an **`assignment_date`** and meal slot (breakfast, lunch, dinner, snack, etc.).
- **Invariant:** every `assignment_date` must fall within the parent plan’s inclusive `[start_date, end_date]` range. Attempts to create or move an assignment outside that range are **rejected with a clear error**. Shrinking a plan’s date range so that existing assignments would fall outside is **rejected** until those assignments are moved or removed.
- **Sharing model (D6):** visibility is controlled only by **`MealPlanHousehold` membership rows**. At create time the user selects which households can see the plan; the creating household is always a member and **cannot be removed**. There is no stored `is_shared` flag: the **“shared” badge is derived** from membership count &gt; 1.
- Content entities (recipes, ingredients, combinations, ideas) are not plan-visibility-scoped; only MealPlans (and their assignments, portion requirements, and membership) are.
- A calendar view displays plans with clear visual distinction between **shared** plans (membership count &gt; 1) and **private** plans (creating household only).
- **Permissions (v1):** members of the **creating household** (and family admins) can edit the plan. Members of a **shared but non-creating** household can **view** the plan and its assignments on the calendar but **cannot edit** in v1.
- Realtime updates occur when any authorized change affects a plan visible to a household (including share/unshare membership changes). Supabase Realtime respects RLS so clients only receive plans they may select.

**Acceptance Criteria (examples):**
- A user in Household A can create a plan with `start_date`/`end_date` spanning a weekend and membership rows for Households A and B; Household C cannot see or edit it unless explicitly added as a member.
- The calendar shows a “shared” badge (or equivalent visual) only when more than one household is a member; a single-household plan appears private with no shared badge.
- Assigning a recipe to a date inside the plan range succeeds; assigning to a date **outside** `[start_date, end_date]` is rejected with a clear, user-visible error and no row is saved.
- Attempting to shrink a plan’s `end_date` (or widen-in-reverse) so an existing assignment would fall outside the new range is **rejected** until that assignment is moved or removed; after moving/removing stranded assignments, the range update succeeds.
- Unsharing Household B (removing its membership row) removes Household B’s visibility **immediately**; Household B’s calendar updates in realtime and no longer shows the plan. The creating household’s membership cannot be removed (attempt is rejected with a clear error).
- A member of a shared non-creating household can open and view the plan and its assignments but cannot save edits to the plan, assignments, portion requirements, or membership list in v1.
- Editing a shared plan (by the creating household) triggers realtime calendar refresh for all currently member households.
- Private plans (creating household only) are never visible outside that household.

---

=== REPLACEMENT: §8.7 ===

### 8.7 Shopping List Generation (Derived)
- Users generate shopping lists from one or more selected MealPlans. Generation is backed by a **single set-based SQL function** (`generate_shopping_list`, D14) that joins plans → assignments → recipes → recipe ingredients → units. The function runs as **SECURITY INVOKER** so **RLS automatically limits** which plans contribute; plan IDs the caller cannot see contribute **zero rows** rather than erroring.
- **Quantity scaling (v1):** each ingredient line is scaled by  
  `scale_factor = assignment.servings / recipe.yield_servings`.  
  The plan’s calculated protein requirement **informs the user’s servings choice** (protein total is displayed in the assignment/plan editor). It does **not** silently rescale individual ingredient lines in v1—mapping “oz of protein needed” onto specific recipe lines is not decidable without protein-line tagging (Phase 3 candidate).
- **Unit conversion is deterministic (D12):** quantities convert and sum **only within the same dimension** (mass, volume, or count) using `Unit.factor_to_base` (`quantity × factor_to_base`, then optional display-unit formatting). **Cross-dimension pairs are never merged by guessing** (no density-based mass↔volume conversion in v1). When the same ingredient appears in different dimensions, the list shows **separate lines under one ingredient heading**.
- **`is_optional` ingredients aggregate separately** into an **Optional** group (or equivalent section). Optional quantities never add into the main (required) quantity for that ingredient.
- Soft-deleted recipes that remain assigned on included plans **still contribute** to the list; UI surfaces may badge those lines as coming from a deleted recipe.
- Lists can be exported or shared (print, copy; future grocery integration out of scope for v1).
- Empty plans (no assignments, or all zero contribution) produce an **empty shopping list without error**.

**Acceptance Criteria (examples):**
- Generating a list for one or more RLS-visible plans returns a single aggregated result set; invisible plan IDs in the request do not leak ingredients and do not cause a hard failure.
- Two recipes on selected plans that both use 200 g flour produce one main-line flour total of 400 g (same dimension, converted via `factor_to_base` as needed), not two unmerged rows.
- **Cross-dimension example:** if one recipe lists flour as **500 g** (mass) and another as **2 cups** (volume), the shopping list shows flour once as a heading with **two separate lines**—“500 g” and “2 cups”—and does not invent a single combined quantity.
- An optional garnish (e.g., `is_optional = true` parsley) appears only under the **Optional** group and **never inflates** the main/required quantity for parsley (or any other ingredient).
- Ingredient lines scale with `assignment.servings / recipe.yield_servings` (e.g., a 4-serving recipe assigned at 8 servings doubles each non-optional line for that assignment).
- Changing only the displayed protein total (portion requirement rows) without changing assignment `servings` does **not** change shopping-list quantities in v1.
- Soft-deleted recipes still on included plans contribute their ingredients; the list or line is badged so the user can see the source recipe is deleted.
- Selecting plans with no assignments (or no contributing ingredients) yields an **empty list** and **no error**.
- Multi-plan generation across households: when the caller can see both a private plan and a shared plan, ingredients from both are deduplicated per the same-dimension rules above; a second household that can see only the shared plan does not receive private-plan lines (RLS).
- Export/print of a generated list includes both main and Optional sections when optional items are present.

---

=== REPLACEMENT: §8.8 ===

### 8.8 Search, Filtering & Discovery
- Global search works across **recipes, ChefIdeas, combinations, and ingredients**—the **family-global catalog (D7)**. All authenticated family members search the whole family’s content; household membership does **not** hide recipes, ideas, combinations, or ingredients from search results.
- Soft-deleted catalog items are excluded from search and browse (see §8.1); they may still appear in plan-derived contexts with deleted badges.
- Filters include categories (hierarchical), tags, portion suitability, food safety flags, make-again rating, and time commitment.
- **Meal plans and plan-derived surfaces remain visibility-filtered:** calendar search/filter, “plans this week,” and shopping-list plan pickers only include MealPlans the caller’s household can see via `MealPlanHousehold` membership (RLS). Search of the content catalog must not be described or implemented as “household-visible content only.”
- Creator attribution may be shown on results but is not used as a visibility gate.

**Acceptance Criteria (examples):**
- A user can filter for “high-protein, quick weeknight dinners suitable for adolescents” and see relevant recipes **and** any matching ChefIdeas from the entire family catalog, including items created by other households.
- Food safety warnings appear inline in search results when relevant ingredients are present.
- A recipe created by Household B appears in Household A’s recipe search without any share action (family-global content).
- Soft-deleted recipes do not appear in global search or the recipe browser.
- Filtering or searching the calendar / meal-plan list never shows another household’s private plan; shared plans the user’s household is a member of do appear.
- Plan pickers used for shopping-list generation only list RLS-visible plans, even though recipe search remains family-global.
