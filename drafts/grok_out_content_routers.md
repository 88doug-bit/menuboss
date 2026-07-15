## NOTES

1. **food safety procedure name:** Product PRD section 10.3 labels `recipe.addOrUpdateFoodSafetyProfile`; brief and data model place the column on `ingredient`. Implemented as `ingredient.setFoodSafetyProfile` (`adminProcedure`).
2. **convertedRecipeId vs linked_recipe_id:** API/camelCase uses `convertedRecipeId`; DB column (0001 schema) is `linked_recipe_id`. Mapped explicitly in `chefIdeaMapper`.
3. **tag.reorder:** `tag` has no `sort_order` in 0001 schema. Procedure exists for API symmetry with `category.reorder` but only returns tags in the requested order -- does not persist positions. Add a column later if product needs it.
4. **chefIdea.convertToRecipe atomicity:** Sequential inserts under caller JWT (recipe -> junctions -> idea link/status). Not a single Postgres transaction; first error is surfaced. A SECURITY INVOKER RPC can replace this later for true atomicity.
5. **mealPlan / shoppingList:** Intentionally omitted (Wave 2).
6. **No service-role client** anywhere; context supabase is JWT-scoped.
7. **Soft-delete policy:** list/browse filter `deleted_at IS NULL`; `byId` does not (historical plan badge support).
8. **Family-global (D7):** no visibility/household filters on content queries.
9. **superjson** used as tRPC transformer (common v11 practice); materializer should add dep if not present.
10. **dbErrors.ts** helper is shared (not listed in brief file set but required for typed CONFLICT/FORBIDDEN/NOT_FOUND mapping).
11. **Vitest:** schema boundary tests live at brief path and a package-local copy (`packages/schemas/src/schemas.test.ts`) so the package can run tests before monorepo scaffold wires `@menu-boss/schemas`. Node/npm were unavailable in this worktree shell; tests not executed here -- run `npm test` in `packages/schemas` after install.
12. **Ingredient create CONFLICT:** on `23505` / `uq_ingredient_name`, looks up existing live row by `ilike` name and throws CONFLICT with `cause.existingId` for merge-suggestion UX.
13. **Import style (brief rev):** extensionless relative imports only (`from './recipe'`, never `from './recipe.js'`) for Turbopack / `moduleResolution: "bundler"`. Applied throughout schemas package and routers.

### FILE: packages/schemas/package.json
```json
{
  "name": "@menu-boss/schemas",
  "version": "0.1.0",
  "description": "Shared Zod schemas for MenuBoss tRPC procedures and forms.",
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./common": "./src/common.ts",
    "./recipe": "./src/recipe.ts",
    "./ingredient": "./src/ingredient.ts",
    "./category": "./src/category.ts",
    "./tag": "./src/tag.ts",
    "./chefIdea": "./src/chefIdea.ts",
    "./recipeCombination": "./src/recipeCombination.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "files": [
    "src"
  ],
  "keywords": [
    "menu-boss",
    "zod",
    "schemas"
  ],
  "license": "UNLICENSED",
  "private": true,
  "dependencies": {
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.7",
    "typescript": "^5.7.3",
    "vitest": "^3.0.5"
  },
  "engines": {
    "node": ">=20"
  }
}
```

### FILE: packages/schemas/tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "rootDir": "src",
    "outDir": "dist",
    "noEmit": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### FILE: packages/schemas/src/common.ts
```typescript
import { z } from "zod";

/** UUID v4-compatible string (accepts any UUID shape Postgres generates). */
export const uuidSchema = z.string().uuid();

/** Trimmed non-empty string helper. */
export const nonEmptyTrimmed = z
  .string()
  .trim()
  .min(1, "Must not be empty after trimming");

/** Make-again / opinion rating: integer 1â€“5 inclusive. */
export const ratingSchema = z
  .number()
  .int("Rating must be an integer")
  .min(1, "Rating must be at least 1")
  .max(5, "Rating must be at most 5");

/**
 * Cursor pagination input.
 * `cursor` is an opaque string (typically last-seen id or created_at+id).
 * `limit` defaults to 20, hard-capped at 100.
 */
export const paginationSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100, "limit must be â‰¤ 100")
    .default(20),
});

export type Uuid = z.infer<typeof uuidSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type Rating = z.infer<typeof ratingSchema>;

/** Shared id-only input for byId / softDelete / restore / rate targets. */
export const idInputSchema = z.object({
  id: uuidSchema,
});

export type IdInput = z.infer<typeof idInputSchema>;
```

### FILE: packages/schemas/src/recipe.ts
```typescript
import { z } from "zod";
import {
  idInputSchema,
  nonEmptyTrimmed,
  paginationSchema,
  ratingSchema,
  uuidSchema,
} from "./common";

/** One structured instruction step (stored in recipe.instructions JSONB). */
export const instructionStepSchema = z.object({
  text: nonEmptyTrimmed,
  timerMinutes: z.number().int().min(0).optional(),
  temperature: z.string().trim().min(1).optional(),
});

/**
 * Recipe ingredient line for create/update payloads.
 * Maps to recipe_ingredient rows (not the ingredient master).
 */
export const recipeIngredientInputSchema = z.object({
  ingredientId: uuidSchema,
  quantity: z.number().positive("quantity must be > 0"),
  unitId: uuidSchema,
  preparationNote: z.string().trim().optional(),
  sequenceOrder: z.number().int().min(0),
  isOptional: z.boolean().default(false),
});

/**
 * One leftover decay-path entry (recipe.leftover_decay_path JSONB).
 * `use` is required; notes and linked recipe ids are optional.
 */
export const leftoverDecayPathEntrySchema = z.object({
  use: nonEmptyTrimmed,
  notes: z.string().trim().optional(),
  linkedRecipeIds: z.array(uuidSchema).optional(),
});

export const leftoverDecayPathSchema = z.array(leftoverDecayPathEntrySchema);

const sourceFields = {
  sourceUrl: z.string().url().optional().or(z.literal("")),
  sourceBook: z.string().trim().optional(),
};

export const recipeCreateInputSchema = z.object({
  title: nonEmptyTrimmed,
  description: z.string().trim().optional(),
  instructions: z.array(instructionStepSchema).default([]),
  prepTimeMinutes: z.number().int().min(0).optional(),
  cookTimeMinutes: z.number().int().min(0).optional(),
  totalTimeMinutes: z.number().int().min(0).optional(),
  yieldServings: z.number().positive("yieldServings must be > 0").default(1),
  sourceUrl: sourceFields.sourceUrl,
  sourceBook: sourceFields.sourceBook,
  isTemplate: z.boolean().default(false),
  makeAgainRating: ratingSchema.optional(),
  leftoverDecayPath: leftoverDecayPathSchema.default([]),
  ingredients: z.array(recipeIngredientInputSchema).default([]),
  categoryIds: z.array(uuidSchema).default([]),
  tagIds: z.array(uuidSchema).default([]),
});

export const recipeUpdateInputSchema = recipeCreateInputSchema
  .partial()
  .extend({
    id: uuidSchema,
  });

export const recipeListInputSchema = paginationSchema.extend({
  /** Full-text search query (tsvector on title + description). */
  q: z.string().trim().min(1).optional(),
  categoryIds: z.array(uuidSchema).optional(),
  tagIds: z.array(uuidSchema).optional(),
  maxTotalMinutes: z.number().int().min(0).optional(),
  minRating: ratingSchema.optional(),
});

export const recipeRateInputSchema = z.object({
  id: uuidSchema,
  makeAgainRating: ratingSchema,
});

export const recipeSetLeftoverDecayPathInputSchema = z.object({
  id: uuidSchema,
  leftoverDecayPath: leftoverDecayPathSchema,
});

export const recipeByIdInputSchema = idInputSchema;
export const recipeSoftDeleteInputSchema = idInputSchema;
export const recipeRestoreInputSchema = idInputSchema;

export type InstructionStep = z.infer<typeof instructionStepSchema>;
export type RecipeIngredientInput = z.infer<typeof recipeIngredientInputSchema>;
export type LeftoverDecayPathEntry = z.infer<typeof leftoverDecayPathEntrySchema>;
export type RecipeCreateInput = z.infer<typeof recipeCreateInputSchema>;
export type RecipeUpdateInput = z.infer<typeof recipeUpdateInputSchema>;
export type RecipeListInput = z.infer<typeof recipeListInputSchema>;
export type RecipeRateInput = z.infer<typeof recipeRateInputSchema>;
export type RecipeSetLeftoverDecayPathInput = z.infer<
  typeof recipeSetLeftoverDecayPathInputSchema
>;
```

