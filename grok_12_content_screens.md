# Brief for Grok — Task 12 (Wave 2): Recipe browser/detail, ChefIdea capture, Combinations, Shopping List UI

**Context:** Wave 2 frontend, content side. Consumes the Wave 1 content routers (`recipe`, `ingredient`, `chefIdea`, `recipeCombination`, `category`, `tag`) and Task 10's `mealPlan.generateShoppingList`. Shares layout/nav with Task 11 (assume a `Calendar | Recipes | Ideas | Shopping` bottom/side nav per Product PRD §9.4 — build the nav shell here; Task 11 plugs into it).

**Attachments required:** `Product_PRD_v0.2.md` (§8.1, §8.5–§8.8, §9.2–§9.5), `grok_10_mealplan_router.md` (shopping-list output shape).

**Output:** one markdown file, saved as `drafts/grok_out_content_screens.md`, repo files as `### FILE:` headers + fenced blocks. **Extensionless relative imports.** Same stack as Task 11.

## 1. Recipe Browser & Detail (§9.2)
- Browser: responsive grid/list, tsvector search box, filters (hierarchical category tree, tag groups, max total time, min make-again rating, has-safety-flags), cursor pagination ("load more"). Search results interleave matching ChefIdeas in a visually distinct card style (§9.2: "search bar that also surfaces matching ChefIdeas").
- Detail: ingredients with **inline food-safety notes** — warning-style callout when an ingredient carries `food_safety_profile.mercury` (show fda_category, recommended_frequency; §9.5 "warning-style treatment"); structured instruction steps (timers/temps rendered as chips); make-again rating (tap to rate, optimistic); "Add to Plan" (routes into Task 11's editor with recipe preselected) and "Add to Combination" actions.
- **Creative Leftovers** section (§9.2): expandable decay-path area; entries with `linked_recipe_ids` navigate on tap; inline add/edit form writing via `recipe.setLeftoverDecayPath`.
- Soft-deleted recipes: reachable by direct link/historical context, badged "deleted", excluded from browse/search (the routers already enforce this — just render the badge).

## 2. ChefIdea Capture & Browser (§9.2)
- Prominent "+ Capture Idea" floating action (mobile) / header button (desktop): title, notes, source, status, priority, category/tag pickers (same components as recipe filters).
- Browser with the same filter surface as recipes; status chips (idea/researching/tested/adopted/abandoned).
- "Convert to Recipe" flow → `chefIdea.convertToRecipe` → routes to the new recipe's edit view; the idea shows an "adopted" link back.

## 3. RecipeCombination Creator (§9.2)
- Flow: pick recipes (search), assign `roleInMeal` + order (drag or up/down buttons), notes, 1–5 make-again rating, save as template toggle.
- Combination cards surface in the recipe browser under a "Meals" tab.

## 4. Shopping List View (§9.2)
- Input: selected plan ids (from calendar handoff) or date range → `mealPlan.generateShoppingList`.
- Grouped by `category_name` (store-aisle grouping), Optional group last and visually separated; cross-dimension rows render as separate lines under one ingredient heading (e.g., flour: "500 g" + "2 cups") — never merged.
- Lines contributed by a soft-deleted recipe carry the badge (from `includes_deleted_recipe`).
- Check-off with local persistence (localStorage keyed by plan-id set) — server-side check-state sync is Phase 2; leave `<!-- TODO(coordinator): Phase 2 check-state sync -->`.
- Print stylesheet + copy-to-clipboard (plain text grouped list).

## 5. Tests
- Component tests: safety-note callout renders when profile present; decay-path add/edit; shopping list grouping (Optional isolation, cross-dimension separation, deleted badge); rating optimistic update rollback on error.

## Constraints
- Reuse Task 11's shells (tRPC client, query provider, nav). No duplicate providers.
- Empty states per §9.6 ("Capture your first ChefIdea", empty shopping list ≠ error).
- No new heavy deps (no drag-drop library — up/down buttons are fine at this scale).
- Flag ambiguity with `<!-- TODO(coordinator): … -->`.
