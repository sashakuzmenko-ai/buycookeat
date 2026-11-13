"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { parseWeekParam, weekDays } from "@/lib/dates";
import { buildShoppingList, manualShoppingRow, type PlanLine, type ProductInfo } from "@/lib/shopping";

const str = (fd: FormData, key: string) => {
  const val = fd.get(key);
  return typeof val === "string" ? val.trim() : "";
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOrNull = (v: string) => (UUID.test(v) ? v : null);

function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

const weekPath = (base: string, week: string) => `${base}?week=${week}`;

/** Перенесення позицій списку в інший магазин (для підказки економії) */
export async function moveShoppingItems(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const week = parseWeekParam(str(formData, "week"));
  const path = weekPath("/shopping", week);

  const rawIds = str(formData, "ids");
  const storeId = uuidOrNull(str(formData, "store_id"));
  if (!rawIds) fail(path, "Не вказано позиції для перенесення");
  if (!storeId) fail(path, "Не обрано цільовий магазин");

  let ids: string[] = [];
  try {
    ids = rawIds.startsWith("[") ? JSON.parse(rawIds) : rawIds.split(",").map((s) => s.trim());
  } catch {
    ids = rawIds.split(",").map((s) => s.trim());
  }
  const validIds = ids.filter((id) => UUID.test(id));
  if (validIds.length === 0) fail(path, "Невірні ідентифікатори позицій");

  const { error } = await supabase
    .from("shopping_list_items")
    .update({ store_id: storeId })
    .eq("household_id", householdId)
    .in("id", validIds);

  if (error) fail(path, error.message);
  revalidatePath("/shopping");
}

/** Створення нового магазину */
export async function createStore(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const name = str(formData, "name");
  const week = parseWeekParam(str(formData, "week"));
  const path = weekPath("/shopping", week);

  if (!name) fail(path, "Вкажіть назву магазину");
  const access = str(formData, "access");
  const frequency = str(formData, "visit_frequency");

  const { error } = await supabase.from("stores").insert({
    household_id: householdId,
    name,
    access: ["walk", "drive", "delivery"].includes(access) ? access : "walk",
    kind: access === "delivery" ? "delivery" : "supermarket",
    visit_frequency: ["daily", "weekly", "rare"].includes(frequency) ? frequency : "daily",
    phone: str(formData, "phone") || null,
    url: str(formData, "url") || null,
    notes: str(formData, "notes") || null,
    sort_order: 100,
  });

  if (error) fail(path, error.message);
  revalidatePath("/shopping");
  revalidatePath("/settings");
}

/** Оновлення наявного магазину */
export async function updateStore(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const id = uuidOrNull(str(formData, "id"));
  const week = parseWeekParam(str(formData, "week"));
  const path = weekPath("/shopping", week);

  if (!id) fail(path, "Невірний ідентифікатор магазину");
  const name = str(formData, "name");
  if (!name) fail(path, "Вкажіть назву магазину");
  const access = str(formData, "access");
  const frequency = str(formData, "visit_frequency");

  const { error } = await supabase
    .from("stores")
    .update({
      name,
      access: ["walk", "drive", "delivery"].includes(access) ? access : "walk",
      kind: access === "delivery" ? "delivery" : "supermarket",
      visit_frequency: ["daily", "weekly", "rare"].includes(frequency) ? frequency : "daily",
      phone: str(formData, "phone") || null,
      url: str(formData, "url") || null,
      notes: str(formData, "notes") || null,
    })
    .eq("id", id)
    .eq("household_id", householdId);

  if (error) fail(path, error.message);
  revalidatePath("/shopping");
  revalidatePath("/settings");
}

/** Видалення магазину */
export async function deleteStore(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const id = uuidOrNull(str(formData, "id"));
  const week = parseWeekParam(str(formData, "week"));
  const path = weekPath("/shopping", week);

  if (!id) fail(path, "Невірний ідентифікатор магазину");

  const { error } = await supabase.from("stores").delete().eq("id", id).eq("household_id", householdId);
  if (error) fail(path, error.message);

  revalidatePath("/shopping");
  revalidatePath("/settings");
}

/** Перемикання позначки купленого */
export async function toggleShoppingItem(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const id = uuidOrNull(str(formData, "id"));
  if (id) {
    await supabase
      .from("shopping_list_items")
      .update({ checked: str(formData, "checked") === "true" })
      .eq("id", id)
      .eq("household_id", householdId);
  }
  revalidatePath("/shopping");
}

/** Додавання позиції вручну */
export async function addShoppingItem(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const week = parseWeekParam(str(formData, "week"));
  const path = weekPath("/shopping", week);
  const title = str(formData, "title");
  if (!title) fail(path, "Вкажіть, що купити");

  const { error } = await supabase.from("shopping_list_items").insert({
    ...manualShoppingRow({ householdId, weekStart: week, title }),
    store_id: uuidOrNull(str(formData, "store_id")),
  });
  if (error) fail(path, error.message);
  revalidatePath("/shopping");
}

/** Видалення позиції зі списку */
export async function deleteShoppingItem(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const id = uuidOrNull(str(formData, "id"));
  if (id) {
    await supabase.from("shopping_list_items").delete().eq("id", id).eq("household_id", householdId);
  }
  revalidatePath("/shopping");
}

/** Перерахувати з меню (потреба меню мінус запаси) */
export async function generateShopping(formData: FormData) {
  const { supabase, householdId, portions } = await getContext();
  const week = parseWeekParam(str(formData, "week"));
  const path = weekPath("/shopping", week);
  const days = weekDays(week);

  const [entries, products, previous, pantry] = await Promise.all([
    supabase
      .from("meal_plan_entries")
      .select("servings, recipes(base_servings, recipe_ingredients(product_id, quantity, optional))")
      .gte("plan_date", days[0])
      .lte("plan_date", days[6])
      .not("recipe_id", "is", null)
      .is("cooked_at", null),
    supabase.from("products").select("id, unit, is_staple, preferred_store_id"),
    supabase
      .from("shopping_list_items")
      .select("product_id")
      .eq("week_start", week)
      .eq("source", "plan")
      .eq("checked", true)
      .is("stocked_at", null),
    supabase.from("pantry_items").select("product_id, quantity"),
  ]);
  const firstError = entries.error ?? products.error ?? previous.error ?? pantry.error;
  if (firstError) fail(path, firstError.message);

  type Row = {
    servings: number | null;
    recipes: { base_servings: number; recipe_ingredients: { product_id: string; quantity: number; optional: boolean }[] } | null;
  };
  const plan: PlanLine[] = (entries.data as unknown as Row[])
    .filter((e) => e.recipes)
    .map((e) => ({
      servings: e.servings === null ? null : Number(e.servings),
      baseServings: Number(e.recipes!.base_servings),
      ingredients: e.recipes!.recipe_ingredients.map((i) => ({
        productId: i.product_id,
        quantity: Number(i.quantity),
        optional: i.optional,
      })),
    }));
  const productMap = new Map<string, ProductInfo>(
    products.data!.map((p) => [p.id as string, { unit: p.unit, isStaple: p.is_staple, storeId: p.preferred_store_id }]),
  );
  const stock = new Map(pantry.data!.map((p) => [p.product_id as string, Number(p.quantity)]));
  const lines = buildShoppingList(plan, portions, productMap, stock);
  const bought = new Set(previous.data!.map((r) => r.product_id as string));

  const del = await supabase
    .from("shopping_list_items")
    .delete()
    .eq("household_id", householdId)
    .eq("week_start", week)
    .eq("source", "plan")
    .is("stocked_at", null);
  if (del.error) fail(path, del.error.message);

  if (lines.length) {
    const { error } = await supabase.from("shopping_list_items").insert(
      lines.map((l) => ({
        household_id: householdId,
        week_start: week,
        product_id: l.productId,
        quantity: l.quantity,
        unit: l.unit,
        store_id: l.storeId,
        source: "plan",
        checked: bought.has(l.productId),
      })),
    );
    if (error) fail(path, error.message);
  }
  revalidatePath("/shopping");
  if (!plan.length) fail(path, "У меню на цей тиждень немає неприготованих страв з рецептами");
  if (!lines.length) redirect(`${path}&info=${encodeURIComponent("Усе потрібне на цей тиждень уже є в запасах")}`);
}

/** Перенести куплене на склад */
export async function stockBought(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const week = parseWeekParam(str(formData, "week"));
  const path = weekPath("/shopping", week);

  const { data, error } = await supabase
    .from("shopping_list_items")
    .update({ stocked_at: new Date().toISOString() })
    .eq("household_id", householdId)
    .eq("week_start", week)
    .eq("checked", true)
    .is("stocked_at", null)
    .not("product_id", "is", null)
    .not("quantity", "is", null)
    .select("id, product_id, quantity");

  if (error) fail(path, error.message);
  if (data!.length) {
    const rpc = await supabase.rpc("adjust_pantry", {
      p_household_id: householdId,
      p_items: data!.map((r) => ({ product_id: r.product_id, delta: Number(r.quantity) })),
    });
    if (rpc.error) {
      await supabase.from("shopping_list_items").update({ stocked_at: null }).in("id", data!.map((r) => r.id));
      fail(path, rpc.error.message);
    }
  }
  revalidatePath("/shopping");
  revalidatePath("/pantry");
}
