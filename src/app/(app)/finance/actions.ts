"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { todayISO } from "@/lib/dates";
import { financePath, isIsoDate, parseMoney, parsePeriod } from "@/lib/finance";
import { maybeSendPaceAlert } from "@/lib/channels/notify";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TOTAL = 99_999_999.99;

function returnPath(formData: FormData): string {
  const parsed = parsePeriod(String(formData.get("range") ?? ""), String(formData.get("at") ?? ""), todayISO());
  return financePath(parsed.kind, parsed.anchor);
}

function fail(path: string, message: string): never {
  redirect(`${path}&error=${encodeURIComponent(message)}`);
}

function done(path: string, message: string): never {
  revalidatePath("/finance");
  redirect(`${path}&info=${encodeURIComponent(message)}`);
}

export async function createReceipt(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const back = returnPath(formData);
  const storeName = String(formData.get("store_name") ?? "").trim().replace(/\s+/g, " ");
  const purchasedAt = String(formData.get("purchased_at") ?? "").trim();
  const total = parseMoney(String(formData.get("total") ?? ""));
  if (!storeName || storeName.length > 200) fail(back, "Вкажіть магазин");
  if (!isIsoDate(purchasedAt)) fail(back, "Вкажіть дату чека");
  if (total === null || total > MAX_TOTAL) fail(back, "Вкажіть суму чека");

  const { error } = await supabase.from("receipts").insert({
    household_id: householdId,
    store_name: storeName,
    purchased_at: purchasedAt,
    total,
    input_source: "manual",
  });
  if (error) fail(back, "Не вдалося записати чек. Спробуйте ще раз.");

  try {
    await maybeSendPaceAlert(supabase, householdId, todayISO());
  } catch (err) {
    console.error("maybeSendPaceAlert in createReceipt failed", err);
  }

  const next = parsePeriod(String(formData.get("range") ?? ""), purchasedAt, todayISO());
  done(financePath(next.kind, next.anchor), "Чек записано");
}

export async function deleteReceipt(formData: FormData) {
  const { supabase, householdId } = await getContext();
  const back = returnPath(formData);
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) fail(back, "Чек не знайдено");

  const { data, error } = await supabase
    .from("receipts")
    .delete()
    .eq("id", id)
    .eq("household_id", householdId)
    .select("id");
  if (error) fail(back, "Не вдалося видалити чек. Спробуйте ще раз.");
  if (!data?.length) fail(back, "Чек не знайдено");
  revalidatePath(`/finance/${id}`);
  done(back, "Чек видалено");
}
