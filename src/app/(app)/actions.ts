"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { MEAL_TYPES, PRODUCT_CATEGORIES } from "@/lib/seed-data";
import { autoFill, ingredientUsage } from "@/lib/shopping";
import { parseWeekParam, weekDays } from "@/lib/dates";
import { recipeReturnPath } from "@/lib/recipes";
import {
  generateShopping as shoppingGenerateShopping,
  stockBought as shoppingStockBought,
  toggleShoppingItem as shoppingToggleShoppingItem,
  addShoppingItem as shoppingAddShoppingItem,
  createStore,
} from "./shopping/actions";
import { parseRestrictions } from "@/lib/family";

// Кожна дія спершу викликає getContext(): без входу — редірект на /login.
// Доступ до чужих рядків додатково закриває RLS у базі.

const str = (fd: FormData, key: string) => {
  const val = fd.get(key);
  return typeof val === "string" ? val.trim() : "";
};
const num = (fd: FormData, key: string) => {
  const raw = str(fd, key).replace(",", ".");
  return raw === "" ? NaN : Number(raw);
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOrNull = (v: string) => (UUID.test(v) ? v : null);

function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

const weekPath = (base: string, week: string) => `${base}?week=${week}`;

// ---------- Меню ----------

export async function addPlanEntry(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const week = parseWeekParam(str(formData, "week"));
  const path = weekPath("/menu", week);
  const date = str(formData, "date");
  const mealType = str(formData, "meal_type");
  const recipeId = uuidOrNull(str(formData, "recipe_id"));
  if (!weekDays(week).includes(date) || !(MEAL_TYPES as readonly string[]).includes(mealType)) {
    fail(path, "Некоректний день або прийом їжі");
  }
  if (!recipeId) fail(path, "Оберіть страву");
  const { error } = await supabase
    .from("meal_plan_entries")
    .insert({ household_id: householdId, plan_date: date, meal_type: mealType, recipe_id: recipeId });
  if (error) fail(path, error.message);
  revalidatePath("/menu");
}

export async function removePlanEntry(formData: FormData) {
  const { supabase } = await getContext();
  const id = uuidOrNull(str(formData, "id"));
  if (id) await supabase.from("meal_plan_entries").delete().eq("id", id);
  revalidatePath("/menu");
}

export async function autoFillWeek(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const week = parseWeekParam(str(formData, "week"));
  const path = weekPath("/menu", week);
  const days = weekDays(week);

  const [entries, recipes] = await Promise.all([
    supabase.from("meal_plan_entries").select("plan_date, meal_type, recipe_id").gte("plan_date", days[0]).lte("plan_date", days[6]),
    supabase.from("recipes").select("id, meal_types"),
  ]);
  if (entries.error || recipes.error) fail(path, (entries.error ?? recipes.error)!.message);
  if (!recipes.data!.length) fail(path, "Спочатку додайте рецепти");

  const taken = new Set(entries.data!.map((e) => `${e.plan_date}|${e.meal_type}`));
  const empty = days.flatMap((date) =>
    (["breakfast", "lunch", "dinner"] as const)
      .filter((mealType) => !taken.has(`${date}|${mealType}`))
      .map((mealType) => ({ date, mealType })),
  );
  const used = entries.data!.map((e) => e.recipe_id).filter(Boolean) as string[];
  const picks = autoFill(empty, recipes.data!, used);
  if (picks.length) {
    const { error } = await supabase.from("meal_plan_entries").insert(
      picks.map((p) => ({ household_id: householdId, plan_date: p.date, meal_type: p.mealType, recipe_id: p.recipeId })),
    );
    if (error) fail(path, error.message);
  }
  revalidatePath("/menu");
}

export async function clearWeek(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const week = parseWeekParam(str(formData, "week"));
  const days = weekDays(week);
  const { error } = await supabase
    .from("meal_plan_entries")
    .delete()
    .eq("household_id", householdId)
    .gte("plan_date", days[0])
    .lte("plan_date", days[6]);
  if (error) fail(weekPath("/menu", week), error.message);
  revalidatePath("/menu");
}

// ---------- Рецепти ----------

export async function saveRecipe(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const id = uuidOrNull(str(formData, "id"));
  const formPath = id ? `/recipes/${id}/edit` : "/recipes/new";

  const title = str(formData, "title");
  const baseServings = num(formData, "base_servings");
  const cookMinutes = num(formData, "cook_minutes");
  const mealTypes = formData.getAll("meal_types").map(String).filter((m) => (MEAL_TYPES as readonly string[]).includes(m));
  if (!title) fail(formPath, "Вкажіть назву");
  if (!(baseServings > 0 && baseServings <= 50)) fail(formPath, "Кількість порцій має бути від 0,5 до 50");

  let ingredients: { product_id: string; quantity: number; optional: boolean }[] = [];
  try {
    const raw = JSON.parse(str(formData, "ingredients") || "[]") as unknown[];
    ingredients = raw
      .map((r) => r as { product_id?: string; quantity?: number | string; optional?: boolean })
      .map((r) => ({
        product_id: String(r.product_id ?? ""),
        quantity: Number(String(r.quantity ?? "").replace(",", ".")),
        optional: Boolean(r.optional),
      }))
      .filter((r) => UUID.test(r.product_id));
  } catch {
    fail(formPath, "Не вдалося прочитати інгредієнти");
  }
  if (ingredients.some((i) => !(i.quantity > 0))) fail(formPath, "У кожного інгредієнта має бути кількість більше нуля");

  const fields = {
    title,
    description: str(formData, "description") || null,
    instructions: str(formData, "instructions") || null,
    base_servings: baseServings,
    cook_minutes: cookMinutes > 0 ? Math.round(cookMinutes) : null,
    meal_types: mealTypes,
    kid_notes: str(formData, "kid_notes") || null,
  };

  let recipeId = id;
  if (id) {
    const { error } = await supabase.from("recipes").update(fields).eq("id", id);
    if (error) fail(formPath, error.message);
    const del = await supabase.from("recipe_ingredients").delete().eq("recipe_id", id);
    if (del.error) fail(formPath, del.error.message);
  } else {
    const { data, error } = await supabase.from("recipes").insert({ household_id: householdId, ...fields }).select("id").single();
    if (error) fail(formPath, error.message);
    recipeId = data!.id as string;
  }

  if (ingredients.length) {
    const { error } = await supabase.from("recipe_ingredients").insert(
      ingredients.map((ing, i) => ({ household_id: householdId, recipe_id: recipeId, ...ing, sort_order: i })),
    );
    if (error) fail(`/recipes/${recipeId}/edit`, "Рецепт збережено, але інгредієнти — ні: " + error.message);
  }
  revalidatePath("/recipes");
  redirect(`/recipes/${recipeId}`);
}

export async function deleteRecipe(formData: FormData) {
  const { supabase } = await getContext();
  const id = uuidOrNull(str(formData, "id"));
  if (id) {
    const { error } = await supabase.from("recipes").delete().eq("id", id);
    if (error) fail(`/recipes/${id}`, error.message);
  }
  revalidatePath("/recipes");
  redirect("/recipes");
}

// ---------- Список покупок ----------

export async function generateShopping(formData: FormData) {
  return shoppingGenerateShopping(formData);
}

/** Куплені (відмічені) позиції з продуктом переносить у запаси — кожну лише один раз. */
export async function stockBought(formData: FormData) {
  return shoppingStockBought(formData);
}

// ---------- Запаси ----------

export async function setPantryItem(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const productId = uuidOrNull(str(formData, "product_id"));
  const quantity = num(formData, "quantity");
  if (!productId) fail("/pantry", "Оберіть продукт");
  if (!(quantity >= 0)) fail("/pantry", "Вкажіть кількість");
  const result =
    quantity === 0
      ? await supabase.from("pantry_items").delete().eq("household_id", householdId).eq("product_id", productId)
      : await supabase
          .from("pantry_items")
          .upsert(
            { household_id: householdId, product_id: productId, quantity, updated_at: new Date().toISOString() },
            { onConflict: "household_id,product_id" },
          );
  if (result.error) fail("/pantry", result.error.message);
  revalidatePath("/pantry");
}

/** «Приготовано»: списує інгредієнти страви із запасів; зняття позначки повертає їх. */
export async function setCooked(formData: FormData) {
  const { supabase, householdId, portions } = await getContext();
  const id = uuidOrNull(str(formData, "id"));
  const cooked = str(formData, "cooked") === "true";
  const path = recipeReturnPath(str(formData, "return_to"), weekPath("/menu", parseWeekParam(str(formData, "week"))));
  if (!id) return;

  // перемикаємо лише з протилежного стану: подвійний клік не спише двічі
  let flip = supabase
    .from("meal_plan_entries")
    .update({ cooked_at: cooked ? new Date().toISOString() : null })
    .eq("id", id);
  flip = cooked ? flip.is("cooked_at", null) : flip.not("cooked_at", "is", null);
  const { data, error } = await flip.select(
    "servings, recipes(base_servings, recipe_ingredients(product_id, quantity, optional))",
  );
  if (error) fail(path, error.message);

  type Row = {
    servings: number | null;
    recipes: { base_servings: number; recipe_ingredients: { product_id: string; quantity: number; optional: boolean }[] } | null;
  };
  const entry = (data as unknown as Row[])[0];
  if (entry?.recipes) {
    const usage = ingredientUsage(
      {
        servings: entry.servings === null ? null : Number(entry.servings),
        baseServings: Number(entry.recipes.base_servings),
        ingredients: entry.recipes.recipe_ingredients.map((i) => ({
          productId: i.product_id,
          quantity: Number(i.quantity),
          optional: i.optional,
        })),
      },
      portions,
    );
    if (cooked) {
      // списуємо лише те, що ведеться в запасах: adjust_pantry не створює рядків для від'ємних змін
      const rpc = await supabase.rpc("adjust_pantry", {
        p_household_id: householdId,
        p_items: usage.map((u) => ({ product_id: u.productId, delta: -u.quantity })),
      });
      if (rpc.error) fail(path, rpc.error.message);
      await supabase
        .from("pantry_movements")
        .update({ source: "cooked", meal_plan_entry_id: id })
        .eq("household_id", householdId)
        .eq("source", "manual")
        .is("meal_plan_entry_id", null)
        .gte("created_at", new Date(Date.now() - 5000).toISOString())
        .in(
          "product_id",
          usage.map((u) => u.productId),
        );
    } else {
      // повертаємо тільки продукти, які є в запасах, щоб не «створити» сіль чи олію
      const { data: tracked } = await supabase.from("pantry_items").select("product_id");
      const known = new Set((tracked ?? []).map((t) => t.product_id as string));
      const back = usage.filter((u) => known.has(u.productId));
      if (back.length) {
        const rpc = await supabase.rpc("adjust_pantry", {
          p_household_id: householdId,
          p_items: back.map((u) => ({ product_id: u.productId, delta: u.quantity })),
        });
        if (rpc.error) fail(path, rpc.error.message);
      }
    }
  }
  revalidatePath("/menu");
  revalidatePath("/pantry");
  revalidatePath("/recipes");
  revalidatePath("/recipes/[id]", "page");
}

export async function toggleShoppingItem(formData: FormData) {
  return shoppingToggleShoppingItem(formData);
}

export async function addShoppingItem(formData: FormData) {
  return shoppingAddShoppingItem(formData);
}

// ---------- Довідники ----------

export async function addProduct(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const name = str(formData, "name");
  const category = str(formData, "category");
  const unit = str(formData, "unit");
  if (!name) fail("/products", "Вкажіть назву продукту");
  const { error } = await supabase.from("products").insert({
    household_id: householdId,
    name,
    category: (PRODUCT_CATEGORIES as readonly string[]).includes(category) ? category : "інше",
    unit: ["г", "мл", "шт"].includes(unit) ? unit : "г",
    preferred_store_id: uuidOrNull(str(formData, "store_id")),
    is_staple: formData.get("is_staple") === "on",
  });
  if (error) fail("/products", error.code === "23505" ? `Продукт «${name}» вже є` : error.message);
  revalidatePath("/products");
}

export async function addFamilyMember(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const name = str(formData, "name");
  const factor = num(formData, "portion_factor");
  if (!name) fail("/settings", "Вкажіть ім'я");
  if (!(factor > 0 && factor <= 3)) fail("/settings", "Порція має бути від 0,1 до 3");
  const restrictions = parseRestrictions(str(formData, "restrictions"));
  const { error } = await supabase.from("family_members").insert({
    household_id: householdId,
    name,
    kind: str(formData, "kind") === "child" ? "child" : "adult",
    portion_factor: factor,
    restrictions,
  });
  if (error) fail("/settings", error.message);
  revalidatePath("/", "layout");
}

export async function updateFamilyMember(formData: FormData) {
  const { supabase } = await getContext();
  const id = uuidOrNull(str(formData, "id"));
  const factor = num(formData, "portion_factor");
  if (!id) return;
  if (!(factor > 0 && factor <= 3)) fail("/settings", "Порція має бути від 0,1 до 3");
  const updateData: Record<string, unknown> = { portion_factor: factor };
  const rawRestrictions = str(formData, "restrictions");
  if (rawRestrictions) {
    updateData.restrictions = parseRestrictions(rawRestrictions);
  }
  const name = str(formData, "name");
  if (name) updateData.name = name;
  const { error } = await supabase.from("family_members").update(updateData).eq("id", id);
  if (error) fail("/settings", error.message);
  revalidatePath("/", "layout");
}

export async function addStore(formData: FormData) {
  return createStore(formData);
}

export async function addEquipment(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const name = str(formData, "name");
  if (!name) fail("/settings", "Вкажіть назву техніки");
  const { error } = await supabase.from("equipment").insert({ household_id: householdId, name });
  if (error) fail("/settings", error.code === "23505" ? `«${name}» вже є` : error.message);
  revalidatePath("/settings");
}

const DELETABLE = {
  products: "/products",
  family_members: "/settings",
  stores: "/settings",
  equipment: "/settings",
  shopping_list_items: "/shopping",
  pantry_items: "/pantry",
} as const;

export async function deleteRow(formData: FormData) {
  const { supabase } = await getContext();
  const table = str(formData, "table") as keyof typeof DELETABLE;
  const id = uuidOrNull(str(formData, "id"));
  const path = DELETABLE[table];
  if (!path || !id) return;
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) {
    fail(path, error.code === "23503" ? "Не можна видалити: продукт використовується в рецептах" : error.message);
  }
  revalidatePath("/", "layout");
}

