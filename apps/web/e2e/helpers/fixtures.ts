/**
 * Idempotent E2E content fixtures under member_a JWT (RLS-authorized writes).
 * No service role. Fixed UUIDs so specs can deep-link by id/title.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { E2E_FIXTURES, PERSONAS } from "../personas";

export async function ensureContentFixtures(
  memberA: SupabaseClient,
): Promise<void> {
  const uid = PERSONAS.member_a.id;
  const f = E2E_FIXTURES;

  // --- Ingredients (tuna with mercury safety profile; flour for cross-dim; parsley optional)
  const { error: ingErr } = await memberA.from("ingredient").upsert(
    [
      {
        id: f.tunaIngredientId,
        name: "E2E Yellowfin Tuna",
        default_unit_id: f.unitGramId,
        food_safety_profile: {
          mercury: {
            fda_category: "good_choices",
            recommended_frequency: "1 serving per week",
            notes: "E2E seafood safety fixture",
          },
        },
        is_user_added: true,
        created_by_user_id: uid,
      },
      {
        id: f.flourIngredientId,
        name: "E2E All-Purpose Flour",
        default_unit_id: f.unitGramId,
        food_safety_profile: {},
        is_user_added: true,
        created_by_user_id: uid,
      },
      {
        id: f.parsleyIngredientId,
        name: "E2E Fresh Parsley",
        default_unit_id: f.unitEachId,
        food_safety_profile: {},
        is_user_added: true,
        created_by_user_id: uid,
      },
    ],
    { onConflict: "id" },
  );
  if (ingErr) throw new Error(`fixture ingredients: ${ingErr.message}`);

  const { error: ingCatErr } = await memberA.from("ingredient_category").upsert(
    [
      {
        ingredient_id: f.tunaIngredientId,
        category_id: f.categorySeafoodId,
      },
      {
        ingredient_id: f.flourIngredientId,
        category_id: f.categoryGrainsId,
      },
      {
        ingredient_id: f.parsleyIngredientId,
        category_id: f.categoryVegetableId,
      },
    ],
    { onConflict: "ingredient_id,category_id" },
  );
  if (ingCatErr) throw new Error(`fixture ingredient_category: ${ingCatErr.message}`);

  // --- Recipes
  const { error: recipeErr } = await memberA.from("recipe").upsert(
    [
      {
        id: f.seafoodRecipeId,
        title: f.seafoodRecipeTitle,
        description: "E2E seafood recipe with mercury safety notes on tuna.",
        yield_servings: 4,
        created_by_user_id: uid,
        leftover_decay_path: [],
      },
      {
        id: f.linkedRecipeId,
        title: f.linkedRecipeTitle,
        description: "Linked leftover destination for E2E decay path.",
        yield_servings: 2,
        created_by_user_id: uid,
        leftover_decay_path: [],
      },
      {
        id: f.shoppingRecipeAId,
        title: f.shoppingRecipeATitle,
        description: "Shopping list plan A — mass flour + optional parsley.",
        yield_servings: 4,
        created_by_user_id: uid,
      },
      {
        id: f.shoppingRecipeBId,
        title: f.shoppingRecipeBTitle,
        description: "Shopping list plan B — volume flour (cross-dimension).",
        yield_servings: 4,
        created_by_user_id: uid,
      },
    ],
    { onConflict: "id" },
  );
  if (recipeErr) throw new Error(`fixture recipes: ${recipeErr.message}`);

  // recipe_ingredient lines (delete+insert for idempotent quantities)
  await memberA
    .from("recipe_ingredient")
    .delete()
    .in("recipe_id", [
      f.seafoodRecipeId,
      f.linkedRecipeId,
      f.shoppingRecipeAId,
      f.shoppingRecipeBId,
    ]);

  const { error: riErr } = await memberA.from("recipe_ingredient").insert([
    {
      recipe_id: f.seafoodRecipeId,
      ingredient_id: f.tunaIngredientId,
      quantity: 500,
      unit_id: f.unitGramId,
      sequence_order: 0,
      is_optional: false,
    },
    {
      recipe_id: f.linkedRecipeId,
      ingredient_id: f.tunaIngredientId,
      quantity: 200,
      unit_id: f.unitGramId,
      sequence_order: 0,
      is_optional: false,
    },
    {
      recipe_id: f.shoppingRecipeAId,
      ingredient_id: f.flourIngredientId,
      quantity: 500,
      unit_id: f.unitGramId,
      sequence_order: 0,
      is_optional: false,
    },
    {
      recipe_id: f.shoppingRecipeAId,
      ingredient_id: f.parsleyIngredientId,
      quantity: 1,
      unit_id: f.unitEachId,
      sequence_order: 1,
      is_optional: true,
    },
    {
      recipe_id: f.shoppingRecipeBId,
      ingredient_id: f.flourIngredientId,
      quantity: 2,
      unit_id: f.unitCupId,
      sequence_order: 0,
      is_optional: false,
    },
  ]);
  if (riErr) throw new Error(`fixture recipe_ingredient: ${riErr.message}`);

  const { error: rcErr } = await memberA.from("recipe_category").upsert(
    [
      { recipe_id: f.seafoodRecipeId, category_id: f.categorySeafoodId },
      { recipe_id: f.shoppingRecipeAId, category_id: f.categoryGrainsId },
      { recipe_id: f.shoppingRecipeBId, category_id: f.categoryGrainsId },
    ],
    { onConflict: "recipe_id,category_id" },
  );
  if (rcErr) throw new Error(`fixture recipe_category: ${rcErr.message}`);

  const { error: rtErr } = await memberA.from("recipe_tag").upsert(
    [
      { recipe_id: f.seafoodRecipeId, tag_id: f.tagDinnerId },
      { recipe_id: f.seafoodRecipeId, tag_id: f.tagEasyId },
    ],
    { onConflict: "recipe_id,tag_id" },
  );
  if (rtErr) throw new Error(`fixture recipe_tag: ${rtErr.message}`);
}