### FILE: packages/schemas/src/ingredient.ts
```typescript
import { z } from "zod";
import {
  idInputSchema,
  nonEmptyTrimmed,
  paginationSchema,
  uuidSchema,
} from "./common";

/**
 * Shape for a known contaminant block (e.g. mercury) and any novel
 * contaminant key accepted via catchall.
 */
export const contaminantProfileSchema = z.object({
  fda_category: z.string().optional(),
  risk_level: z.string().optional(),
  recommended_frequency: z.string().optional(),
  notes: z.string().optional(),
  source: z.string().optional(),
  last_reviewed: z.string().optional(),
});

/**
 * General food-safety guidance block (cooking temp, storage, etc.).
 * Loose object â€” not forced into the contaminant field set.
 */
export const generalSafetySchema = z
  .object({
    cooking_temperature: z.string().optional(),
    storage_notes: z.string().optional(),
  })
  .passthrough();

/**
 * food_safety_profile JSONB on Ingredient.
 * Known keys (`mercury`, `general`) typed; additional contaminant keys
 * allowed via catchall of the contaminant shape (lead, PFAS, â€¦).
 */
export const foodSafetyProfileSchema = z
  .object({
    mercury: contaminantProfileSchema.optional(),
    general: generalSafetySchema.optional(),
  })
  .catchall(contaminantProfileSchema);

export const ingredientNameSchema = nonEmptyTrimmed.pipe(
  z.string().min(1).max(120, "Ingredient name must be â‰¤ 120 characters"),
);

export const ingredientCreateInputSchema = z.object({
  name: ingredientNameSchema,
  description: z.string().trim().optional(),
  defaultUnitId: uuidSchema.optional(),
  foodSafetyProfile: foodSafetyProfileSchema.optional(),
  categoryIds: z.array(uuidSchema).default([]),
  tagIds: z.array(uuidSchema).default([]),
  isUserAdded: z.boolean().default(true),
});

export const ingredientUpdateInputSchema = z.object({
  id: uuidSchema,
  name: ingredientNameSchema.optional(),
  description: z.string().trim().optional(),
  defaultUnitId: uuidSchema.nullable().optional(),
  categoryIds: z.array(uuidSchema).optional(),
  tagIds: z.array(uuidSchema).optional(),
});

export const ingredientListInputSchema = paginationSchema.extend({
  q: z.string().trim().min(1).optional(),
  categoryIds: z.array(uuidSchema).optional(),
  /** When true, only ingredients with a non-empty food_safety_profile. */
  hasSafetyProfile: z.boolean().optional(),
});

export const ingredientSetFoodSafetyProfileInputSchema = z.object({
  id: uuidSchema,
  foodSafetyProfile: foodSafetyProfileSchema,
});

export const ingredientByIdInputSchema = idInputSchema;
export const ingredientSoftDeleteInputSchema = idInputSchema;

export type ContaminantProfile = z.infer<typeof contaminantProfileSchema>;
export type FoodSafetyProfile = z.infer<typeof foodSafetyProfileSchema>;
export type IngredientCreateInput = z.infer<typeof ingredientCreateInputSchema>;
export type IngredientUpdateInput = z.infer<typeof ingredientUpdateInputSchema>;
export type IngredientListInput = z.infer<typeof ingredientListInputSchema>;
export type IngredientSetFoodSafetyProfileInput = z.infer<
  typeof ingredientSetFoodSafetyProfileInputSchema
>;
```

### FILE: packages/schemas/src/category.ts
```typescript
import { z } from "zod";
import { idInputSchema, nonEmptyTrimmed, uuidSchema } from "./common";

export const categoryCreateInputSchema = z.object({
  name: nonEmptyTrimmed,
  slug: nonEmptyTrimmed
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "slug must be lowercase kebab-case",
    ),
  parentId: uuidSchema.nullable().optional(),
  categoryType: nonEmptyTrimmed.default("nutrition"),
  sortOrder: z.number().int().default(0),
  description: z.string().trim().optional(),
  isActive: z.boolean().default(true),
});

export const categoryUpdateInputSchema = categoryCreateInputSchema
  .partial()
  .extend({
    id: uuidSchema,
  });

export const categoryListInputSchema = z.object({
  /** When true (default), only is_active rows. */
  activeOnly: z.boolean().default(true),
  categoryType: z.string().trim().min(1).optional(),
});

export const categoryDeactivateInputSchema = idInputSchema;

export const categoryReorderInputSchema = z.object({
  /** Ordered list of category ids; position in array becomes sort_order. */
  orderedIds: z.array(uuidSchema).min(1),
});

export type CategoryCreateInput = z.infer<typeof categoryCreateInputSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateInputSchema>;
export type CategoryListInput = z.infer<typeof categoryListInputSchema>;
export type CategoryReorderInput = z.infer<typeof categoryReorderInputSchema>;
```

### FILE: packages/schemas/src/tag.ts
```typescript
import { z } from "zod";
import { idInputSchema, nonEmptyTrimmed, uuidSchema } from "./common";

export const tagCreateInputSchema = z.object({
  name: nonEmptyTrimmed,
  slug: nonEmptyTrimmed.regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "slug must be lowercase kebab-case",
  ),
  tagGroup: nonEmptyTrimmed,
  description: z.string().trim().optional(),
  isActive: z.boolean().default(true),
});

export const tagUpdateInputSchema = tagCreateInputSchema.partial().extend({
  id: uuidSchema,
});

export const tagListInputSchema = z.object({
  activeOnly: z.boolean().default(true),
  tagGroup: z.string().trim().min(1).optional(),
});

export const tagDeactivateInputSchema = idInputSchema;

export const tagReorderInputSchema = z.object({
  /** Tag has no sort_order in schema v0.4 â€” reorder is a no-op placeholder
   * reserved if a future column is added. Accepts ordered ids for API symmetry
   * with category.reorder; currently returns tags in requested order only. */
  orderedIds: z.array(uuidSchema).min(1),
});

export type TagCreateInput = z.infer<typeof tagCreateInputSchema>;
export type TagUpdateInput = z.infer<typeof tagUpdateInputSchema>;
export type TagListInput = z.infer<typeof tagListInputSchema>;
export type TagReorderInput = z.infer<typeof tagReorderInputSchema>;
```

### FILE: packages/schemas/src/chefIdea.ts
```typescript
import { z } from "zod";
import {
  idInputSchema,
  nonEmptyTrimmed,
  paginationSchema,
  uuidSchema,
} from "./common";

export const chefIdeaStatusSchema = z.enum([
  "idea",
  "researching",
  "tested",
  "adopted",
  "abandoned",
]);

export const chefIdeaCreateInputSchema = z.object({
  title: nonEmptyTrimmed,
  notes: z.string().trim().optional(),
  source: z.string().trim().optional(),
  status: chefIdeaStatusSchema.default("idea"),
  /** Priority 1 (highest) â€“ 3 (lowest). */
  priority: z.number().int().min(1).max(3).optional(),
  categoryIds: z.array(uuidSchema).default([]),
  tagIds: z.array(uuidSchema).default([]),
  /** API name; maps to DB column `linked_recipe_id`. */
  convertedRecipeId: uuidSchema.optional(),
});

export const chefIdeaUpdateInputSchema = chefIdeaCreateInputSchema
  .partial()
  .extend({
    id: uuidSchema,
  });

export const chefIdeaListInputSchema = paginationSchema.extend({
  q: z.string().trim().min(1).optional(),
  status: chefIdeaStatusSchema.optional(),
  priority: z.number().int().min(1).max(3).optional(),
  categoryIds: z.array(uuidSchema).optional(),
  tagIds: z.array(uuidSchema).optional(),
});

export const chefIdeaSetStatusInputSchema = z.object({
  id: uuidSchema,
  status: chefIdeaStatusSchema,
});

/**
 * convertToRecipe: create a recipe from the idea, preserving notes/tags/
 * categories, and link convertedRecipeId (DB: linked_recipe_id).
 * Optional overrides let the cook flesh out the recipe at conversion time.
 */
export const chefIdeaConvertToRecipeInputSchema = z.object({
  id: uuidSchema,
  title: nonEmptyTrimmed.optional(),
  description: z.string().trim().optional(),
  yieldServings: z.number().positive().optional(),
});

export const chefIdeaByIdInputSchema = idInputSchema;

export type ChefIdeaStatus = z.infer<typeof chefIdeaStatusSchema>;
export type ChefIdeaCreateInput = z.infer<typeof chefIdeaCreateInputSchema>;
export type ChefIdeaUpdateInput = z.infer<typeof chefIdeaUpdateInputSchema>;
export type ChefIdeaListInput = z.infer<typeof chefIdeaListInputSchema>;
export type ChefIdeaSetStatusInput = z.infer<typeof chefIdeaSetStatusInputSchema>;
export type ChefIdeaConvertToRecipeInput = z.infer<
  typeof chefIdeaConvertToRecipeInputSchema
>;
```

### FILE: packages/schemas/src/recipeCombination.ts
```typescript
import { z } from "zod";
import {
  idInputSchema,
  nonEmptyTrimmed,
  paginationSchema,
  ratingSchema,
  uuidSchema,
} from "./common";

export const roleInMealSchema = z.enum([
  "main",
  "side",
  "dessert",
  "appetizer",
  "other",
]);

export const combinationRecipeInputSchema = z.object({
  recipeId: uuidSchema,
  roleInMeal: roleInMealSchema,
  sequenceOrder: z.number().int().min(0),
  notes: z.string().trim().optional(),
});

export const recipeCombinationCreateInputSchema = z.object({
  name: nonEmptyTrimmed,
  notes: z.string().trim().optional(),
  makeAgainRating: ratingSchema.optional(),
  isTemplate: z.boolean().default(false),
  /** At least one recipe required. */
  recipes: z
    .array(combinationRecipeInputSchema)
    .min(1, "combination must include at least one recipe"),
});

export const recipeCombinationUpdateInputSchema = z.object({
  id: uuidSchema,
  name: nonEmptyTrimmed.optional(),
  notes: z.string().trim().optional(),
  makeAgainRating: ratingSchema.nullable().optional(),
  isTemplate: z.boolean().optional(),
  /** When provided, replaces the full junction set. */
  recipes: z
    .array(combinationRecipeInputSchema)
    .min(1, "combination must include at least one recipe")
    .optional(),
});

export const recipeCombinationListInputSchema = paginationSchema.extend({
  q: z.string().trim().min(1).optional(),
  isTemplate: z.boolean().optional(),
  minRating: ratingSchema.optional(),
});

export const recipeCombinationRateInputSchema = z.object({
  id: uuidSchema,
  makeAgainRating: ratingSchema,
});

export const recipeCombinationByIdInputSchema = idInputSchema;
export const recipeCombinationSoftDeleteInputSchema = idInputSchema;

export type RoleInMeal = z.infer<typeof roleInMealSchema>;
export type CombinationRecipeInput = z.infer<typeof combinationRecipeInputSchema>;
export type RecipeCombinationCreateInput = z.infer<
  typeof recipeCombinationCreateInputSchema
>;
export type RecipeCombinationUpdateInput = z.infer<
  typeof recipeCombinationUpdateInputSchema
>;
export type RecipeCombinationListInput = z.infer<
  typeof recipeCombinationListInputSchema
>;
export type RecipeCombinationRateInput = z.infer<
  typeof recipeCombinationRateInputSchema
>;
```

