# Brief for Grok — Task 14 (Wave 3): Recipe & Ingredient editors

**Context:** Wave 2 shipped browse/detail; creating and editing content still has no UI. This task adds the editor forms. Backend routers already exist (`recipe`, `ingredient` — Wave 1); do NOT add or change procedures except where explicitly listed.

**Attachments required:** `Product_PRD_v0.2.md` (§8.1, §9.2), `Recipe_Meal_Planning_Database_PRD_v0.4.md` (Recipe/RecipeIngredient/Ingredient entities).

**Output:** one markdown file, saved as `drafts/grok_out_recipe_editors.md`, files as `### FILE:` headers + fenced blocks. **Extensionless relative imports.** Stack conventions as Wave 2 (RHF + Zod from `@menu-boss/schemas`, tRPC hooks via `@/lib/trpc/client`, shadcn/ui patterns, `data-testid` on interactive elements).

## 1. Recipe editor (`/recipes/new`, `/recipes/[id]/edit`)
- Full form per §8.1: title, description, structured instruction steps (add/remove/reorder, optional timerMinutes + temperature per step), prep/cook/total minutes, yieldServings, source (url/book), category tree picker + tag pickers (reuse Wave 2 `ContentFilters` pickers), image deferred (Phase 2 — leave a commented slot).
- Ingredient lines editor: searchable ingredient picker (`ingredient.list`), quantity (> 0), unit select grouped by dimension, preparationNote, isOptional toggle, sequence reorder. Inline "create new ingredient" mini-flow when the search finds nothing (name + default unit only) — on `CONFLICT` from the case-insensitive unique index, surface the existing ingredient as a merge suggestion (§8.1 AC) and select it instead.
- Leftover decay path section reuses Wave 2's `LeftoverDecayPath` editing component.
- Save = `recipe.create` / `recipe.update`; deleting = `recipe.softDelete` with confirm dialog; restore action on soft-deleted detail view.

## 2. Ingredient manager (`/recipes/ingredients`)
- List with search + "user added" filter; edit drawer: name, description, defaultUnit, nutritionData left as raw-JSON textarea behind an "advanced" toggle (Phase 2 gets structure).
- **Food-safety profile editor is admin-gated** (`ingredient.setFoodSafetyProfile` is adminProcedure): structured mercury fields (fda_category select: Best/Good/Avoid choices, risk_level, recommended_frequency, notes, source, last_reviewed) plus an "add contaminant" free-key section matching the schema's catchall. Non-admins see the profile read-only.

## 3. Tests
- Component tests: instruction-step reorder, ingredient-line validation (quantity 0 rejected), merge-suggestion flow on duplicate name, safety editor hidden for non-admin (mock `family.me` role).

## Constraints
- No new routers/procedures; no service-role; no formula math (portion-calc only, and this task shouldn't need it).
- Flag ambiguity with `<!-- TODO(coordinator): … -->`.
