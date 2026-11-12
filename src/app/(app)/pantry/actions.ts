"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { type StorageZone } from "@/lib/pantry";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOrNull = (v: string) => (UUID.test(v) ? v : null);
const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const num = (fd: FormData, key: string) => {
  const raw = str(fd, key).replace(",", ".");
  return raw === "" ? NaN : Number(raw);
};

const VALID_ZONES: Set<string> = new Set(["fridge", "freezer", "pantry"]);
function parseZone(value: string): StorageZone {
  return VALID_ZONES.has(value) ? (value as StorageZone) : "pantry";
}

function parseDateOrNull(value: string): string | null {
  const s = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))) {
    return s;
  }
  return null;
}

function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

/**
 * Додає позицію на склад або збільшує кількість, якщо продукт уже є в запасах.
 * Пише запис у журнал руху pantry_movements (source: 'manual').
 */
export async function addPantryItem(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const productId = uuidOrNull(str(formData, "product_id"));
  const quantity = num(formData, "quantity");
  const storageZone = parseZone(str(formData, "storage_zone"));
  const expiresAt = parseDateOrNull(str(formData, "expires_at"));

  if (!productId) fail("/pantry", "Оберіть продукт");
  if (!(quantity > 0)) fail("/pantry", "Кількість має бути більше нуля");

  const { data: existing, error: findError } = await supabase
    .from("pantry_items")
    .select("id, quantity")
    .eq("household_id", householdId)
    .eq("product_id", productId)
    .maybeSingle();

  if (findError) fail("/pantry", findError.message);

  if (existing) {
    const oldQty = Number(existing.quantity);
    const newQty = oldQty + quantity;
    const { error: updateError } = await supabase
      .from("pantry_items")
      .update({
        quantity: newQty,
        storage_zone: storageZone,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (updateError) fail("/pantry", updateError.message);

    const { error: moveError } = await supabase.from("pantry_movements").insert({
      household_id: householdId,
      product_id: productId,
      delta: quantity,
      source: "manual",
    });
    if (moveError) console.error("Не вдалося записати рух:", moveError.message);
  } else {
    const { error: insertError } = await supabase.from("pantry_items").insert({
      household_id: householdId,
      product_id: productId,
      quantity,
      storage_zone: storageZone,
      expires_at: expiresAt,
    });

    if (insertError) fail("/pantry", insertError.message);

    const { error: moveError } = await supabase.from("pantry_movements").insert({
      household_id: householdId,
      product_id: productId,
      delta: quantity,
      source: "manual",
    });
    if (moveError) console.error("Не вдалося записати рух:", moveError.message);
  }

  revalidatePath("/pantry");
  redirect("/pantry");
}

/**
 * Оновлює позицію на складі: змінює кількість, зону або термін придатності.
 * При quantity === 0 видаляє позицію. Пише рух у журнал pantry_movements.
 */
export async function updatePantryItem(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const id = uuidOrNull(str(formData, "id"));
  const quantity = num(formData, "quantity");
  const storageZone = parseZone(str(formData, "storage_zone"));
  const expiresAt = parseDateOrNull(str(formData, "expires_at"));

  if (!id) fail("/pantry", "Не знайдено позицію для редагування");
  if (!(quantity >= 0)) fail("/pantry", "Вкажіть коректну кількість");

  const { data: existing, error: findError } = await supabase
    .from("pantry_items")
    .select("id, product_id, quantity")
    .eq("household_id", householdId)
    .eq("id", id)
    .maybeSingle();

  if (findError || !existing) fail("/pantry", findError?.message ?? "Позицію не знайдено");

  const oldQty = Number(existing.quantity);
  const delta = quantity - oldQty;

  if (quantity === 0) {
    const { error: delError } = await supabase.from("pantry_items").delete().eq("id", id);
    if (delError) fail("/pantry", delError.message);

    if (oldQty > 0) {
      await supabase.from("pantry_movements").insert({
        household_id: householdId,
        product_id: existing.product_id,
        delta: -oldQty,
        source: "manual",
      });
    }
  } else {
    const { error: updateError } = await supabase
      .from("pantry_items")
      .update({
        quantity,
        storage_zone: storageZone,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) fail("/pantry", updateError.message);

    if (delta !== 0) {
      await supabase.from("pantry_movements").insert({
        household_id: householdId,
        product_id: existing.product_id,
        delta,
        source: "manual",
      });
    }
  }

  revalidatePath("/pantry");
  redirect("/pantry");
}

/**
 * Видаляє позицію зі складу та фіксує списання в pantry_movements.
 */
export async function deletePantryItem(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const id = uuidOrNull(str(formData, "id"));

  if (!id) fail("/pantry", "Не знайдено позицію для видалення");

  const { data: existing, error: findError } = await supabase
    .from("pantry_items")
    .select("id, product_id, quantity")
    .eq("household_id", householdId)
    .eq("id", id)
    .maybeSingle();

  if (findError || !existing) {
    revalidatePath("/pantry");
    redirect("/pantry");
  }

  const oldQty = Number(existing.quantity);
  const { error: delError } = await supabase.from("pantry_items").delete().eq("id", id);
  if (delError) fail("/pantry", delError.message);

  if (oldQty > 0) {
    await supabase.from("pantry_movements").insert({
      household_id: householdId,
      product_id: existing.product_id,
      delta: -oldQty,
      source: "manual",
    });
  }

  revalidatePath("/pantry");
  redirect("/pantry");
}