### FILE: packages/schemas/src/index.ts
```typescript
export * from "./common";
export * from "./recipe";
export * from "./ingredient";
export * from "./category";
export * from "./tag";
export * from "./chefIdea";
export * from "./recipeCombination";
```

### FILE: apps/web/src/server/trpc.ts
```typescript
/**
 * tRPC v11 init for MenuBoss.
 *
 * Context carries a per-request Supabase client built from the caller's JWT
 * and the session. Authorization is owned by RLS â€” procedures do not check
 * household/roles themselves. `adminProcedure` is display/UX gating only
 * (profile role via `is_family_admin` RPC); RLS still enforces writes.
 */
import { initTRPC, TRPCError } from "@trpc/server";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import superjson from "superjson";
import { ZodError } from "zod";

export type AppSupabaseClient = SupabaseClient;

export type TRPCContext = {
  supabase: AppSupabaseClient;
  session: Session | null;
};

/**
 * Build context from a request. Caller (Next.js route handler) is responsible
 * for creating the Supabase server client with the request cookies/auth header
 * via `@supabase/ssr` `createServerClient` â€” never a service-role key.
 */
export function createTRPCContext(opts: {
  supabase: AppSupabaseClient;
  session: Session | null;
}): TRPCContext {
  return {
    supabase: opts.supabase,
    session: opts.session,
  };
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

/** Rejects unauthenticated callers. Session user id is available as ctx.userId. */
export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user?.id) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      userId: ctx.session.user.id as string,
    },
  });
});

/**
 * Authed + family-admin display gate via `is_family_admin` RPC.
 * RLS remains the sole write authority; this only keeps non-admins out of
 * admin-oriented procedures in the UI contract.
 */
export const adminProcedure = authedProcedure.use(async ({ ctx, next }) => {
  const { data, error } = await ctx.supabase.rpc("is_family_admin");
  if (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to resolve admin role",
      cause: error,
    });
  }
  if (data !== true) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Family admin role required",
    });
  }
  return next({ ctx });
});
```

### FILE: apps/web/src/server/dbErrors.ts
```typescript
/**
 * Map Postgres / PostgREST errors into typed TRPCErrors.
 * RLS denials and missing rows surface as FORBIDDEN / NOT_FOUND.
 * Unique violations (e.g. uq_ingredient_name) surface as CONFLICT.
 */
import { TRPCError } from "@trpc/server";

type PgLikeError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

export function throwFromPostgrest(
  error: PgLikeError,
  opts?: { notFoundMessage?: string; conflictMeta?: Record<string, unknown> },
): never {
  const code = error.code ?? "";
  const message = error.message ?? "Database error";

  // unique_violation
  if (code === "23505") {
    throw new TRPCError({
      code: "CONFLICT",
      message,
      cause: error,
      // callers may attach existing id via meta for merge-suggestion UX
      ...(opts?.conflictMeta
        ? { /* meta is not standard on TRPCError; stash on cause */ }
        : {}),
    });
  }

  // check_violation / not_null / fk
  if (code === "23514" || code === "23502" || code === "23503") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message,
      cause: error,
    });
  }

  // insufficient_privilege / RLS often appears as empty result or 42501
  if (code === "42501" || /row-level security/i.test(message)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Not permitted",
      cause: error,
    });
  }

  // PostgREST "JWT expired" etc.
  if (code === "PGRST301" || /jwt/i.test(message)) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Session invalid or expired",
      cause: error,
    });
  }

  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message,
    cause: error,
  });
}

export function assertFound<T>(
  row: T | null | undefined,
  message = "Not found",
): asserts row is T {
  if (row == null) {
    throw new TRPCError({ code: "NOT_FOUND", message });
  }
}

/**
 * Build a CONFLICT error carrying the existing resource id for merge UX
 * (ingredient duplicate-name AC).
 */
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

### FILE: apps/web/src/server/routers/recipeMapper.ts
```typescript
/**
 * Explicit snake_case (DB) â†” camelCase (TS) mapping for recipe domain.
 * No ORM. Dumb field renames only.
 */

export type RecipeRow = {
  id: string;
  title: string;
  description: string | null;
  instructions: unknown;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  total_time_minutes: number | null;
  yield_servings: number;
  source_url: string | null;
  source_book: string | null;
  created_by_user_id: string | null;
  is_template: boolean;
  make_again_rating: number | null;
  leftover_decay_path: unknown;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type RecipeIngredientRow = {
  id: string;
  recipe_id: string;
  ingredient_id: string;
  quantity: number;
  unit_id: string;
  preparation_note: string | null;
  sequence_order: number;
  is_optional: boolean;
  created_at: string;
};

export type RecipeDto = {
  id: string;
  title: string;
  description: string | null;
  instructions: unknown;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  totalTimeMinutes: number | null;
  yieldServings: number;
  sourceUrl: string | null;
  sourceBook: string | null;
  createdByUserId: string | null;
  isTemplate: boolean;
  makeAgainRating: number | null;
  leftoverDecayPath: unknown;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  isDeleted: boolean;
};

export type RecipeIngredientDto = {
  id: string;
  recipeId: string;
  ingredientId: string;
  quantity: number;
  unitId: string;
  preparationNote: string | null;
  sequenceOrder: number;
  isOptional: boolean;
  createdAt: string;
};

export function mapRecipeRow(row: RecipeRow): RecipeDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    instructions: row.instructions,
    prepTimeMinutes: row.prep_time_minutes,
    cookTimeMinutes: row.cook_time_minutes,
    totalTimeMinutes: row.total_time_minutes,
    yieldServings: Number(row.yield_servings),
    sourceUrl: row.source_url,
    sourceBook: row.source_book,
    createdByUserId: row.created_by_user_id,
    isTemplate: row.is_template,
    makeAgainRating: row.make_again_rating,
    leftoverDecayPath: row.leftover_decay_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    isDeleted: row.deleted_at != null,
  };
}

export function mapRecipeIngredientRow(
  row: RecipeIngredientRow,
): RecipeIngredientDto {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    ingredientId: row.ingredient_id,
    quantity: Number(row.quantity),
    unitId: row.unit_id,
    preparationNote: row.preparation_note,
    sequenceOrder: row.sequence_order,
    isOptional: row.is_optional,
    createdAt: row.created_at,
  };
}

/** Partial insert/update payload for recipe table from camelCase input. */
export function recipeWriteFields(input: {
  title?: string;
  description?: string;
  instructions?: unknown;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  totalTimeMinutes?: number;
  yieldServings?: number;
  sourceUrl?: string;
  sourceBook?: string;
  isTemplate?: boolean;
  makeAgainRating?: number;
  leftoverDecayPath?: unknown;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.title !== undefined) out.title = input.title;
  if (input.description !== undefined) out.description = input.description;
  if (input.instructions !== undefined) out.instructions = input.instructions;
  if (input.prepTimeMinutes !== undefined)
    out.prep_time_minutes = input.prepTimeMinutes;
  if (input.cookTimeMinutes !== undefined)
    out.cook_time_minutes = input.cookTimeMinutes;
  if (input.totalTimeMinutes !== undefined)
    out.total_time_minutes = input.totalTimeMinutes;
  if (input.yieldServings !== undefined)
    out.yield_servings = input.yieldServings;
  if (input.sourceUrl !== undefined)
    out.source_url = input.sourceUrl === "" ? null : input.sourceUrl;
  if (input.sourceBook !== undefined) out.source_book = input.sourceBook;
  if (input.isTemplate !== undefined) out.is_template = input.isTemplate;
  if (input.makeAgainRating !== undefined)
    out.make_again_rating = input.makeAgainRating;
  if (input.leftoverDecayPath !== undefined)
    out.leftover_decay_path = input.leftoverDecayPath;
  return out;
}
```

### FILE: apps/web/src/server/routers/ingredientMapper.ts
```typescript
/**
 * Explicit snake_case â†” camelCase mapping for ingredient domain.
 */

export type IngredientRow = {
  id: string;
  name: string;
  description: string | null;
  default_unit_id: string | null;
  nutrition_data: unknown;
  food_safety_profile: unknown;
  is_user_added: boolean;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type IngredientDto = {
  id: string;
  name: string;
  description: string | null;
  defaultUnitId: string | null;
  nutritionData: unknown;
  foodSafetyProfile: unknown;
  isUserAdded: boolean;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  isDeleted: boolean;
};

export function mapIngredientRow(row: IngredientRow): IngredientDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    defaultUnitId: row.default_unit_id,
    nutritionData: row.nutrition_data,
    foodSafetyProfile: row.food_safety_profile,
    isUserAdded: row.is_user_added,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    isDeleted: row.deleted_at != null,
  };
}

export function ingredientWriteFields(input: {
  name?: string;
  description?: string;
  defaultUnitId?: string | null;
  foodSafetyProfile?: unknown;
  isUserAdded?: boolean;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.name !== undefined) out.name = input.name;
  if (input.description !== undefined) out.description = input.description;
  if (input.defaultUnitId !== undefined)
    out.default_unit_id = input.defaultUnitId;
  if (input.foodSafetyProfile !== undefined)
    out.food_safety_profile = input.foodSafetyProfile;
  if (input.isUserAdded !== undefined) out.is_user_added = input.isUserAdded;
  return out;
}
```

### FILE: apps/web/src/server/routers/categoryMapper.ts
```typescript
/**
 * Explicit snake_case â†” camelCase mapping for category domain.
 */

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  category_type: string;
  sort_order: number;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CategoryDto = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  categoryType: string;
  sortOrder: number;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  children?: CategoryDto[];
};

