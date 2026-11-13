"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { parseWeekParam, weekDays } from "@/lib/dates";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MEAL_TYPES = new Set(["breakfast", "lunch", "dinner"]);

function menuPath(formData: FormData): string {
  const week = parseWeekParam(String(formData.get("week") ?? ""));
  const day = String(formData.get("day") ?? "");
  const dayQuery = DAY.test(day) ? `&day=${day}` : "";
  return `/menu?week=${week}${dayQuery}`;
}

function fail(path: string, message: string): never {
  redirect(`${path}&error=${encodeURIComponent(message)}`);
}

/** Замінює рецепт неприготованої страви. Приготовану не чіпає — продукти вже списані. */
export async function replacePlanEntry(formData: FormData) {
  const { supabase } = await getContext();
  const path = menuPath(formData);
  const id = String(formData.get("id") ?? "");
  const recipeId = String(formData.get("recipe_id") ?? "");
  if (!UUID.test(id) || !UUID.test(recipeId)) fail(path, "Оберіть страву");

  const { data, error } = await supabase
    .from("meal_plan_entries")
    .update({ recipe_id: recipeId, title: null })
    .eq("id", id)
    .is("cooked_at", null)
    .select("id");
  if (error) fail(path, error.message);
  if (!data?.length) fail(path, "Страву вже приготовано або не знайдено");
  revalidatePath("/menu");
}

/** Переносить неприготовану страву в інший день або слот прийому їжі. */
export async function movePlanEntry(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const path = menuPath(formData);
  const id = String(formData.get("id") ?? "");
  const week = parseWeekParam(String(formData.get("week") ?? ""));
  const day = String(formData.get("day") ?? "");
  const mealTypeRaw = formData.get("meal_type");
  const mealType = mealTypeRaw != null && mealTypeRaw !== "" ? String(mealTypeRaw) : null;

  if (!UUID.test(id)) fail(path, "Оберіть страву");
  const days = weekDays(week);
  if (!DAY.test(day) || !days.includes(day)) fail(path, "Оберіть день з обраного тижня");
  if (mealType && !MEAL_TYPES.has(mealType)) fail(path, "Некоректний прийом їжі");

  const { data: currentEntry, error: currentError } = await supabase
    .from("meal_plan_entries")
    .select("id, plan_date, meal_type, cooked_at")
    .eq("id", id)
    .eq("household_id", householdId)
    .maybeSingle();

  if (currentError) fail(path, currentError.message);
  if (!currentEntry || currentEntry.cooked_at != null) {
    fail(path, "Страву вже приготовано або не знайдено");
  }

  const targetMealType = mealType ?? currentEntry.meal_type;

  const { data: existing, error: checkError } = await supabase
    .from("meal_plan_entries")
    .select("id")
    .eq("household_id", householdId)
    .eq("plan_date", day)
    .eq("meal_type", targetMealType)
    .neq("id", id)
    .limit(1);

  if (checkError) fail(path, checkError.message);
  if (existing && existing.length > 0) {
    fail(path, "У цьому дні вже є страва на цей прийом — спершу приберіть її");
  }

  const { data, error } = await supabase
    .from("meal_plan_entries")
    .update({ plan_date: day, meal_type: targetMealType })
    .eq("id", id)
    .eq("household_id", householdId)
    .is("cooked_at", null)
    .select("id");

  if (error) fail(path, error.message);
  if (!data?.length) fail(path, "Страву вже приготовано або не знайдено");

  revalidatePath("/menu");
}
