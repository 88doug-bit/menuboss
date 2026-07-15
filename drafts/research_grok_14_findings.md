# Research Brief — Task 14 (Recipe & Ingredient Editors)

**Agent:** Researcher  
**Branch:** `research/grok-14`  
**Date:** 2026-07-15  
**Audience:** Implementer / Tester / Reviewer for `grok_14_recipe_ingredient_editors.md`  
**Scope:** Investigation only. **Do not** treat this as UI source, form components, or router patches. **Do not invent** procedures beyond the brief + existing Wave 1 routers.

**Primary inputs (read fully):**

| File | Role |
|------|------|
| `grok_14_recipe_ingredient_editors.md` | Task 14 brief: editor routes, forms, tests, constraints |
| `Product_PRD_v0.2.md` §8.1, §9.2 | Soft-delete/restore/merge ACs; recipe browser/detail UX |
| `Recipe_Meal_Planning_Database_PRD_v0.4.md` §4.1–4.2 | Recipe / RecipeIngredient / Ingredient / Unit / food_safety_profile |
| `packages/schemas/src/recipe.ts` | `recipeCreate`/`Update`, instructions, ingredient lines, decay path |
| `packages/schemas/src/ingredient.ts` | create/update/list, foodSafetyProfile, setFoodSafetyProfile |
| `apps/web/src/server/routers/recipe.ts` | create/update/softDelete/restore (+ list/byId/rate/setLeftoverDecayPath) |
| `apps/web/src/server/routers/ingredient.ts` | create/update/softDelete/setFoodSafetyProfile (+ list/byId) |
| `apps/web/src/server/dbErrors.ts` | `conflictWithExisting` CONFLICT shape |
| `apps/web/src/server/trpc.ts` | errorFormatter; adminProcedure |
| Wave 2 UI | `ContentFilters`, `LeftoverDecayPath`, `InstructionSteps`, `IngredientLine`, `RecipeDetail`, `MealPlanEditor` (RHF pattern) |
| `supabase/migrations/0001_schema.sql` + `0002_security.sql` | unit columns/RLS; ingredient uniqueness |
| `supabase/seed.sql` | Fixed unit UUIDs by dimension |

**Out of scope (do not implement here):** new routers (unless coordinator explicitly unlocks `unit.list`), schema/migration changes, Task 15 admin vocab screens, image upload (Phase 2), portion-calc.

---

## 1. Procedure inventory

Backend routers already ship (Wave 1). Task 14 **consumes** them; brief: *no new routers/procedures except where explicitly listed* (none are listed as new).

### 1.1 `recipe` — create / update / softDelete / restore

| Procedure | Kind | Auth | Input schema | Behavior relevant to editors |
|-----------|------|------|--------------|------------------------------|
| **`create`** | mutation | `authedProcedure` | `recipeCreateInputSchema` | Inserts recipe + `created_by_user_id`; replace-all `recipe_ingredient`, `recipe_category`, `recipe_tag`. Returns `RecipeDto` (no nested ingredients). |
| **`update`** | mutation | `authedProcedure` | `recipeUpdateInputSchema` (`partial` create + required `id`) | Updates only provided scalar fields (`recipeWriteFields`). If `ingredients` / `categoryIds` / `tagIds` present → full replace of those junctions. Filters update with `deleted_at IS NULL` (cannot update soft-deleted via update). Re-selects and returns `RecipeDto`. |
| **`softDelete`** | mutation | `authedProcedure` | `idInputSchema` `{ id }` | Sets `deleted_at = now()` only if currently live; else NOT_FOUND. |
| **`restore`** | mutation | `authedProcedure` | `idInputSchema` `{ id }` | Sets `deleted_at = null` only if currently deleted; else NOT_FOUND. |

**Also available (detail/supporting, not the five named in the research ask):**