export function mapCategoryRow(row: CategoryRow): CategoryDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    parentId: row.parent_id,
    categoryType: row.category_type,
    sortOrder: row.sort_order,
    description: row.description,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function categoryWriteFields(input: {
  name?: string;
  slug?: string;
  parentId?: string | null;
  categoryType?: string;
  sortOrder?: number;
  description?: string;
  isActive?: boolean;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.name !== undefined) out.name = input.name;
  if (input.slug !== undefined) out.slug = input.slug;
  if (input.parentId !== undefined) out.parent_id = input.parentId;
  if (input.categoryType !== undefined) out.category_type = input.categoryType;
  if (input.sortOrder !== undefined) out.sort_order = input.sortOrder;
  if (input.description !== undefined) out.description = input.description;
  if (input.isActive !== undefined) out.is_active = input.isActive;
  return out;
}

/** Assemble a forest from flat parent_id rows (stable sort_order). */
export function buildCategoryTree(rows: CategoryRow[]): CategoryDto[] {
  const nodes = new Map<string, CategoryDto>();
  for (const row of rows) {
    nodes.set(row.id, { ...mapCategoryRow(row), children: [] });
  }
  const roots: CategoryDto[] = [];
  for (const row of rows) {
    const node = nodes.get(row.id)!;
    if (row.parent_id && nodes.has(row.parent_id)) {
      nodes.get(row.parent_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (list: CategoryDto[]) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    for (const n of list) {
      if (n.children?.length) sortRec(n.children);
    }
  };
  sortRec(roots);
  return roots;
}
```

### FILE: apps/web/src/server/routers/tagMapper.ts
```typescript
/**
 * Explicit snake_case â†” camelCase mapping for tag domain.
 */

export type TagRow = {
  id: string;
  name: string;
  slug: string;
  tag_group: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type TagDto = {
  id: string;
  name: string;
  slug: string;
  tagGroup: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export function mapTagRow(row: TagRow): TagDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    tagGroup: row.tag_group,
    description: row.description,
    color: row.color,
    icon: row.icon,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function tagWriteFields(input: {
  name?: string;
  slug?: string;
  tagGroup?: string;
  description?: string;
  isActive?: boolean;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.name !== undefined) out.name = input.name;
  if (input.slug !== undefined) out.slug = input.slug;
  if (input.tagGroup !== undefined) out.tag_group = input.tagGroup;
  if (input.description !== undefined) out.description = input.description;
  if (input.isActive !== undefined) out.is_active = input.isActive;
  return out;
}
```

### FILE: apps/web/src/server/routers/chefIdeaMapper.ts
```typescript
/**
 * Explicit snake_case â†” camelCase mapping for chef_idea domain.
 * API `convertedRecipeId` â†” DB `linked_recipe_id`.
 */

export type ChefIdeaRow = {
  id: string;
  title: string;
  notes: string | null;
  source: string | null;
  status: string;
  priority: number | null;
  linked_recipe_id: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ChefIdeaDto = {
  id: string;
  title: string;
  notes: string | null;
  source: string | null;
  status: string;
  priority: number | null;
  convertedRecipeId: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  isDeleted: boolean;
};

export function mapChefIdeaRow(row: ChefIdeaRow): ChefIdeaDto {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    source: row.source,
    status: row.status,
    priority: row.priority,
    convertedRecipeId: row.linked_recipe_id,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    isDeleted: row.deleted_at != null,
  };
}

export function chefIdeaWriteFields(input: {
  title?: string;
  notes?: string;
  source?: string;
  status?: string;
  priority?: number;
  convertedRecipeId?: string | null;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.title !== undefined) out.title = input.title;
  if (input.notes !== undefined) out.notes = input.notes;
  if (input.source !== undefined) out.source = input.source;
  if (input.status !== undefined) out.status = input.status;
  if (input.priority !== undefined) out.priority = input.priority;
  if (input.convertedRecipeId !== undefined)
    out.linked_recipe_id = input.convertedRecipeId;
  return out;
}
```

### FILE: apps/web/src/server/routers/recipeCombinationMapper.ts
```typescript
/**
 * Explicit snake_case â†” camelCase mapping for recipe_combination domain.
 */

export type RecipeCombinationRow = {
  id: string;
  name: string;
  notes: string | null;
  make_again_rating: number | null;
  served_date: string | null;
  meal_plan_id: string | null;
  is_template: boolean;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type RecipeCombinationRecipeRow = {
  recipe_combination_id: string;
  recipe_id: string;
  role_in_meal: string | null;
  sequence_order: number;
  notes: string | null;
  created_at: string;
};

export type RecipeCombinationDto = {
  id: string;
  name: string;
  notes: string | null;
  makeAgainRating: number | null;
  servedDate: string | null;
  mealPlanId: string | null;
  isTemplate: boolean;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  isDeleted: boolean;
  recipes?: RecipeCombinationRecipeDto[];
};

export type RecipeCombinationRecipeDto = {
  recipeCombinationId: string;
  recipeId: string;
  roleInMeal: string | null;
  sequenceOrder: number;
  notes: string | null;
  createdAt: string;
};

export function mapRecipeCombinationRow(
  row: RecipeCombinationRow,
): RecipeCombinationDto {
  return {
    id: row.id,
    name: row.name,
    notes: row.notes,
    makeAgainRating: row.make_again_rating,
    servedDate: row.served_date,
    mealPlanId: row.meal_plan_id,
    isTemplate: row.is_template,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    isDeleted: row.deleted_at != null,
  };
}

export function mapRecipeCombinationRecipeRow(
  row: RecipeCombinationRecipeRow,
): RecipeCombinationRecipeDto {
  return {
    recipeCombinationId: row.recipe_combination_id,
    recipeId: row.recipe_id,
    roleInMeal: row.role_in_meal,
    sequenceOrder: row.sequence_order,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export function recipeCombinationWriteFields(input: {
  name?: string;
  notes?: string;
  makeAgainRating?: number | null;
  isTemplate?: boolean;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.name !== undefined) out.name = input.name;
  if (input.notes !== undefined) out.notes = input.notes;
  if (input.makeAgainRating !== undefined)
    out.make_again_rating = input.makeAgainRating;
  if (input.isTemplate !== undefined) out.is_template = input.isTemplate;
  return out;
}
```

### FILE: apps/web/src/server/routers/recipe.ts
```typescript
/**
 * recipe router â€” family-global content (D7).
 * Soft-delete only. Browse filters deleted_at IS NULL; byId does not.
 * Auth: JWT supabase client; RLS owns authorization.
 */
import {
  recipeByIdInputSchema,
  recipeCreateInputSchema,
  recipeListInputSchema,
  recipeRateInputSchema,
  recipeRestoreInputSchema,
  recipeSetLeftoverDecayPathInputSchema,
  recipeSoftDeleteInputSchema,
  recipeUpdateInputSchema,
} from "@menu-boss/schemas";
import { assertFound, throwFromPostgrest } from "../dbErrors";
import {
  authedProcedure,
  createTRPCRouter,
  type AppSupabaseClient,
} from "../trpc";
import {
  mapRecipeIngredientRow,
  mapRecipeRow,
  recipeWriteFields,
  type RecipeIngredientRow,
  type RecipeRow,
} from "./recipeMapper";

async function replaceRecipeIngredients(
  supabase: AppSupabaseClient,
  recipeId: string,
  ingredients: Array<{
    ingredientId: string;
    quantity: number;
    unitId: string;
    preparationNote?: string;
    sequenceOrder: number;
    isOptional: boolean;
  }>,
) {
  const { error: delErr } = await supabase
    .from("recipe_ingredient")
    .delete()
    .eq("recipe_id", recipeId);
  if (delErr) throwFromPostgrest(delErr);

  if (ingredients.length === 0) return;

  const rows = ingredients.map((ing) => ({
    recipe_id: recipeId,
    ingredient_id: ing.ingredientId,
    quantity: ing.quantity,
    unit_id: ing.unitId,
    preparation_note: ing.preparationNote ?? null,
    sequence_order: ing.sequenceOrder,
    is_optional: ing.isOptional,
  }));
  const { error: insErr } = await supabase
    .from("recipe_ingredient")
    .insert(rows);
  if (insErr) throwFromPostgrest(insErr);
}

async function replaceJunction(
  supabase: AppSupabaseClient,
  table: "recipe_category" | "recipe_tag",
  fkCol: "category_id" | "tag_id",
  recipeId: string,
  ids: string[],
) {
  const { error: delErr } = await supabase
    .from(table)
    .delete()
    .eq("recipe_id", recipeId);
  if (delErr) throwFromPostgrest(delErr);
  if (ids.length === 0) return;
  const rows = ids.map((id) => ({
    recipe_id: recipeId,
    [fkCol]: id,
  }));
  const { error: insErr } = await supabase.from(table).insert(rows);
  if (insErr) throwFromPostgrest(insErr);
}

export const recipeRouter = createTRPCRouter({
  /**
   * Browse/search live recipes (deleted_at IS NULL).
   * Filters: q (tsvector), categoryIds, tagIds, maxTotalMinutes, minRating.
   */
  list: authedProcedure
    .input(recipeListInputSchema)
    .query(async ({ ctx, input }) => {
      const limit = input.limit;
      let query = ctx.supabase
        .from("recipe")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit + 1);

      if (input.q) {
        // plainto_tsquery-style via textSearch helper
        query = query.textSearch("search_vector", input.q, {
          type: "websearch",
          config: "english",
        });
      }
      if (input.maxTotalMinutes !== undefined) {
        query = query.lte("total_time_minutes", input.maxTotalMinutes);
      }
      if (input.minRating !== undefined) {
        query = query.gte("make_again_rating", input.minRating);
      }
      if (input.cursor) {
        query = query.lt("created_at", input.cursor);
      }

      const { data, error } = await query;
      if (error) throwFromPostgrest(error);

      let rows = (data ?? []) as RecipeRow[];

      // Post-filter by category/tag junctions when requested (family-global, small sets).
      if (input.categoryIds?.length) {
        const { data: rc, error: rcErr } = await ctx.supabase
          .from("recipe_category")
          .select("recipe_id")
          .in("category_id", input.categoryIds);
        if (rcErr) throwFromPostgrest(rcErr);
        const allowed = new Set((rc ?? []).map((r) => r.recipe_id as string));
        rows = rows.filter((r) => allowed.has(r.id));
      }
      if (input.tagIds?.length) {
        const { data: rt, error: rtErr } = await ctx.supabase
          .from("recipe_tag")
          .select("recipe_id")
          .in("tag_id", input.tagIds);
        if (rtErr) throwFromPostgrest(rtErr);
        const allowed = new Set((rt ?? []).map((r) => r.recipe_id as string));
        rows = rows.filter((r) => allowed.has(r.id));
      }

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && page.length > 0
          ? page[page.length - 1]!.created_at
          : null;

      return {
        items: page.map(mapRecipeRow),
        nextCursor,
      };
    }),

  /**
   * Detail by id â€” does NOT filter deleted_at (historical plan views need deleted rows, badged).
   */
  byId: authedProcedure
    .input(recipeByIdInputSchema)
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("recipe")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Recipe not found");

      const { data: ings, error: ingErr } = await ctx.supabase
        .from("recipe_ingredient")
        .select("*")
        .eq("recipe_id", input.id)
        .order("sequence_order", { ascending: true });
      if (ingErr) throwFromPostgrest(ingErr);

      const { data: cats, error: catErr } = await ctx.supabase
        .from("recipe_category")
        .select("category_id")
        .eq("recipe_id", input.id);
      if (catErr) throwFromPostgrest(catErr);

      const { data: tags, error: tagErr } = await ctx.supabase
        .from("recipe_tag")
        .select("tag_id")
        .eq("recipe_id", input.id);
      if (tagErr) throwFromPostgrest(tagErr);

      return {
        ...mapRecipeRow(data as RecipeRow),
        ingredients: ((ings ?? []) as RecipeIngredientRow[]).map(
          mapRecipeIngredientRow,
        ),
        categoryIds: (cats ?? []).map((c) => c.category_id as string),
        tagIds: (tags ?? []).map((t) => t.tag_id as string),
      };
    }),

  create: authedProcedure
    .input(recipeCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const fields = recipeWriteFields(input);
      const { data, error } = await ctx.supabase
        .from("recipe")
        .insert({
          ...fields,
          created_by_user_id: ctx.userId,
        })
        .select("*")
        .single();
      if (error) throwFromPostgrest(error);

      const recipe = data as RecipeRow;
      await replaceRecipeIngredients(ctx.supabase, recipe.id, input.ingredients);
      await replaceJunction(
        ctx.supabase,
        "recipe_category",
        "category_id",
        recipe.id,
        input.categoryIds,
      );
      await replaceJunction(
        ctx.supabase,
        "recipe_tag",
        "tag_id",
        recipe.id,
        input.tagIds,
      );

      return mapRecipeRow(recipe);
    }),

  update: authedProcedure
    .input(recipeUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ingredients, categoryIds, tagIds, ...rest } = input;
      const fields = recipeWriteFields(rest);

      if (Object.keys(fields).length > 0) {
        const { error } = await ctx.supabase
          .from("recipe")
          .update(fields)
          .eq("id", id)
          .is("deleted_at", null);
        if (error) throwFromPostgrest(error);
      }

      if (ingredients !== undefined) {
        await replaceRecipeIngredients(ctx.supabase, id, ingredients);
      }
      if (categoryIds !== undefined) {
        await replaceJunction(
          ctx.supabase,
          "recipe_category",
          "category_id",
          id,
          categoryIds,
        );
      }
      if (tagIds !== undefined) {
        await replaceJunction(ctx.supabase, "recipe_tag", "tag_id", id, tagIds);
      }

      const { data, error } = await ctx.supabase
        .from("recipe")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Recipe not found");
      return mapRecipeRow(data as RecipeRow);
    }),

  softDelete: authedProcedure
    .input(recipeSoftDeleteInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("recipe")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", input.id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Recipe not found or already deleted");
      return mapRecipeRow(data as RecipeRow);
    }),

  restore: authedProcedure
    .input(recipeRestoreInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("recipe")
        .update({ deleted_at: null })
        .eq("id", input.id)
        .not("deleted_at", "is", null)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Recipe not found or not deleted");
      return mapRecipeRow(data as RecipeRow);
    }),

  rate: authedProcedure
    .input(recipeRateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("recipe")
        .update({ make_again_rating: input.makeAgainRating })
        .eq("id", input.id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Recipe not found");
      return mapRecipeRow(data as RecipeRow);
    }),

  setLeftoverDecayPath: authedProcedure
    .input(recipeSetLeftoverDecayPathInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("recipe")
        .update({ leftover_decay_path: input.leftoverDecayPath })
        .eq("id", input.id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Recipe not found");
      return mapRecipeRow(data as RecipeRow);
    }),
});
```

### FILE: apps/web/src/server/routers/ingredient.ts
```typescript
/**
 * ingredient router â€” family-global content (D7).
 * create surfaces uq_ingredient_name unique-violation as CONFLICT with
 * existing ingredient id (merge-suggestion AC).
 * setFoodSafetyProfile is adminProcedure (display gate; RLS still enforces).
 */