// ---------- Розпізнане (фото / відео / голос) → запаси ----------

export type ScanApplyItem = {
  productId: string | null;
  name: string;
  category: string;
  unit: string;
  quantity: number;
};

/** Записує підтверджені користувачем позиції: нові продукти створює, запаси додає або замінює. */
export async function applyScan(mode: "add" | "set", items: ScanApplyItem[]): Promise<{ error: string } | void> {
  const { supabase, householdId } = await getContext();
  if (!Array.isArray(items) || items.length === 0) return { error: "Немає позицій для запису" };
  if (items.length > 100) return { error: "Забагато позицій за один раз" };

  const { data: existing, error: loadError } = await supabase.from("products").select("id, name");
  if (loadError) return { error: loadError.message };
  const byId = new Set(existing!.map((p) => p.id as string));
  const byName = new Map(existing!.map((p) => [(p.name as string).trim().toLowerCase(), p.id as string]));

  const totals = new Map<string, number>();
  const add = (productId: string, quantity: number) => totals.set(productId, (totals.get(productId) ?? 0) + quantity);

  for (const item of items) {
    const quantity = Number(item.quantity);
    if (!(quantity > 0) || !Number.isFinite(quantity)) return { error: "У кожної позиції має бути кількість більше нуля" };

    if (item.productId && byId.has(item.productId)) {
      add(item.productId, quantity);
      continue;
    }
    const name = String(item.name ?? "").trim().slice(0, 80);
    if (!name) return { error: "У нового продукту має бути назва" };
    // така назва вже є (або щойно створена в цьому ж записі) — не дублюємо
    let productId = byName.get(name.toLowerCase());
    if (!productId) {
      const { data, error } = await supabase
        .from("products")
        .insert({
          household_id: householdId,
          name,
          category: (PRODUCT_CATEGORIES as readonly string[]).includes(item.category) ? item.category : "інше",
          unit: ["г", "мл", "шт"].includes(item.unit) ? item.unit : "шт",
        })
        .select("id")
        .single();
      if (error) return { error: `Не вдалося створити «${name}»: ${error.message}` };
      productId = data.id as string;
      byName.set(name.toLowerCase(), productId);
    }
    add(productId, quantity);
  }

  if (mode === "add") {
    const { error } = await supabase.rpc("adjust_pantry", {
      p_household_id: householdId,
      p_items: [...totals].map(([product_id, delta]) => ({ product_id, delta })),
    });
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("pantry_items").upsert(
      [...totals].map(([product_id, quantity]) => ({
        household_id: householdId,
        product_id,
        quantity,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "household_id,product_id" },
    );
    if (error) return { error: error.message };
  }

  revalidatePath("/pantry");
  revalidatePath("/products");
  const verb = mode === "add" ? "Додано до запасів" : "Запаси оновлено";
  redirect(`/pantry?info=${encodeURIComponent(`${verb}: ${totals.size} поз.`)}`);
}