| Procedure | Use in Task 14 |
|-----------|----------------|
| `list` | Ingredient picker search is `ingredient.list`; recipe browser already uses `recipe.list`. |
| `byId` | Edit form hydrate; soft-deleted detail still returns (no `deleted_at` filter) — enables restore UI. |
| `rate` | Detail-only today; not required on editor form. |
| `setLeftoverDecayPath` | Detail uses it for independent save. Editor may either embed `leftoverDecayPath` in create/update **or** reuse Wave 2 component with this mutation after save. Prefer **embed on create/update** for new form save path; keep `setLeftoverDecayPath` for post-create detail edits (existing pattern). |

**Create payload fields (Zod → form map):**

```
title, description?, instructions[] { text, timerMinutes?, temperature? },
prepTimeMinutes?, cookTimeMinutes?, totalTimeMinutes?,
yieldServings (>0, default 1), sourceUrl? | "", sourceBook?,
isTemplate?, makeAgainRating?, leftoverDecayPath[],
ingredients[] { ingredientId, quantity>0, unitId, preparationNote?, sequenceOrder≥0, isOptional },
categoryIds[], tagIds[]
```

**Update:** all of the above optional except `id`.

**Replace semantics:** ingredient lines and category/tag junctions are **delete-all then insert** when the array is provided. Omitting `ingredients` on update leaves existing lines unchanged.

### 1.2 `ingredient` — create / update / softDelete / setFoodSafetyProfile

| Procedure | Kind | Auth | Input schema | Behavior relevant to editors |
|-----------|------|------|--------------|------------------------------|
| **`create`** | mutation | `authedProcedure` | `ingredientCreateInputSchema` | Insert + junctions. On Postgres `23505` (uq_ingredient_name): look up live row by `ilike` name → **`conflictWithExisting`**. Default `isUserAdded: true`. |
| **`update`** | mutation | `authedProcedure` | `ingredientUpdateInputSchema` | Partial: `name?`, `description?`, `defaultUnitId?` (nullable), `categoryIds?`, `tagIds?`. Same CONFLICT path if name collides. **No `foodSafetyProfile` or `nutritionData` on this schema.** Live rows only (`deleted_at IS NULL`). |
| **`softDelete`** | mutation | `authedProcedure` | `idInputSchema` | Soft-delete allowed even when recipes still reference (badge is app concern, §8.1). |
| **`setFoodSafetyProfile`** | mutation | **`adminProcedure`** | `{ id, foodSafetyProfile }` | Admin-gated write of full JSONB profile. Non-admins: procedure returns FORBIDDEN; UI must hide editor and show read-only (mock `family.me` role in tests). |

**Also available:**

| Procedure | Use in Task 14 |
|-----------|----------------|
| `list` | Searchable picker + ingredient manager list. Filters: `q`, `categoryIds`, `hasSafetyProfile`, cursor pagination. **No `isUserAdded` filter** (see ambiguities). |
| `byId` | Drawer hydrate; includes soft-deleted (badge). Returns `categoryIds` / `tagIds`. |

**Not present:** `ingredient.restore`. Soft-deleted ingredients can be recreated under the same name (partial unique index allows reuse after delete), but there is **no restore procedure** analogous to `recipe.restore`.

### 1.3 Auth / role surface for admin-gated safety editor

| Call | Role field | Use |
|------|------------|-----|
| `family.me` | `profile.role: "admin" \| "member"` | Client gate: show editable safety form only when `role === "admin"`. |
| `adminProcedure` | `is_family_admin` RPC | Server gate for `setFoodSafetyProfile`. |

Display gate ≠ RLS: RLS still applies; `adminProcedure` is UX/contract gate only (`trpc.ts` comments).

---

## 2. Unit select data source gap

### 2.1 What the brief requires

Ingredient lines need:

> unit select **grouped by dimension** (mass / volume / count)

Recipe ingredient schema requires `unitId: uuid`. Ingredient create mini-flow needs optional `defaultUnitId`.