import {
  ingredientByIdInputSchema,
  ingredientCreateInputSchema,
  ingredientListInputSchema,
  ingredientSetFoodSafetyProfileInputSchema,
  ingredientSoftDeleteInputSchema,
  ingredientUpdateInputSchema,
} from "@menu-boss/schemas";
import { assertFound, conflictWithExisting, throwFromPostgrest } from "../dbErrors";
import { adminProcedure, authedProcedure, createTRPCRouter } from "../trpc";
import {
  ingredientWriteFields,
  mapIngredientRow,
  type IngredientRow,
} from "./ingredientMapper";

async function replaceIngredientJunction(
  supabase: import("../trpc").AppSupabaseClient,
  table: "ingredient_category" | "ingredient_tag",
  fkCol: "category_id" | "tag_id",
  ingredientId: string,
  ids: string[],
) {
  const { error: delErr } = await supabase
    .from(table)
    .delete()
    .eq("ingredient_id", ingredientId);
  if (delErr) throwFromPostgrest(delErr);
  if (ids.length === 0) return;
  const rows = ids.map((id) => ({
    ingredient_id: ingredientId,
    [fkCol]: id,
  }));
  const { error: insErr } = await supabase.from(table).insert(rows);
  if (insErr) throwFromPostgrest(insErr);
}

export const ingredientRouter = createTRPCRouter({
  list: authedProcedure
    .input(ingredientListInputSchema)
    .query(async ({ ctx, input }) => {
      const limit = input.limit;
      let query = ctx.supabase
        .from("ingredient")
        .select("*")
        .is("deleted_at", null)
        .order("name", { ascending: true })
        .limit(limit + 1);

      if (input.q) {
        query = query.textSearch("search_vector", input.q, {
          type: "websearch",
          config: "english",
        });
      }
      if (input.hasSafetyProfile === true) {
        // non-empty JSON object
        query = query.neq("food_safety_profile", "{}");
      }
      if (input.cursor) {
        query = query.gt("name", input.cursor);
      }

      const { data, error } = await query;
      if (error) throwFromPostgrest(error);

      let rows = (data ?? []) as IngredientRow[];

      if (input.categoryIds?.length) {
        const { data: ic, error: icErr } = await ctx.supabase
          .from("ingredient_category")
          .select("ingredient_id")
          .in("category_id", input.categoryIds);
        if (icErr) throwFromPostgrest(icErr);
        const allowed = new Set(
          (ic ?? []).map((r) => r.ingredient_id as string),
        );
        rows = rows.filter((r) => allowed.has(r.id));
      }

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && page.length > 0 ? page[page.length - 1]!.name : null;

      return {
        items: page.map(mapIngredientRow),
        nextCursor,
      };
    }),

  /** Detail by id â€” does NOT filter deleted_at (badge soft-deleted refs). */
  byId: authedProcedure
    .input(ingredientByIdInputSchema)
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("ingredient")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Ingredient not found");

      const { data: cats, error: catErr } = await ctx.supabase
        .from("ingredient_category")
        .select("category_id")
        .eq("ingredient_id", input.id);
      if (catErr) throwFromPostgrest(catErr);

      const { data: tags, error: tagErr } = await ctx.supabase
        .from("ingredient_tag")
        .select("tag_id")
        .eq("ingredient_id", input.id);
      if (tagErr) throwFromPostgrest(tagErr);

      return {
        ...mapIngredientRow(data as IngredientRow),
        categoryIds: (cats ?? []).map((c) => c.category_id as string),
        tagIds: (tags ?? []).map((t) => t.tag_id as string),
      };
    }),

  create: authedProcedure
    .input(ingredientCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const fields = ingredientWriteFields({
        name: input.name,
        description: input.description,
        defaultUnitId: input.defaultUnitId,
        foodSafetyProfile: input.foodSafetyProfile,
        isUserAdded: input.isUserAdded,
      });

      const { data, error } = await ctx.supabase
        .from("ingredient")
        .insert({
          ...fields,
          created_by_user_id: ctx.userId,
        })
        .select("*")
        .single();

      if (error) {
        if (error.code === "23505") {
          // Look up existing live ingredient by case-insensitive name for merge UX
          const { data: existing } = await ctx.supabase
            .from("ingredient")
            .select("id, name")
            .is("deleted_at", null)
            .ilike("name", input.name)
            .maybeSingle();
          throw conflictWithExisting(
            `Ingredient name already exists: "${input.name}"`,
            (existing?.id as string) ?? "",
            { existingName: existing?.name ?? input.name },
          );
        }
        throwFromPostgrest(error);
      }

      const row = data as IngredientRow;
      await replaceIngredientJunction(
        ctx.supabase,
        "ingredient_category",
        "category_id",
        row.id,
        input.categoryIds,
      );
      await replaceIngredientJunction(
        ctx.supabase,
        "ingredient_tag",
        "tag_id",
        row.id,
        input.tagIds,
      );

      return mapIngredientRow(row);
    }),

  update: authedProcedure
    .input(ingredientUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, categoryIds, tagIds, ...rest } = input;
      const fields = ingredientWriteFields(rest);

      if (Object.keys(fields).length > 0) {
        const { error } = await ctx.supabase
          .from("ingredient")
          .update(fields)
          .eq("id", id)
          .is("deleted_at", null);
        if (error) {
          if (error.code === "23505" && rest.name) {
            const { data: existing } = await ctx.supabase
              .from("ingredient")
              .select("id, name")
              .is("deleted_at", null)
              .ilike("name", rest.name)
              .maybeSingle();
            throw conflictWithExisting(
              `Ingredient name already exists: "${rest.name}"`,
              (existing?.id as string) ?? "",
              { existingName: existing?.name ?? rest.name },
            );
          }
          throwFromPostgrest(error);
        }
      }

      if (categoryIds !== undefined) {
        await replaceIngredientJunction(
          ctx.supabase,
          "ingredient_category",
          "category_id",
          id,
          categoryIds,
        );
      }
      if (tagIds !== undefined) {
        await replaceIngredientJunction(
          ctx.supabase,
          "ingredient_tag",
          "tag_id",
          id,
          tagIds,
        );
      }

      const { data, error } = await ctx.supabase
        .from("ingredient")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Ingredient not found");
      return mapIngredientRow(data as IngredientRow);
    }),

  softDelete: authedProcedure
    .input(ingredientSoftDeleteInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("ingredient")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", input.id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Ingredient not found or already deleted");
      return mapIngredientRow(data as IngredientRow);
    }),

  /** Admin-gated food-safety profile write (Product PRD Â§10.3; brief name). */
  setFoodSafetyProfile: adminProcedure
    .input(ingredientSetFoodSafetyProfileInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("ingredient")
        .update({ food_safety_profile: input.foodSafetyProfile })
        .eq("id", input.id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Ingredient not found");
      return mapIngredientRow(data as IngredientRow);
    }),
});
```

### FILE: apps/web/src/server/routers/category.ts
```typescript
/**
 * category router â€” admin vocabulary (Shape C).
 * list returns a tree assembled from flat parent_id rows.
 * create/update/deactivate/reorder are adminProcedure.
 */
