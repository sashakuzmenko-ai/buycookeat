"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { MEAL_TYPES, PRODUCT_CATEGORIES } from "@/lib/seed-data";
import { autoFill, buildShoppingList, ingredientUsage, type PlanLine, type ProductInfo } from "@/lib/shopping";
import { parseWeekParam, weekDays } from "@/lib/dates";

// Кожна дія спершу викликає getContext(): без входу — редірект на /login.
// Доступ до чужих рядків додатково закриває RLS у базі.

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
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
  const path = weekPath("/", week);
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
  revalidatePath("/");
}

export async function removePlanEntry(formData: FormData) {
  const { supabase } = await getContext();
  const id = uuidOrNull(str(formData, "id"));
  if (id) await supabase.from("meal_plan_entries").delete().eq("id", id);
  revalidatePath("/");
}

export async function autoFillWeek(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const week = parseWeekParam(str(formData, "week"));
  const path = weekPath("/", week);
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
  revalidatePath("/");
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
  if (error) fail(weekPath("/", week), error.message);
  revalidatePath("/");
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
      // приготоване вже списане із запасів — повторно не рахуємо
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
  // куплене, але ще не перенесене в запаси, лишається відміченим після перерахунку
  const bought = new Set(previous.data!.map((r) => r.product_id as string));

  // позиції, вже перенесені в запаси, лишаємо як історію покупок тижня
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

/** Куплені (відмічені) позиції з продуктом переносить у запаси — кожну лише один раз. */
export async function stockBought(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const week = parseWeekParam(str(formData, "week"));
  const path = weekPath("/shopping", week);
  // спершу позначаємо, потім додаємо: повторний клік не подвоїть запаси
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
  const path = weekPath("/", parseWeekParam(str(formData, "week")));
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
  revalidatePath("/");
  revalidatePath("/pantry");
}

export async function toggleShoppingItem(formData: FormData) {
  const { supabase } = await getContext();
  const id = uuidOrNull(str(formData, "id"));
  if (id) await supabase.from("shopping_list_items").update({ checked: str(formData, "checked") === "true" }).eq("id", id);
  revalidatePath("/shopping");
}

export async function addShoppingItem(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const week = parseWeekParam(str(formData, "week"));
  const path = weekPath("/shopping", week);
  const title = str(formData, "title");
  if (!title) fail(path, "Вкажіть, що купити");
  const { error } = await supabase.from("shopping_list_items").insert({
    household_id: householdId,
    week_start: week,
    title,
    store_id: uuidOrNull(str(formData, "store_id")),
    source: "manual",
  });
  if (error) fail(path, error.message);
  revalidatePath("/shopping");
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
  const { error } = await supabase.from("family_members").insert({
    household_id: householdId,
    name,
    kind: str(formData, "kind") === "child" ? "child" : "adult",
    portion_factor: factor,
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
  const { error } = await supabase.from("family_members").update({ portion_factor: factor }).eq("id", id);
  if (error) fail("/settings", error.message);
  revalidatePath("/", "layout");
}

export async function addStore(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const name = str(formData, "name");
  if (!name) fail("/settings", "Вкажіть назву магазину");
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
  if (error) fail("/settings", error.message);
  revalidatePath("/settings");
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