### 2.2 What exists today

| Layer | Status |
|-------|--------|
| DB table `unit` | Columns: `id, name, abbreviation, dimension CHECK (mass\|volume\|count), factor_to_base, is_active, sort_order, …` (`0001_schema.sql`) |
| RLS | Shape C: **SELECT** for any family member; INSERT/UPDATE **admin only** (`0002_security.sql`) |
| Seed | 14 fixed UUIDs — mass `…101–104`, volume `…111–116`, count `…121–124` (`supabase/seed.sql`) |
| tRPC | **No `unit` router.** `_app.ts` has recipe, ingredient, category, tag, chefIdea, recipeCombination, mealPlan, family, health only. |
| Existing unit read | `mealPlan.generateShoppingList` does `ctx.supabase.from("unit").select(...).eq("is_active", true)` **server-side only** for display formatting — not exposed to clients. |

### 2.3 Gap statement

**There is no client-callable procedure to list units for a grouped `<select>`.**  
Task 14 constraint forbids adding procedures unless explicitly listed; the brief does **not** list `unit.list`.

### 2.4 Options for implementer (coordinator decision required)

| Option | Effort | Risk | Notes |
|--------|--------|------|-------|
| **A. Coordinator unlocks thin `unit.list` (authed, activeOnly)** | Small | Low | Best UX; mirrors category/tag list; RLS already allows SELECT. Preferred. |
| **B. Hardcode seed unit UUIDs + labels in web package** | Small | Medium | Works for fixtures/E2E; breaks when admins add units (Task 15 / PRD extensibility). |
| **C. Client Supabase `.from("unit")` outside tRPC** | Small | High | Diverges from app architecture (all other catalog reads are tRPC). Avoid. |

**Recommendation:** Flag for coordinator; ship UI against a provisional `unit.list` contract **only if** unlocked. Until then, document `<!-- TODO(coordinator): unit.list for dimension-grouped select -->` and optionally use seed UUIDs behind a single `UNITS` constant for component tests.

**Group-by-dimension UI shape (once data exists):**

```ts
type UnitOption = {
  id: string;
  name: string;
  abbreviation: string;
  dimension: "mass" | "volume" | "count";
  sortOrder: number | null;
};
// optgroup order: mass → volume → count; within group by sort_order then name
```

---

## 3. ContentFilters reuse points

### 3.1 Current component (`apps/web/src/components/shared/ContentFilters.tsx`)

| Export | Role |
|--------|------|
| `ContentFilterState` | `{ q, categoryIds, tagIds, maxTotalMinutes, minRating, hasSafetyFlags }` |
| `emptyFilters` | Defaults |
| `ContentFilters` | Controlled filter panel; `data-testid="content-filters"` |
| **`CategoryTreeNodes`** | **Private** (not exported) — recursive checkbox tree |
| Tag chips | Inline multi-select buttons inside `ContentFilters` |

Props already useful for reuse:

- `showTimeAndRating?: boolean` (default true)
- `showSafetyFlag?: boolean` (default true)
- `searchPlaceholder?: string`
- `categories` / `tags` from `category.list` / `tag.list`

### 3.2 Brief ask

> category tree picker + tag pickers (**reuse Wave 2 ContentFilters pickers**)

Recipe editor needs **form multi-select** for `categoryIds` / `tagIds`, not browse filters (no max time / min rating / safety flag on the recipe form).

Ingredient manager needs search + **"user added" filter** — not on `ContentFilters` and **not on `ingredient.list` input**.

### 3.3 Reuse points (recommended decomposition)