import {
  categoryCreateInputSchema,
  categoryDeactivateInputSchema,
  categoryListInputSchema,
  categoryReorderInputSchema,
  categoryUpdateInputSchema,
} from "@menu-boss/schemas";
import { assertFound, throwFromPostgrest } from "../dbErrors";
import { adminProcedure, authedProcedure, createTRPCRouter } from "../trpc";
import {
  buildCategoryTree,
  categoryWriteFields,
  mapCategoryRow,
  type CategoryRow,
} from "./categoryMapper";

export const categoryRouter = createTRPCRouter({
  /** Flat rows â†’ tree (children nested). Authed read for all family members. */
  list: authedProcedure
    .input(categoryListInputSchema)
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("category")
        .select("*")
        .order("sort_order", { ascending: true });

      if (input.activeOnly) {
        query = query.eq("is_active", true);
      }
      if (input.categoryType) {
        query = query.eq("category_type", input.categoryType);
      }

      const { data, error } = await query;
      if (error) throwFromPostgrest(error);

      const rows = (data ?? []) as CategoryRow[];
      return {
        tree: buildCategoryTree(rows),
        flat: rows.map(mapCategoryRow),
      };
    }),

  create: adminProcedure
    .input(categoryCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const fields = categoryWriteFields(input);
      const { data, error } = await ctx.supabase
        .from("category")
        .insert(fields)
        .select("*")
        .single();
      if (error) throwFromPostgrest(error);
      return mapCategoryRow(data as CategoryRow);
    }),

  update: adminProcedure
    .input(categoryUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const fields = categoryWriteFields(rest);
      const { data, error } = await ctx.supabase
        .from("category")
        .update(fields)
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Category not found");
      return mapCategoryRow(data as CategoryRow);
    }),

  /** Soft-deactivate (is_active = false); no hard delete. */
  deactivate: adminProcedure
    .input(categoryDeactivateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("category")
        .update({ is_active: false })
        .eq("id", input.id)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Category not found");
      return mapCategoryRow(data as CategoryRow);
    }),

  reorder: adminProcedure
    .input(categoryReorderInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Sequential updates; coordinator may later provide a bulk RPC.
      const results: CategoryRow[] = [];
      for (let i = 0; i < input.orderedIds.length; i++) {
        const id = input.orderedIds[i]!;
        const { data, error } = await ctx.supabase
          .from("category")
          .update({ sort_order: i })
          .eq("id", id)
          .select("*")
          .maybeSingle();
        if (error) throwFromPostgrest(error);
        if (data) results.push(data as CategoryRow);
      }
      return results.map(mapCategoryRow);
    }),
});
```

### FILE: apps/web/src/server/routers/tag.ts
```typescript
/**
 * tag router â€” admin vocabulary (Shape C).
 * create/update/deactivate/reorder are adminProcedure.
 * Note: tag table has no sort_order in 0001 schema; reorder returns tags
 * in requested order without persisting positions (see NOTES).
 */
import {
  tagCreateInputSchema,
  tagDeactivateInputSchema,
  tagListInputSchema,
  tagReorderInputSchema,
  tagUpdateInputSchema,
} from "@menu-boss/schemas";
import { assertFound, throwFromPostgrest } from "../dbErrors";
import { adminProcedure, authedProcedure, createTRPCRouter } from "../trpc";
import { mapTagRow, tagWriteFields, type TagRow } from "./tagMapper";

export const tagRouter = createTRPCRouter({
  list: authedProcedure
    .input(tagListInputSchema)
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("tag")
        .select("*")
        .order("tag_group", { ascending: true })
        .order("name", { ascending: true });

      if (input.activeOnly) {
        query = query.eq("is_active", true);
      }
      if (input.tagGroup) {
        query = query.eq("tag_group", input.tagGroup);
      }

      const { data, error } = await query;
      if (error) throwFromPostgrest(error);
      return ((data ?? []) as TagRow[]).map(mapTagRow);
    }),

  create: adminProcedure
    .input(tagCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const fields = tagWriteFields(input);
      const { data, error } = await ctx.supabase
        .from("tag")
        .insert(fields)
        .select("*")
        .single();
      if (error) throwFromPostgrest(error);
      return mapTagRow(data as TagRow);
    }),

  update: adminProcedure
    .input(tagUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const fields = tagWriteFields(rest);
      const { data, error } = await ctx.supabase
        .from("tag")
        .update(fields)
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Tag not found");
      return mapTagRow(data as TagRow);
    }),

  deactivate: adminProcedure
    .input(tagDeactivateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("tag")
        .update({ is_active: false })
        .eq("id", input.id)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Tag not found");
      return mapTagRow(data as TagRow);
    }),

  /**
   * API symmetry with category.reorder. Tag has no sort_order column in
   * 0001 schema â€” returns tags ordered as requested without DB writes.
   */
  reorder: adminProcedure
    .input(tagReorderInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("tag")
        .select("*")
        .in("id", input.orderedIds);
      if (error) throwFromPostgrest(error);
      const byId = new Map(
        ((data ?? []) as TagRow[]).map((t) => [t.id, t] as const),
      );
      return input.orderedIds
        .map((id) => byId.get(id))
        .filter((t): t is TagRow => t != null)
        .map(mapTagRow);
    }),
});
```

### FILE: apps/web/src/server/routers/chefIdea.ts
```typescript
/**
 * chefIdea router â€” family-global content (D7).
 * convertToRecipe creates a recipe preserving notes/tags/categories and
 * links convertedRecipeId (DB: linked_recipe_id).
 */
import {
  chefIdeaConvertToRecipeInputSchema,
  chefIdeaCreateInputSchema,
  chefIdeaListInputSchema,
  chefIdeaSetStatusInputSchema,
  chefIdeaUpdateInputSchema,
} from "@menu-boss/schemas";
import { assertFound, throwFromPostgrest } from "../dbErrors";
import { authedProcedure, createTRPCRouter } from "../trpc";
import {
  chefIdeaWriteFields,
  mapChefIdeaRow,
  type ChefIdeaRow,
} from "./chefIdeaMapper";
import { mapRecipeRow, type RecipeRow } from "./recipeMapper";

async function replaceChefIdeaJunction(
  supabase: import("../trpc").AppSupabaseClient,
  table: "chef_idea_category" | "chef_idea_tag",
  fkCol: "category_id" | "tag_id",
  chefIdeaId: string,
  ids: string[],
) {
  const { error: delErr } = await supabase
    .from(table)
    .delete()
    .eq("chef_idea_id", chefIdeaId);
  if (delErr) throwFromPostgrest(delErr);
  if (ids.length === 0) return;
  const rows = ids.map((id) => ({
    chef_idea_id: chefIdeaId,
    [fkCol]: id,
  }));
  const { error: insErr } = await supabase.from(table).insert(rows);
  if (insErr) throwFromPostgrest(insErr);
}

