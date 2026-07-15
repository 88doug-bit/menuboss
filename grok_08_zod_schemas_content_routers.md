# Brief for Grok — Task 08: `packages/schemas` (Zod) + tRPC content routers

**Context:** Phase 1 Wave 1. You are producing the shared Zod schemas and the tRPC v11 routers for the family-global content domain: `recipe`, `ingredient`, `category`, `tag`, `chefIdea`, `recipeCombination`. The `mealPlan` and `shoppingList` routers are Wave 2 — do NOT write them.

**Attachments required:** `Recipe_Meal_Planning_Database_PRD_v0.4.md` (entities) and `Product_PRD_v0.2.md` (§8 functional requirements + §10 API contracts).

**Output:** one markdown file, saved as `drafts/grok_out_content_routers.md`, files as `### FILE:` headers + fenced blocks.

## Architecture constraints (non-negotiable — from the ratified PRDs)

- **Authorization belongs to RLS (D1).** Routers do NOT check household/roles; every procedure runs its queries through a Supabase client created from the caller's JWT. If RLS denies, surface a typed `FORBIDDEN`/`NOT_FOUND` TRPCError from the Postgres error. The only backend "validation" is input shape (Zod) and cross-field rules RLS can't see.
- Soft delete only: `delete` procedures set `deleted_at`; browse/search queries filter `deleted_at IS NULL`; detail-by-id does NOT filter it (historical plan views need deleted rows, badged).
- Family-global content (D7): no visibility filtering in queries.
- snake_case at DB boundary, camelCase in TS; map explicitly in a small `mapper.ts` per router (no ORMs).

## Files to produce

### FILE: packages/schemas/package.json + tsconfig.json
`@menu-boss/schemas`, zod as the only runtime dep.

### FILE: packages/schemas/src/{recipe,ingredient,category,tag,chefIdea,recipeCombination,common}.ts
- `common.ts`: uuid, pagination (`cursor`/`limit ≤ 100`), sortable rating (int 1–5), nonEmptyTrimmed string helper.
- Recipe: create/update inputs per PRD (title, description, structured `instructions` array of steps `{ text, timerMinutes?, temperature? }`, prep/cook/total minutes ≥ 0, yieldServings > 0, source, ingredients array `{ ingredientId, quantity > 0, unitId, preparationNote?, sequenceOrder, isOptional }`, categoryIds, tagIds, makeAgainRating 1–5 optional, `leftoverDecayPath` array of `{ use: string, notes?: string, linkedRecipeIds?: uuid[] }`).
- Ingredient: name (trimmed, 1–120 chars), description, defaultUnitId, `foodSafetyProfile` — passthrough-but-shaped: known keys (`mercury` with fda_category/risk_level/recommended_frequency/notes/source/last_reviewed, `general`) typed, additional contaminant keys allowed via `.catchall()` of the same contaminant shape.
- ChefIdea: title, notes, source, status enum (`idea|researching|tested|adopted|abandoned`), priority int 1–3, categoryIds/tagIds, optional `convertedRecipeId`.
- RecipeCombination: name, notes, makeAgainRating optional, `recipes: Array<{ recipeId, roleInMeal: enum('main','side','dessert','appetizer','other'), sequenceOrder }>` (min 1), isTemplate.
- Category: name, slug, parentId nullable, categoryType, sortOrder, isActive. Tag: name, slug, tagGroup, description, isActive.

### FILE: apps/web/src/server/trpc.ts
tRPC v11 init: context = `{ supabase, session }` where `supabase` is created per-request from the caller's JWT (`createServerClient` with the request's auth header/cookies); `authedProcedure` middleware rejects unauthenticated; `adminProcedure` = authed + profile role check surfaced from a `is_family_admin` RPC (display gating only — RLS still enforces).

### FILE: apps/web/src/server/routers/{recipe,ingredient,category,tag,chefIdea,recipeCombination}.ts + _app.ts + mapper files
Procedures per router (follow Product PRD §10.2/§10.3):
- recipe: `list` (filters: search q via tsvector, categoryIds, tagIds, maxTotalMinutes, minRating; cursor pagination), `byId`, `create`, `update`, `softDelete`, `restore`, `rate`, `setLeftoverDecayPath`.
- ingredient: `list` (search, categoryIds, hasSafetyProfile), `byId`, `create` (surface unique-violation from `uq_ingredient_name` as a typed CONFLICT error with the existing ingredient's id — backs the merge-suggestion AC), `update`, `softDelete`; `setFoodSafetyProfile` as `adminProcedure`.
- category/tag: `list` (category list returns tree assembled from flat parent_id rows), admin-gated `create/update/deactivate/reorder`.
- chefIdea: `list` (status, priority, tags/categories, search), `create`, `update`, `setStatus`, `convertToRecipe` (creates recipe from idea preserving notes/tags/categories in one transaction via a single RPC or sequential inserts with error surfacing, links `convertedRecipeId`).
- recipeCombination: `list`, `byId`, `create` (combination + junction rows), `update`, `rate`, `softDelete`.
- Writes set `created_by_user_id` from the session (RLS WITH CHECK verifies).

### FILE: apps/web/src/server/routers/__tests__/schemas.test.ts
Vitest: Zod boundary tests (invalid enums, quantity 0, rating 6, athlete-free — this domain has no portion inputs; empty combination recipes array rejected, decay-path entry without `use` rejected, foodSafetyProfile with novel contaminant key accepted).

## Constraints
- **Import style: extensionless relative imports** (`from './recipe'`, NEVER `from './recipe.js'`) — the app builds under Turbopack with `moduleResolution: "bundler"`, and `.js` suffixes on TS files break it.
- tRPC v11 + zod only; no service-role client anywhere; no auth logic beyond `authedProcedure`.
- Keep mappers explicit and dumb. Flag any PRD ambiguity in `## NOTES`; do not invent endpoints.