| Reuse target | How | Avoid |
|--------------|-----|-------|
| **Category tree picker** | Extract `CategoryTreeNodes` (+ optional thin `CategoryPicker`) from `ContentFilters` into `shared/CategoryTreePicker.tsx`; import from both filters and recipe form. | Duplicating the tree markup in RecipeEditor. |
| **Tag multi-select** | Extract tag chip list into `shared/TagPicker.tsx`; same DRY rule. | Copy-pasting chip styles. |
| **Recipe editor categories/tags** | New pickers bound to RHF `categoryIds` / `tagIds` (not full `ContentFilterState`). | Mounting full `ContentFilters` and ignoring `q`/time/rating (works but couples form to browse state shape). |
| **Ingredient manager search** | Simple search input (`data-testid="ingredient-search"`) → `ingredient.list({ q })`. Optional thin reuse of filter search styling only. | Forcing full ContentFilters. |
| **“User added” filter** | Client-side filter on `isUserAdded` **or** coordinator extends `ingredientListInputSchema` + router — see ambiguities. | Pretending ContentFilters has this flag. |

**DRY preference:** extract tree + tags once; keep `ContentFilters` as composition of those pickers + browse-only controls.

### 3.4 Data loaders (already used by `RecipeBrowser`)

```ts
trpc.category.list.queryOptions({ activeOnly: true }) // → { tree, flat }
trpc.tag.list.queryOptions({ activeOnly: true })
```

Same queries for editor pickers.

### 3.5 LeftoverDecayPath reuse (related Wave 2)

`LeftoverDecayPath` is **already an editing component** (add/edit/remove with `onSave`). Recipe editor should:

- Pass local draft entries + `onSave` that updates RHF `leftoverDecayPath` field (do not auto-mutate server until form Save), **or**
- After recipe exists, keep detail’s `setLeftoverDecayPath` path.

Prefer form-local draft so create flow works offline-of-id.

---

## 4. data-testid recommendations for E2E

Naming follows Wave 2: kebab-case, stable, interactive-first (`combo-*`, `decay-*`, `filter-*`, `shopping-*`).

### 4.1 Recipe editor (`/recipes/new`, `/recipes/[id]/edit`)

| testid | Element |
|--------|---------|
| `recipe-editor` | Root form container |
| `recipe-title` | Title input |
| `recipe-description` | Description textarea |
| `recipe-prep-minutes` / `recipe-cook-minutes` / `recipe-total-minutes` | Time fields |
| `recipe-yield` | yieldServings |
| `recipe-source-url` / `recipe-source-book` | Source fields |
| `recipe-category-picker` | Category tree region |
| `recipe-tag-picker` | Tag multi-select region |
| `recipe-image-slot` | Commented Phase 2 placeholder (optional static) |
| `instruction-editor` | Steps section |
| `instruction-step-{i}` | Single step row |
| `instruction-text-{i}` | Step text |
| `instruction-timer-{i}` / `instruction-temp-{i}` | Optional fields |
| `instruction-add` | Add step |
| `instruction-remove-{i}` | Remove step |
| `instruction-up-{i}` / `instruction-down-{i}` | Reorder (mirror `combo-up-*` / `combo-down-*`) |
| `ingredient-line-editor` | Lines section |
| `ingredient-line-row-{i}` | One line |
| `ingredient-search` | Picker search input |
| `ingredient-search-results` | Results list |
| `ingredient-pick-{id}` | Result row button |
| `ingredient-qty-{i}` | Quantity |
| `ingredient-unit-{i}` | Unit select |
| `ingredient-prep-note-{i}` | preparationNote |
| `ingredient-optional-{i}` | isOptional toggle |
| `ingredient-line-up-{i}` / `ingredient-line-down-{i}` / `ingredient-line-remove-{i}` | Reorder/remove |
| `ingredient-create-inline` | Mini-create panel (when empty search) |
| `ingredient-create-name` / `ingredient-create-unit` | Mini-create fields |
| `ingredient-create-submit` | Create new ingredient |
| `ingredient-merge-suggestion` | CONFLICT merge banner |
| `ingredient-merge-accept` | “Use existing …” action |
| `leftover-decay-path` | **Reuse** Wave 2 component testids as-is |
| `recipe-save` | Primary save |
| `recipe-delete` | Soft-delete trigger |
| `recipe-delete-confirm` | Confirm dialog confirm button |
| `recipe-delete-cancel` | Confirm dialog cancel |
| `recipe-restore` | Restore on soft-deleted detail/edit |