export const chefIdeaRouter = createTRPCRouter({
  list: authedProcedure
    .input(chefIdeaListInputSchema)
    .query(async ({ ctx, input }) => {
      const limit = input.limit;
      let query = ctx.supabase
        .from("chef_idea")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit + 1);

      if (input.status) {
        query = query.eq("status", input.status);
      }
      if (input.priority !== undefined) {
        query = query.eq("priority", input.priority);
      }
      if (input.q) {
        query = query.or(
          `title.ilike.%${input.q}%,notes.ilike.%${input.q}%`,
        );
      }
      if (input.cursor) {
        query = query.lt("created_at", input.cursor);
      }

      const { data, error } = await query;
      if (error) throwFromPostgrest(error);

      let rows = (data ?? []) as ChefIdeaRow[];

      if (input.categoryIds?.length) {
        const { data: jc, error: jcErr } = await ctx.supabase
          .from("chef_idea_category")
          .select("chef_idea_id")
          .in("category_id", input.categoryIds);
        if (jcErr) throwFromPostgrest(jcErr);
        const allowed = new Set(
          (jc ?? []).map((r) => r.chef_idea_id as string),
        );
        rows = rows.filter((r) => allowed.has(r.id));
      }
      if (input.tagIds?.length) {
        const { data: jt, error: jtErr } = await ctx.supabase
          .from("chef_idea_tag")
          .select("chef_idea_id")
          .in("tag_id", input.tagIds);
        if (jtErr) throwFromPostgrest(jtErr);
        const allowed = new Set(
          (jt ?? []).map((r) => r.chef_idea_id as string),
        );
        rows = rows.filter((r) => allowed.has(r.id));
      }

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && page.length > 0
          ? page[page.length - 1]!.created_at
          : null;

      return {
        items: page.map(mapChefIdeaRow),
        nextCursor,
      };
    }),

  create: authedProcedure
    .input(chefIdeaCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const fields = chefIdeaWriteFields({
        title: input.title,
        notes: input.notes,
        source: input.source,
        status: input.status,
        priority: input.priority,
        convertedRecipeId: input.convertedRecipeId,
      });

      const { data, error } = await ctx.supabase
        .from("chef_idea")
        .insert({
          ...fields,
          created_by_user_id: ctx.userId,
        })
        .select("*")
        .single();
      if (error) throwFromPostgrest(error);

      const row = data as ChefIdeaRow;
      await replaceChefIdeaJunction(
        ctx.supabase,
        "chef_idea_category",
        "category_id",
        row.id,
        input.categoryIds,
      );
      await replaceChefIdeaJunction(
        ctx.supabase,
        "chef_idea_tag",
        "tag_id",
        row.id,
        input.tagIds,
      );

      return mapChefIdeaRow(row);
    }),

  update: authedProcedure
    .input(chefIdeaUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, categoryIds, tagIds, ...rest } = input;
      const fields = chefIdeaWriteFields(rest);

      if (Object.keys(fields).length > 0) {
        const { error } = await ctx.supabase
          .from("chef_idea")
          .update(fields)
          .eq("id", id)
          .is("deleted_at", null);
        if (error) throwFromPostgrest(error);
      }

      if (categoryIds !== undefined) {
        await replaceChefIdeaJunction(
          ctx.supabase,
          "chef_idea_category",
          "category_id",
          id,
          categoryIds,
        );
      }
      if (tagIds !== undefined) {
        await replaceChefIdeaJunction(
          ctx.supabase,
          "chef_idea_tag",
          "tag_id",
          id,
          tagIds,
        );
      }

      const { data, error } = await ctx.supabase
        .from("chef_idea")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "ChefIdea not found");
      return mapChefIdeaRow(data as ChefIdeaRow);
    }),

  setStatus: authedProcedure
    .input(chefIdeaSetStatusInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("chef_idea")
        .update({ status: input.status })
        .eq("id", input.id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "ChefIdea not found");
      return mapChefIdeaRow(data as ChefIdeaRow);
    }),

  /**
   * Create a recipe from the idea (notes â†’ description), copy category/tag
   * junctions, set idea status=adopted and linked_recipe_id.
   * Sequential inserts under caller JWT; surface first error.
   * (A single RPC may replace this later for true atomicity.)
   */
  convertToRecipe: authedProcedure
    .input(chefIdeaConvertToRecipeInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data: idea, error: ideaErr } = await ctx.supabase
        .from("chef_idea")
        .select("*")
        .eq("id", input.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (ideaErr) throwFromPostgrest(ideaErr);
      assertFound(idea, "ChefIdea not found");
      const ideaRow = idea as ChefIdeaRow;

      if (ideaRow.linked_recipe_id) {
        const { data: existingRecipe, error: erErr } = await ctx.supabase
          .from("recipe")
          .select("*")
          .eq("id", ideaRow.linked_recipe_id)
          .maybeSingle();
        if (erErr) throwFromPostgrest(erErr);
        assertFound(existingRecipe, "Linked recipe not found");
        return {
          idea: mapChefIdeaRow(ideaRow),
          recipe: mapRecipeRow(existingRecipe as RecipeRow),
          alreadyConverted: true as const,
        };
      }

      const { data: cats } = await ctx.supabase
        .from("chef_idea_category")
        .select("category_id")
        .eq("chef_idea_id", input.id);
      const { data: tags } = await ctx.supabase
        .from("chef_idea_tag")
        .select("tag_id")
        .eq("chef_idea_id", input.id);

      const categoryIds = (cats ?? []).map((c) => c.category_id as string);
      const tagIds = (tags ?? []).map((t) => t.tag_id as string);

      const { data: recipe, error: recipeErr } = await ctx.supabase
        .from("recipe")
        .insert({
          title: input.title ?? ideaRow.title,
          description: input.description ?? ideaRow.notes,
          yield_servings: input.yieldServings ?? 1,
          instructions: [],
          leftover_decay_path: [],
          created_by_user_id: ctx.userId,
        })
        .select("*")
        .single();
      if (recipeErr) throwFromPostgrest(recipeErr);
      const recipeRow = recipe as RecipeRow;

      if (categoryIds.length) {
        const { error } = await ctx.supabase.from("recipe_category").insert(
          categoryIds.map((category_id) => ({
            recipe_id: recipeRow.id,
            category_id,
          })),
        );
        if (error) throwFromPostgrest(error);
      }
      if (tagIds.length) {
        const { error } = await ctx.supabase.from("recipe_tag").insert(
          tagIds.map((tag_id) => ({
            recipe_id: recipeRow.id,
            tag_id,
          })),
        );
        if (error) throwFromPostgrest(error);
      }

      const { data: updatedIdea, error: updErr } = await ctx.supabase
        .from("chef_idea")
        .update({
          linked_recipe_id: recipeRow.id,
          status: "adopted",
        })
        .eq("id", input.id)
        .select("*")
        .single();
      if (updErr) throwFromPostgrest(updErr);

      return {
        idea: mapChefIdeaRow(updatedIdea as ChefIdeaRow),
        recipe: mapRecipeRow(recipeRow),
        alreadyConverted: false as const,
      };
    }),
});
```

### FILE: apps/web/src/server/routers/recipeCombination.ts
```typescript
/**
 * recipeCombination router â€” family-global content (D7).
 * create/update manage combination + junction rows.
 */
import {
  recipeCombinationByIdInputSchema,
  recipeCombinationCreateInputSchema,
  recipeCombinationListInputSchema,
  recipeCombinationRateInputSchema,
  recipeCombinationSoftDeleteInputSchema,
  recipeCombinationUpdateInputSchema,
} from "@menu-boss/schemas";
import { assertFound, throwFromPostgrest } from "../dbErrors";
import { authedProcedure, createTRPCRouter } from "../trpc";
import {
  mapRecipeCombinationRecipeRow,
  mapRecipeCombinationRow,
  recipeCombinationWriteFields,
  type RecipeCombinationRecipeRow,
  type RecipeCombinationRow,
} from "./recipeCombinationMapper";

async function replaceCombinationRecipes(
  supabase: import("../trpc").AppSupabaseClient,
  combinationId: string,
  recipes: Array<{
    recipeId: string;
    roleInMeal: string;
    sequenceOrder: number;
    notes?: string;
  }>,
) {
  const { error: delErr } = await supabase
    .from("recipe_combination_recipe")
    .delete()
    .eq("recipe_combination_id", combinationId);
  if (delErr) throwFromPostgrest(delErr);

  if (recipes.length === 0) return;

  const rows = recipes.map((r) => ({
    recipe_combination_id: combinationId,
    recipe_id: r.recipeId,
    role_in_meal: r.roleInMeal,
    sequence_order: r.sequenceOrder,
    notes: r.notes ?? null,
  }));
  const { error: insErr } = await supabase
    .from("recipe_combination_recipe")
    .insert(rows);
  if (insErr) throwFromPostgrest(insErr);
}

