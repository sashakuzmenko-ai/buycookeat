"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { todayISO, weekStart } from "@/lib/dates";
import {
  coverIngredients,
  mealTypeForNewEntry,
  pickUncookedToday,
  readIngredients,
  recipeReturnPath,
} from "@/lib/recipes";
import { roundQty } from "@/lib/shopping";
import { setCooked } from "../actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const uuidOrNull = (value: string) => (UUID.test(value) ? value : null);

function withMessage(path: string, key: "error" | "info", message: string): never {
  const join = path.includes("?") ? "&" : "?";
  redirect(`${path}${join}${key}=${encodeURIComponent(message)}`);
}

function recipePath(recipeId: string | null): string {
  return recipeReturnPath(recipeId ? `/recipes/${recipeId}` : "/recipes", "/recipes");
}

type EntryRow = { id: string; cooked_at: string | null; meal_type: string };

/** Запис меню, який треба позначити приготованим. null — уже приготовано, вдруге не списуємо. */
async function resolveCookEntry(
  formData: FormData,
  fallback: string,
): Promise<{ entryId: string; recipeId: string | null } | null> {
  const { supabase, householdId } = await getContext();
  const recipeId = uuidOrNull(str(formData, "recipe_id"));
  const requestedEntry = uuidOrNull(str(formData, "entry_id"));
  const today = todayISO();

  if (requestedEntry) {
    const { data, error } = await supabase
      .from("meal_plan_entries")
      .select("id, cooked_at, recipe_id")
      .eq("id", requestedEntry)
      .maybeSingle();
    if (error) withMessage(fallback, "error", error.message);
    if (!data) withMessage(fallback, "error", "Страву в меню не знайдено");
    if (data.cooked_at) return null;
    return { entryId: data.id as string, recipeId: (data.recipe_id as string | null) ?? recipeId };
  }

  if (!recipeId) return null;

  const { data, error } = await supabase
    .from("meal_plan_entries")
    .select("id, cooked_at, meal_type")
    .eq("recipe_id", recipeId)
    .eq("plan_date", today)
    .order("created_at");
  if (error) withMessage(fallback, "error", error.message);

  const rows = (data ?? []) as EntryRow[];
  const open = pickUncookedToday(rows.map((row) => ({ ...row, cookedAt: row.cooked_at, mealType: row.meal_type })));
  if (open) return { entryId: open.id, recipeId };
  if (rows.some((row) => row.cooked_at)) return null;

  const recipe = await supabase.from("recipes").select("meal_types").eq("id", recipeId).maybeSingle();
  if (recipe.error) withMessage(fallback, "error", recipe.error.message);
  if (!recipe.data) withMessage(fallback, "error", "Рецепт не знайдено");

  const inserted = await supabase
    .from("meal_plan_entries")
    .insert({
      household_id: householdId,
      plan_date: today,
      meal_type: mealTypeForNewEntry((recipe.data.meal_types as string[] | null) ?? []),
      recipe_id: recipeId,
    })
    .select("id")
    .single();
  if (inserted.error) withMessage(fallback, "error", inserted.error.message);
  return { entryId: inserted.data.id as string, recipeId };
}

/** «Готувати»: те саме списання, що й позначка «приготовано» в меню. */
export async function cookRecipe(formData: FormData) {
  const recipeId = uuidOrNull(str(formData, "recipe_id"));
  const fallback = recipePath(recipeId);
  const target = await resolveCookEntry(formData, fallback);
  if (!target) return;

  const cooked = new FormData();
  cooked.set("id", target.entryId);
  cooked.set("cooked", "true");
  cooked.set("week", weekStart(todayISO()));
  cooked.set("return_to", recipePath(target.recipeId));
  await setCooked(cooked);
}

type ShoppingIngredient = {
  product_id: string;
  quantity: number | string;
  optional: boolean;
  products:
    | { name?: string; unit?: string; preferred_store_id?: string | null; is_staple?: boolean | null }
    | { name?: string; unit?: string; preferred_store_id?: string | null; is_staple?: boolean | null }[]
    | null;
};