### 4.2 Ingredient manager (`/recipes/ingredients`)

| testid | Element |
|--------|---------|
| `ingredient-manager` | Page root |
| `ingredient-manager-search` | List search |
| `ingredient-filter-user-added` | “User added” toggle |
| `ingredient-list` | List region |
| `ingredient-row-{id}` | List row |
| `ingredient-drawer` | Edit drawer/panel |
| `ingredient-name` / `ingredient-description` / `ingredient-default-unit` | Core fields |
| `ingredient-nutrition-toggle` | Advanced toggle |
| `ingredient-nutrition-json` | Raw JSON textarea |
| `ingredient-save` | Save drawer |
| `ingredient-soft-delete` | Soft-delete (if offered) |
| `food-safety-profile` | Safety section root |
| `food-safety-readonly` | Non-admin view |
| `food-safety-editor` | Admin editor (absent for non-admin) |
| `safety-mercury-fda` | fda_category select |
| `safety-mercury-risk` / `safety-mercury-frequency` / `safety-mercury-notes` / `safety-mercury-source` / `safety-mercury-reviewed` | Structured fields |
| `safety-contaminant-add` | Add free-key contaminant |
| `safety-contaminant-key` / `safety-contaminant-row-{key}` | Catchall rows |
| `safety-profile-save` | Calls `setFoodSafetyProfile` |

### 4.3 Component-test focus (from brief §3)

| Scenario | Suggested testids / assertions |
|----------|--------------------------------|
| Instruction reorder | `instruction-up-1` swaps order with step 0 text |
| Quantity 0 rejected | `ingredient-qty-*` + form error; Zod `quantity must be > 0` |
| Merge suggestion | Mock `ingredient.create` → CONFLICT; assert `ingredient-merge-suggestion` + accept selects existing id |
| Safety editor hidden non-admin | Mock `family.me` `role: "member"` → no `food-safety-editor` |

### 4.4 Existing testids to **not** redefine

`content-filters`, `leftover-decay-path`, `decay-*`, `ingredient-line` (read-only line), `instruction-steps` (read-only), `recipe-detail`, `deleted-badge`, `safety-note-callout`.

---

## 5. Merge suggestion CONFLICT shape (`ingredient.create`)

### 5.1 Server path

On unique violation `23505` (`uq_ingredient_name` = unique on `lower(name)` where `deleted_at IS NULL`):

```ts
// apps/web/src/server/routers/ingredient.ts (create)
throw conflictWithExisting(
  `Ingredient name already exists: "${input.name}"`,
  (existing?.id as string) ?? "",
  { existingName: existing?.name ?? input.name },
);
```

Helper (`dbErrors.ts`):

```ts
export function conflictWithExisting(
  message: string,
  existingId: string,
  extra?: Record<string, unknown>,
): TRPCError {
  return new TRPCError({
    code: "CONFLICT",
    message,
    cause: { existingId, ...extra },
  });
}
```

**Logical payload (intended for merge UX):**

| Field | Location | Example |
|-------|----------|---------|
| `code` | TRPC error code | `"CONFLICT"` |
| `message` | Error message | `Ingredient name already exists: "Olive Oil"` |
| `existingId` | **`error.cause.existingId`** | uuid of live row |
| `existingName` | **`error.cause.existingName`** | canonical casing from DB |

Same CONFLICT path exists on **`ingredient.update`** when renaming into a collision.

### 5.2 Client exposure gap (critical)

`apps/web/src/server/trpc.ts` `errorFormatter` only adds:

```ts
zodError: error.cause instanceof ZodError ? error.cause.flatten() : null
```