export const recipeCombinationRouter = createTRPCRouter({
  list: authedProcedure
    .input(recipeCombinationListInputSchema)
    .query(async ({ ctx, input }) => {
      const limit = input.limit;
      let query = ctx.supabase
        .from("recipe_combination")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit + 1);

      if (input.q) {
        query = query.or(
          `name.ilike.%${input.q}%,notes.ilike.%${input.q}%`,
        );
      }
      if (input.isTemplate !== undefined) {
        query = query.eq("is_template", input.isTemplate);
      }
      if (input.minRating !== undefined) {
        query = query.gte("make_again_rating", input.minRating);
      }
      if (input.cursor) {
        query = query.lt("created_at", input.cursor);
      }

      const { data, error } = await query;
      if (error) throwFromPostgrest(error);

      const rows = (data ?? []) as RecipeCombinationRow[];
      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && page.length > 0
          ? page[page.length - 1]!.created_at
          : null;

      return {
        items: page.map(mapRecipeCombinationRow),
        nextCursor,
      };
    }),

  /** Detail by id â€” does NOT filter deleted_at. */
  byId: authedProcedure
    .input(recipeCombinationByIdInputSchema)
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("recipe_combination")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "RecipeCombination not found");

      const { data: links, error: linkErr } = await ctx.supabase
        .from("recipe_combination_recipe")
        .select("*")
        .eq("recipe_combination_id", input.id)
        .order("sequence_order", { ascending: true });
      if (linkErr) throwFromPostgrest(linkErr);

      return {
        ...mapRecipeCombinationRow(data as RecipeCombinationRow),
        recipes: ((links ?? []) as RecipeCombinationRecipeRow[]).map(
          mapRecipeCombinationRecipeRow,
        ),
      };
    }),

  create: authedProcedure
    .input(recipeCombinationCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const fields = recipeCombinationWriteFields({
        name: input.name,
        notes: input.notes,
        makeAgainRating: input.makeAgainRating,
        isTemplate: input.isTemplate,
      });

      const { data, error } = await ctx.supabase
        .from("recipe_combination")
        .insert({
          ...fields,
          created_by_user_id: ctx.userId,
        })
        .select("*")
        .single();
      if (error) throwFromPostgrest(error);

      const row = data as RecipeCombinationRow;
      await replaceCombinationRecipes(ctx.supabase, row.id, input.recipes);

      const { data: links } = await ctx.supabase
        .from("recipe_combination_recipe")
        .select("*")
        .eq("recipe_combination_id", row.id)
        .order("sequence_order", { ascending: true });

      return {
        ...mapRecipeCombinationRow(row),
        recipes: ((links ?? []) as RecipeCombinationRecipeRow[]).map(
          mapRecipeCombinationRecipeRow,
        ),
      };
    }),

  update: authedProcedure
    .input(recipeCombinationUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, recipes, ...rest } = input;
      const fields = recipeCombinationWriteFields(rest);

      if (Object.keys(fields).length > 0) {
        const { error } = await ctx.supabase
          .from("recipe_combination")
          .update(fields)
          .eq("id", id)
          .is("deleted_at", null);
        if (error) throwFromPostgrest(error);
      }

      if (recipes !== undefined) {
        await replaceCombinationRecipes(ctx.supabase, id, recipes);
      }

      const { data, error } = await ctx.supabase
        .from("recipe_combination")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "RecipeCombination not found");

      const { data: links } = await ctx.supabase
        .from("recipe_combination_recipe")
        .select("*")
        .eq("recipe_combination_id", id)
        .order("sequence_order", { ascending: true });

      return {
        ...mapRecipeCombinationRow(data as RecipeCombinationRow),
        recipes: ((links ?? []) as RecipeCombinationRecipeRow[]).map(
          mapRecipeCombinationRecipeRow,
        ),
      };
    }),

  rate: authedProcedure
    .input(recipeCombinationRateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("recipe_combination")
        .update({ make_again_rating: input.makeAgainRating })
        .eq("id", input.id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "RecipeCombination not found");
      return mapRecipeCombinationRow(data as RecipeCombinationRow);
    }),

  softDelete: authedProcedure
    .input(recipeCombinationSoftDeleteInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("recipe_combination")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", input.id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "RecipeCombination not found or already deleted");
      return mapRecipeCombinationRow(data as RecipeCombinationRow);
    }),
});
```

### FILE: apps/web/src/server/routers/_app.ts
```typescript
/**
 * Root app router â€” Wave 1 content domain only.
 * mealPlan / shoppingList are Wave 2 â€” intentionally omitted.
 */
import { createTRPCRouter } from "../trpc";
import { categoryRouter } from "./category";
import { chefIdeaRouter } from "./chefIdea";
import { ingredientRouter } from "./ingredient";
import { recipeRouter } from "./recipe";
import { recipeCombinationRouter } from "./recipeCombination";
import { tagRouter } from "./tag";

export const appRouter = createTRPCRouter({
  recipe: recipeRouter,
  ingredient: ingredientRouter,
  category: categoryRouter,
  tag: tagRouter,
  chefIdea: chefIdeaRouter,
  recipeCombination: recipeCombinationRouter,
});

export type AppRouter = typeof appRouter;
```

### FILE: apps/web/src/server/routers/__tests__/schemas.test.ts
```typescript
/**
 * Zod boundary tests for content-domain schemas (Product PRD Â§11 unit layer).
 *
 * Covers: invalid enums, quantity 0, rating 6, empty combination recipes,
 * decay-path without `use`, novel foodSafetyProfile contaminant key accepted.
 * Athlete/portion inputs are out of scope for this domain.
 */
import { describe, expect, it } from "vitest";
import {
  chefIdeaCreateInputSchema,
  chefIdeaStatusSchema,
  foodSafetyProfileSchema,
  ingredientCreateInputSchema,
  leftoverDecayPathEntrySchema,
  leftoverDecayPathSchema,
  ratingSchema,
  recipeCombinationCreateInputSchema,
  recipeCreateInputSchema,
  recipeIngredientInputSchema,
  roleInMealSchema,
} from "@menu-boss/schemas";

const UUID = "11111111-1111-4111-8111-111111111111";
const UUID2 = "22222222-2222-4222-8222-222222222222";

describe("ratingSchema", () => {
  it("accepts integers 1â€“5", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      expect(ratingSchema.parse(n)).toBe(n);
    }
  });

  it("rejects rating 6", () => {
    const r = ratingSchema.safeParse(6);
    expect(r.success).toBe(false);
  });

  it("rejects rating 0 and non-integers", () => {
    expect(ratingSchema.safeParse(0).success).toBe(false);
    expect(ratingSchema.safeParse(3.5).success).toBe(false);
  });
});

describe("recipeIngredientInputSchema", () => {
  const base = {
    ingredientId: UUID,
    unitId: UUID2,
    sequenceOrder: 0,
    isOptional: false,
  };

  it("accepts quantity > 0", () => {
    expect(
      recipeIngredientInputSchema.parse({ ...base, quantity: 0.5 }),
    ).toMatchObject({ quantity: 0.5 });
  });

  it("rejects quantity 0", () => {
    const r = recipeIngredientInputSchema.safeParse({
      ...base,
      quantity: 0,
    });
    expect(r.success).toBe(false);
  });

  it("rejects negative quantity", () => {
    expect(
      recipeIngredientInputSchema.safeParse({ ...base, quantity: -1 })
        .success,
    ).toBe(false);
  });
});

describe("roleInMealSchema / enums", () => {
  it("accepts known roles", () => {
    for (const role of ["main", "side", "dessert", "appetizer", "other"]) {
      expect(roleInMealSchema.parse(role)).toBe(role);
    }
  });

  it("rejects invalid role enum", () => {
    expect(roleInMealSchema.safeParse("entree").success).toBe(false);
    expect(roleInMealSchema.safeParse("MAIN").success).toBe(false);
  });

  it("rejects invalid chefIdea status", () => {
    expect(chefIdeaStatusSchema.safeParse("draft").success).toBe(false);
    expect(chefIdeaStatusSchema.parse("abandoned")).toBe("abandoned");
  });
});

describe("recipeCombinationCreateInputSchema", () => {
  it("rejects empty recipes array", () => {
    const r = recipeCombinationCreateInputSchema.safeParse({
      name: "Sunday Dinner",
      recipes: [],
    });
    expect(r.success).toBe(false);
  });

  it("accepts at least one recipe", () => {
    const r = recipeCombinationCreateInputSchema.parse({
      name: "Sunday Dinner",
      recipes: [
        {
          recipeId: UUID,
          roleInMeal: "main",
          sequenceOrder: 0,
        },
      ],
    });
    expect(r.recipes).toHaveLength(1);
  });
});

describe("leftoverDecayPath", () => {
  it("rejects entry without use", () => {
    const r = leftoverDecayPathEntrySchema.safeParse({
      notes: "something",
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty use after trim", () => {
    expect(
      leftoverDecayPathEntrySchema.safeParse({ use: "   " }).success,
    ).toBe(false);
  });

  it("accepts use-only and full entry", () => {
    expect(leftoverDecayPathEntrySchema.parse({ use: "Cuban Sandwiches" })).toEqual({
      use: "Cuban Sandwiches",
    });
    expect(
      leftoverDecayPathSchema.parse([
        {
          use: "Bolognese",
          notes: "freezes well",
          linkedRecipeIds: [UUID],
        },
      ]),
    ).toHaveLength(1);
  });
});

describe("foodSafetyProfileSchema", () => {
  it("accepts mercury + general known keys", () => {
    const profile = foodSafetyProfileSchema.parse({
      mercury: {
        fda_category: "Good Choices",
        risk_level: "moderate",
        recommended_frequency: "2-3/week",
        source: "FDA/EPA",
        last_reviewed: "2026-06",
      },
      general: {
        cooking_temperature: "145F",
        storage_notes: "1-2 days",
      },
    });
    expect(profile.mercury?.fda_category).toBe("Good Choices");
  });

  it("accepts novel contaminant key via catchall", () => {
    const profile = foodSafetyProfileSchema.parse({
      pfas: {
        risk_level: "unknown",
        notes: "emerging guidance",
        source: "EPA draft",
      },
    });
    expect(profile.pfas).toBeDefined();
    expect(profile.pfas?.risk_level).toBe("unknown");
  });

  it("accepts empty object", () => {
    expect(foodSafetyProfileSchema.parse({})).toEqual({});
  });
});

describe("recipeCreateInputSchema", () => {
  it("requires title and positive yield", () => {
    expect(recipeCreateInputSchema.safeParse({ title: "" }).success).toBe(
      false,
    );
    const r = recipeCreateInputSchema.parse({
      title: "  Roast Chicken  ",
      yieldServings: 4,
    });
    expect(r.title).toBe("Roast Chicken");
    expect(r.yieldServings).toBe(4);
    expect(r.instructions).toEqual([]);
  });

  it("rejects yieldServings 0", () => {
    expect(
      recipeCreateInputSchema.safeParse({
        title: "X",
        yieldServings: 0,
      }).success,
    ).toBe(false);
  });

  it("rejects makeAgainRating 6 on create", () => {
    expect(
      recipeCreateInputSchema.safeParse({
        title: "X",
        makeAgainRating: 6,
      }).success,
    ).toBe(false);
  });
});

describe("ingredientCreateInputSchema", () => {
  it("enforces name length 1â€“120", () => {
    expect(
      ingredientCreateInputSchema.safeParse({ name: "" }).success,
    ).toBe(false);
    expect(
      ingredientCreateInputSchema.safeParse({ name: "a".repeat(121) })
        .success,
    ).toBe(false);
    expect(
      ingredientCreateInputSchema.parse({ name: "  Olive Oil  " }).name,
    ).toBe("Olive Oil");
  });
});

describe("chefIdeaCreateInputSchema", () => {
  it("defaults status to idea and validates priority 1â€“3", () => {
    const r = chefIdeaCreateInputSchema.parse({ title: "Try Greek pork" });
    expect(r.status).toBe("idea");
    expect(
      chefIdeaCreateInputSchema.safeParse({
        title: "X",
        priority: 4,
      }).success,
    ).toBe(false);
  });
});
```

