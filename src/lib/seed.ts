import type { SupabaseClient } from "@supabase/supabase-js";
import { SEED_EQUIPMENT, SEED_FAMILY, SEED_PRODUCTS, SEED_RECIPES, SEED_STORES } from "./seed-data";

/** Наповнює нове домогосподарство стартовими даними. Кидає помилку, якщо щось не вставилось. */
export async function seedHousehold(supabase: SupabaseClient, householdId: string) {
  const h = { household_id: householdId };

  const family = await supabase.from("family_members").insert(SEED_FAMILY.map((m) => ({ ...h, ...m })));
  if (family.error) throw new Error(family.error.message);

  const stores = await supabase
    .from("stores")
    .insert(SEED_STORES.map((s, i) => ({ ...h, ...s, sort_order: i })))
    .select("id, name");
  if (stores.error) throw new Error(stores.error.message);
  const storeId = new Map(stores.data.map((s) => [s.name as string, s.id as string]));

  const equipment = await supabase
    .from("equipment")
    .insert(SEED_EQUIPMENT.map((name) => ({ ...h, name })))
    .select("id, name");
  if (equipment.error) throw new Error(equipment.error.message);
  const equipmentId = new Map(equipment.data.map((e) => [e.name as string, e.id as string]));

  const products = await supabase
    .from("products")
    .insert(
      SEED_PRODUCTS.map(([name, category, unit, staple, store]) => ({
        ...h,
        name,
        category,
        unit,
        is_staple: Boolean(staple),
        preferred_store_id: store ? (storeId.get(store) ?? null) : null,
      })),
    )
    .select("id, name");
  if (products.error) throw new Error(products.error.message);
  const productId = new Map(products.data.map((p) => [p.name as string, p.id as string]));

  const recipes = await supabase
    .from("recipes")
    .insert(
      SEED_RECIPES.map((r) => ({
        ...h,
        title: r.title,
        instructions: r.instructions,
        base_servings: r.base_servings,
        cook_minutes: r.cook_minutes,
        meal_types: r.meal_types,
        kid_notes: r.kid_notes ?? null,
      })),
    )
    .select("id, title");
  if (recipes.error) throw new Error(recipes.error.message);
  const recipeId = new Map(recipes.data.map((r) => [r.title as string, r.id as string]));

  const ingredients = SEED_RECIPES.flatMap((r) =>
    r.ingredients.map(([name, quantity], i) => ({
      ...h,
      recipe_id: recipeId.get(r.title)!,
      product_id: productId.get(name)!,
      quantity,
      sort_order: i,
    })),
  );
  const ing = await supabase.from("recipe_ingredients").insert(ingredients);
  if (ing.error) throw new Error(ing.error.message);

  const links = SEED_RECIPES.flatMap((r) =>
    (r.equipment ?? []).map((name) => ({
      ...h,
      recipe_id: recipeId.get(r.title)!,
      equipment_id: equipmentId.get(name)!,
    })),
  );
  if (links.length) {
    const eq = await supabase.from("recipe_equipment").insert(links);
    if (eq.error) throw new Error(eq.error.message);
  }
}