It does **not** copy `existingId` / `existingName` onto `shape.data`.  
Standard tRPC client errors expose `data.code` / `message`; **`cause` is not a reliable client contract** unless the formatter promotes fields into `data`.

**Recommended client handling (defensive, until formatter fixed):**

1. Detect `error.data?.code === "CONFLICT"` (or `error.shape?.data?.code`).
2. **Primary:** if coordinator extends formatter → read `error.data.existingId` / `existingName`.
3. **Fallback (no procedure change):** `ingredient.list({ q: attemptedName, limit: 5 })` and pick case-insensitive name match for merge suggestion.
4. On accept: set line `ingredientId` to existing id; close mini-create; do **not** retry create.

### 5.3 Suggested formatter patch (coordinator / not Task 14 unless unlocked)

```ts
// conceptual — put merge meta on data, not only cause
data: {
  ...shape.data,
  zodError: ...,
  existingId:
    error.cause && typeof error.cause === "object" && "existingId" in error.cause
      ? (error.cause as { existingId: string }).existingId
      : undefined,
  existingName: ...
}
```

Brief forbids procedure changes; **errorFormatter is not a procedure** but is shared infrastructure — flag as `<!-- TODO(coordinator): expose CONFLICT existingId on tRPC error data -->`.

### 5.4 Mini-create happy path

```
ingredient.create({ name, defaultUnitId?, isUserAdded: true })
  → IngredientDto { id, name, defaultUnitId, ... }
  → select that id on the current recipe ingredient line
```

Input only needs name + default unit per brief (other create fields default).

---

## 6. Ambiguities

Flag for coordinator with `<!-- TODO(coordinator): … -->` in implementer output as needed.

| ID | Ambiguity | Evidence | Suggested default |
|----|-----------|----------|-------------------|
| **A1** | **No `unit.list` (or any unit procedure)** for dimension-grouped unit select | `_app.ts`; only internal mealPlan unit load | Unlock thin `unit.list`; do not hardcode long-term |
| **A2** | **CONFLICT `existingId` not on client error `data`** | `conflictWithExisting` uses `cause`; formatter ignores it | Promote to `data.existingId` **or** document list-by-name fallback |
| **A3** | **`ingredient.list` has no `isUserAdded` filter** | `ingredientListInputSchema` / router | Client-side filter on returned DTOs for manager; or schema+router filter (procedure change) |
| **A4** | **`nutritionData` not writable via schemas** | `ingredientUpdateInputSchema` has no nutrition; `ingredientWriteFields` ignores it; DB column exists | Advanced textarea is UI-only / dead until schema+mapper+update allow it — Phase 2 OK per brief “raw JSON behind advanced” but **cannot persist** without change |
| **A5** | **No `ingredient.restore`** | Router only softDelete; recipe has restore | Manager may omit restore; soft-deleted names reusable via create. Recipe editor restore only for recipes |
| **A6** | **ContentFilters is browse filters, not form pickers** | Component state includes q/time/rating | Extract CategoryTree + TagPicker; don’t force full ContentFilters into form |
| **A7** | **FDA category labels** | Brief: Best/Good/Avoid; PRD example: `"Good Choices"` | Use select values aligned with PRD/FDA wording: `Best Choices` / `Good Choices` / `Choices to Avoid` (or free string matching `contaminantProfileSchema`) |
| **A8** | **Routes not yet present** | App has `/recipes`, `/recipes/combinations/new`; **no** `page.tsx` under `/recipes/[id]`, no `/recipes/new`, `/recipes/[id]/edit`, `/recipes/ingredients` | Task 14 creates these App Router pages |
| **A9** | **Leftover save path** | create/update accept `leftoverDecayPath`; detail uses `setLeftoverDecayPath` | Form embeds path on Save; detail component can stay independent |
| **A10** | **`recipe.update` after softDelete** | update filters `deleted_at IS NULL` | Edit form on deleted recipe: only restore + read-only, not full update |
| **A11** | **Image field** | Brief: deferred Phase 2 | Commented slot only; no schema field today |
| **A12** | **RHF vs local state** | Brief: RHF + Zod; Wave 2 CombinationCreator is local useState; MealPlanEditor is RHF | Prefer **RHF + `zodResolver(recipeCreateInputSchema)`** like MealPlanEditor for recipe/ingredient forms |
| **A13** | **Ingredient picker empty state → create** | When search finds nothing | Define “nothing” as: query length ≥ 1 (or 2) and `items.length === 0` and not loading |
| **A14** | **Unit labels on detail** | `RecipeDetail` still passes `unitLabel={null}` | Out of Task 14 scope unless unit list unlocked; note only |
| **A15** | **`create` return lacks ingredients** | `recipe.create` returns `mapRecipeRow` only | After create, navigate to `/recipes/[id]/edit` or `/recipes/[id]` and `byId` for full hydrate |

