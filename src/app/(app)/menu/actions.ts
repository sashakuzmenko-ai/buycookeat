"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { parseWeekParam } from "@/lib/dates";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

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