/** Додає в список покупок цього тижня продукти, яких не вистачає на рецепт. */
export async function addMissingToShopping(formData: FormData) {
  const { supabase, householdId, portions } = await getContext();
  const recipeId = uuidOrNull(str(formData, "recipe_id"));
  const path = recipePath(recipeId);
  if (!recipeId) withMessage("/recipes", "error", "Рецепт не знайдено");

  const recipe = await supabase
    .from("recipes")
    .select("base_servings, recipe_ingredients(product_id, quantity, optional, products(name, unit, preferred_store_id, is_staple))")
    .eq("id", recipeId)
    .maybeSingle();
  if (recipe.error) withMessage(path, "error", recipe.error.message);
  if (!recipe.data) withMessage(path, "error", "Рецепт не знайдено");

  const rows = (recipe.data.recipe_ingredients ?? []) as unknown as ShoppingIngredient[];
  const ingredients = readIngredients(
    rows.map((row) => ({
      quantity: row.quantity,
      optional: row.optional,
      products: productWithId(row.product_id, row.products),
    })),
  );
  const pantry = await supabase.from("pantry_items").select("product_id, quantity");
  if (pantry.error) withMessage(path, "error", pantry.error.message);
  const stock = new Map((pantry.data ?? []).map((row) => [row.product_id as string, Number(row.quantity)]));
  const missing = coverIngredients(ingredients, Number(recipe.data.base_servings), portions, stock).filter((item) => item.short);
  if (missing.length === 0) withMessage(path, "info", "Усе потрібне вже є на складі");
  const stapleIds = new Set(rows.filter((row) => isStaple(row.products)).map((row) => row.product_id));
  const buyable = missing.filter((item) => !stapleIds.has(item.productId));
  if (buyable.length === 0) withMessage(path, "info", "Бракує лише базових запасів — їх у список покупок не додаємо");

  const week = weekStart(todayISO());
  const existing = await supabase
    .from("shopping_list_items")
    .select("product_id")
    .eq("week_start", week)
    .is("stocked_at", null)
    .in(
      "product_id",
      buyable.map((item) => item.productId),
    );
  if (existing.error) withMessage(path, "error", existing.error.message);
  const already = new Set((existing.data ?? []).map((row) => row.product_id as string));
  const fresh = buyable.filter((item) => !already.has(item.productId));
  const shoppingPath = `/shopping?week=${week}`;
  if (fresh.length === 0) {
    revalidatePath("/shopping");
    withMessage(shoppingPath, "info", "Ці продукти вже є в списку покупок");
  }

  const storeByProduct = new Map(rows.map((row) => [row.product_id, storeOf(row.products)] as const));
  const { error } = await supabase.from("shopping_list_items").insert(
    fresh.map((item) => ({
      household_id: householdId,
      week_start: week,
      product_id: item.productId,
      quantity: roundQty(Math.max(0, item.needed - item.have), item.unit),
      unit: item.unit,
      store_id: storeByProduct.get(item.productId) ?? null,
      source: "manual" as const,
    })),
  );
  if (error) withMessage(path, "error", error.message);
  revalidatePath("/shopping");
  revalidatePath("/recipes");
  withMessage(shoppingPath, "info", "Додано до списку покупок");
}

function productWithId(productId: string, products: ShoppingIngredient["products"]): { id: string; name: string; unit: string } {
  const row = Array.isArray(products) ? products[0] : products;
  const name = row?.name?.trim();
  const unit = row?.unit?.trim();
  return {
    id: productId,
    name: name && name.length > 0 ? name : "Продукт",
    unit: unit && unit.length > 0 ? unit : "г",
  };
}

function isStaple(products: ShoppingIngredient["products"]): boolean {
  const row = Array.isArray(products) ? products[0] : products;
  return row?.is_staple === true;
}

function storeOf(products: ShoppingIngredient["products"]): string | null {
  const row = Array.isArray(products) ? products[0] : products;
  const storeId = row?.preferred_store_id ?? "";
  return UUID.test(storeId) ? storeId : null;
}