---

## 7. Routes & file map (suggested for implementer)

| Path | Component (suggested) | Mutations / queries |
|------|----------------------|---------------------|
| `/recipes/new` | `RecipeEditor` (create) | `recipe.create`, `ingredient.list/create`, `category.list`, `tag.list`, **units TBD** |
| `/recipes/[id]/edit` | `RecipeEditor` (edit) | `recipe.byId`, `recipe.update`, `softDelete`, `restore` |
| `/recipes/[id]` | Existing/planned `RecipeDetail` | restore CTA if `isDeleted`; link to edit |
| `/recipes/ingredients` | `IngredientManager` | `ingredient.list/byId/update/softDelete`, `setFoodSafetyProfile`, `family.me` |

**RHF pattern reference:** `apps/web/src/components/meal-plan/MealPlanEditor.tsx` (`useForm` + `useFieldArray` + `zodResolver` + tRPC mutation error → form message).

**Reorder pattern reference:** `CombinationCreator` up/down without dnd lib — reuse for instruction steps and ingredient lines.

---

## 8. Schema / entity quick reference (DB PRD §4.1 + Zod)

| Entity | Key fields for editors |
|--------|------------------------|
| **Recipe** | title, description, instructions JSONB steps, times, yield_servings, source_url/book, leftover_decay_path, soft-delete |
| **RecipeIngredient** | ingredient_id, quantity > 0, unit_id, preparation_note, sequence_order, is_optional |
| **Ingredient** | name (CI unique live), description, default_unit_id, nutrition_data JSONB, food_safety_profile JSONB, is_user_added, soft-delete |
| **food_safety_profile** | `mercury` + `general` + catchall contaminant keys (`fda_category`, `risk_level`, `recommended_frequency`, `notes`, `source`, `last_reviewed`) |

---

## 9. Summary for parallel agents

| Topic | Finding |
|-------|---------|
| **Procedures** | Use existing `recipe.create|update|softDelete|restore` and `ingredient.create|update|softDelete|setFoodSafetyProfile`. No ingredient restore. |
| **Units** | **Hard gap:** no tRPC unit list; RLS allows SELECT; seed UUIDs known. Coordinator unlock needed. |
| **ContentFilters** | Extract category tree + tag chips for form pickers; don’t mount full filter state for editors. |
| **testids** | New `recipe-editor` / `ingredient-manager` / merge / safety families; reuse `leftover-decay-path` / `decay-*`. |
| **CONFLICT** | Server: `code=CONFLICT`, `cause.existingId` + `existingName`. Client: may not see cause — formatter gap + list fallback. |
| **Persist gaps** | nutrition advanced JSON cannot save without schema/mapper change; user-added list filter is client-only unless list input extended. |

**Implementer should not invent `unit.list` without coordinator sign-off.** Flag A1–A4 aggressively in draft output with `<!-- TODO(coordinator): … -->`.
