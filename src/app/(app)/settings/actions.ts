"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { parseRestrictions, stepPortionFactor } from "@/lib/family";
import { createLinkCode, pendingExternalId } from "@/lib/channels/bind";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const num = (fd: FormData, key: string) => {
  const raw = str(fd, key).replace(/\s/g, "").replace(",", ".");
  return raw === "" ? NaN : Number(raw);
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOrNull = (v: string) => (UUID.test(v) ? v : null);

function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

/**
 * Додавання нового члена сім'ї.
 */
export async function addFamilyMember(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const name = str(formData, "name");
  const factor = num(formData, "portion_factor");

  if (!name) fail("/settings", "Вкажіть ім'я");
  if (!(factor > 0 && factor <= 3)) fail("/settings", "Порція має бути від 0,1 до 3");

  const kind = str(formData, "kind") === "child" ? "child" : "adult";
  const birthDate = str(formData, "birth_date") || null;
  const notes = str(formData, "notes") || null;
  const restrictions = parseRestrictions(str(formData, "restrictions"));

  const { error } = await supabase.from("family_members").insert({
    household_id: householdId,
    name,
    kind,
    birth_date: birthDate,
    portion_factor: factor,
    restrictions,
    notes,
  });

  if (error) fail("/settings", error.message);
  revalidatePath("/settings");
  revalidatePath("/menu");
  revalidatePath("/shopping");
  revalidatePath("/", "layout");
}

/**
 * Оновлення даних члена сім'ї.
 */
export async function updateFamilyMember(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const id = uuidOrNull(str(formData, "id"));
  if (!id) fail("/settings", "Некоректний ідентифікатор");

  const name = str(formData, "name");
  const factor = num(formData, "portion_factor");

  if (!name) fail("/settings", "Вкажіть ім'я");
  if (!(factor > 0 && factor <= 3)) fail("/settings", "Порція має бути від 0,1 до 3");

  const kind = str(formData, "kind") === "child" ? "child" : "adult";
  const birthDate = str(formData, "birth_date") || null;
  const notes = str(formData, "notes") || null;
  const restrictions = parseRestrictions(str(formData, "restrictions"));

  const { error } = await supabase
    .from("family_members")
    .update({
      name,
      kind,
      birth_date: birthDate,
      portion_factor: factor,
      restrictions,
      notes,
    })
    .eq("id", id)
    .eq("household_id", householdId);

  if (error) fail("/settings", error.message);
  revalidatePath("/settings");
  revalidatePath("/menu");
  revalidatePath("/shopping");
  revalidatePath("/", "layout");
}

/**
 * Видалення члена сім'ї.
 */
export async function deleteFamilyMember(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const id = uuidOrNull(str(formData, "id"));
  if (!id) return;

  const { error } = await supabase
    .from("family_members")
    .delete()
    .eq("id", id)
    .eq("household_id", householdId);

  if (error) fail("/settings", error.message);
  revalidatePath("/settings");
  revalidatePath("/menu");
  revalidatePath("/shopping");
  revalidatePath("/", "layout");
}

/**
 * Швидка зміна коефіцієнта порції кроком 0,1 через кнопки − / +.
 */
export async function adjustPortionFactor(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const id = uuidOrNull(str(formData, "id"));
  const direction = str(formData, "direction") === "inc" ? "inc" : "dec";
  if (!id) return;

  const { data: member, error: fetchError } = await supabase
    .from("family_members")
    .select("portion_factor")
    .eq("id", id)
    .eq("household_id", householdId)
    .single();

  if (fetchError || !member) return;

  const current = Number(member.portion_factor);
  const next = stepPortionFactor(current, direction);

  const { error } = await supabase
    .from("family_members")
    .update({ portion_factor: next })
    .eq("id", id)
    .eq("household_id", householdId);

  if (error) fail("/settings", error.message);
  revalidatePath("/settings");
  revalidatePath("/menu");
  revalidatePath("/shopping");
  revalidatePath("/", "layout");
}

/**
 * Оновлення місячного бюджету на їжу в таблиці households.
 */
export async function updateMonthlyBudget(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const rawBudget = str(formData, "monthly_budget").replace(/\s/g, "").replace(",", ".");
  const budget = rawBudget === "" ? null : Number(rawBudget);

  if (budget !== null && (isNaN(budget) || budget < 0)) {
    fail("/settings", "Вкажіть коректну невід'ємну суму бюджету");
  }

  const { error } = await supabase
    .from("households")
    .update({ monthly_budget: budget })
    .eq("id", householdId);

  if (error) fail("/settings", error.message);
  revalidatePath("/settings");
  revalidatePath("/finance");
  revalidatePath("/", "layout");
}

/**
 * Перемикання наявності техніки (чип увімк./вимк.).
 */
export async function toggleEquipment(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const name = str(formData, "name");
  if (!name) fail("/settings", "Вкажіть назву техніки");

  const { data: existing } = await supabase
    .from("equipment")
    .select("id")
    .eq("household_id", householdId)
    .eq("name", name)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("equipment")
      .delete()
      .eq("id", existing.id);
    if (error) fail("/settings", error.message);
  } else {
    const { error } = await supabase
      .from("equipment")
      .insert({ household_id: householdId, name });
    if (error && error.code !== "23505") fail("/settings", error.message);
  }

  revalidatePath("/settings");
  revalidatePath("/recipes");
}

/**
 * Додавання техніки за назвою.
 */
export async function addEquipment(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const name = str(formData, "name");
  if (!name) fail("/settings", "Вкажіть назву техніки");

  const { error } = await supabase
    .from("equipment")
    .insert({ household_id: householdId, name });

  if (error) {
    fail("/settings", error.code === "23505" ? `«${name}» вже є в списку` : error.message);
  }

  revalidatePath("/settings");
  revalidatePath("/recipes");
}

/**
 * Видалення техніки за id.
 */
export async function deleteEquipment(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const id = uuidOrNull(str(formData, "id"));
  if (!id) return;

  const { error } = await supabase
    .from("equipment")
    .delete()
    .eq("id", id)
    .eq("household_id", householdId);

  if (error) fail("/settings", error.message);
  revalidatePath("/settings");
  revalidatePath("/recipes");
}

export async function createTelegramLink() {
  const { supabase, householdId, user } = await getContext();
  const nowIso = new Date().toISOString();
  const { error: cleanupError } = await supabase
    .from("channel_bindings")
    .delete()
    .eq("household_id", householdId)
    .eq("user_id", user.id)
    .eq("channel", "telegram")
    .is("linked_at", null)
    .lt("link_code_expires_at", nowIso);
  if (cleanupError) fail("/settings", cleanupError.message);

  const { code, expiresAt } = createLinkCode();
  const { error } = await supabase.from("channel_bindings").insert({
    household_id: householdId,
    user_id: user.id,
    channel: "telegram",
    external_id: pendingExternalId(user.id, code),
    link_code: code,
    link_code_expires_at: expiresAt,
    linked_at: null,
  });
  if (error) fail("/settings", error.message);
  revalidatePath("/settings");
  revalidatePath("/scan");
}

export async function unlinkTelegram(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const id = uuidOrNull(str(formData, "id"));
  if (!id) fail("/settings", "Некоректний ідентифікатор");

  const { error } = await supabase
    .from("channel_bindings")
    .delete()
    .eq("id", id)
    .eq("household_id", householdId)
    .eq("channel", "telegram");
  if (error) fail("/settings", error.message);
  revalidatePath("/settings");
  revalidatePath("/scan");
}
