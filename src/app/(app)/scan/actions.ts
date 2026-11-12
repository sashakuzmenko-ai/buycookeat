"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getContext } from "@/lib/context";
import { confirmIncomingScan, rejectIncomingScan, updateIncomingScan } from "@/lib/scan/inbox";
import { chooseProduct, cleanCategory, cleanUnit, productKey, roundScanQty } from "@/lib/scan/products";
import { parseScanItems } from "@/lib/scan/present";
import type { ScanItem, ScanMode } from "@/lib/scan-types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ScanActionResult = { error: string | null; items?: ScanItem[] };

type CatalogRow = { id: string; name: string; unit: string; category: string };

function refreshScan() {
  revalidatePath("/scan");
}

function refreshConfirmed() {
  revalidatePath("/scan");
  revalidatePath("/pantry");
  revalidatePath("/finance");
  revalidatePath("/products");
}

async function loadPending(supabase: SupabaseClient, scanId: string) {
  if (!UUID.test(scanId)) return { error: "Некоректний скан" as const };
  const { data, error } = await supabase.from("incoming_scans").select("id, status, items").eq("id", scanId).maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Скан не знайдено" };
  if (data.status !== "pending") return { error: "Цей скан уже оброблено" };
  return { items: parseScanItems(data.items) };
}

async function loadCatalog(supabase: SupabaseClient, householdId: string) {
  const { data, error } = await supabase.from("products").select("id, name, unit, category").eq("household_id", householdId);
  if (error) return { error: error.message };
  return { rows: (data ?? []) as CatalogRow[] };
}

async function createProduct(supabase: SupabaseClient, householdId: string, choice: { name: string; category: string; unit: string }) {
  const { data, error } = await supabase
    .from("products")
    .insert({ household_id: householdId, name: choice.name, category: choice.category, unit: choice.unit })
    .select("id")
    .single();
  if (error || !data) return { error: `Не вдалося створити «${choice.name}»: ${error?.message ?? "невідома помилка"}` };
  return { id: data.id as string };
}

/** Ставить productId: наявний продукт, збіг за назвою або новий запис у довіднику. */
async function resolveItems(
  supabase: SupabaseClient,
  householdId: string,
  items: ScanItem[],
): Promise<{ error: string } | { items: ScanItem[] }> {
  const loaded = await loadCatalog(supabase, householdId);
  if ("error" in loaded && !("rows" in loaded)) return { error: loaded.error ?? "Не вдалося прочитати продукти" };
  const rows = loaded.rows ?? [];
  const byId = new Set(rows.map((row) => row.id));
  const byName = new Map(rows.map((row) => [productKey(row.name), row.id]));
  const names = new Map(rows.map((row) => [row.id, row.name]));
  const next: ScanItem[] = [];

  for (const item of items) {
    if (!(item.quantity > 0)) continue;
    const choice = chooseProduct(item, byId, byName);
    if (choice.kind === "skip") continue;
    if (choice.kind === "existing") {
      next.push({
        ...item,
        productId: choice.productId,
        name: names.get(choice.productId) ?? item.name,
        unit: cleanUnit(item.unit),
        category: cleanCategory(item.category),
        quantity: roundScanQty(item.quantity),
      });
      continue;
    }
    const created = await createProduct(supabase, householdId, choice);
    if ("error" in created) return { error: created.error ?? "Не вдалося створити продукт" };
    byId.add(created.id);
    byName.set(productKey(choice.name), created.id);
    names.set(created.id, choice.name);
    next.push({
      ...item,
      productId: created.id,
      name: choice.name,
      category: choice.category,
      unit: choice.unit,
      quantity: roundScanQty(item.quantity),
    });
  }
  return { items: next };
}

export async function saveScanMode(scanId: string, mode: ScanMode): Promise<ScanActionResult> {
  const { supabase } = await getContext();
  if (!UUID.test(scanId)) return { error: "Некоректний скан" };
  if (mode !== "add" && mode !== "set") return { error: "Некоректний режим" };
  const saved = await updateIncomingScan(supabase, scanId, { mode });
  if (!saved.ok) return { error: saved.error };
  refreshScan();
  return { error: null };
}

export async function clarifyScanItem(
  scanId: string,
  index: number,
  input: { productId: string | null; name: string; category: string; unit: string; quantity: number },
): Promise<ScanActionResult> {
  const { supabase, householdId } = await getContext();
  const loaded = await loadPending(supabase, scanId);
  if ("error" in loaded && !("items" in loaded)) return { error: loaded.error ?? "Скан не знайдено" };
  const items = loaded.items ?? [];
  if (!Number.isInteger(index) || index < 0 || index >= items.length) return { error: "Позицію не знайдено" };
  if (!(input.quantity > 0) || !Number.isFinite(input.quantity)) return { error: "Вкажіть кількість більше нуля" };

  const draft: ScanItem = {
    ...items[index],
    productId: input.productId,
    name: input.name,
    category: cleanCategory(input.category),
    unit: cleanUnit(input.unit),
    quantity: roundScanQty(input.quantity),
    uncertain: false,
  };
  const resolved = await resolveItems(supabase, householdId, [draft]);
  if ("error" in resolved) return { error: resolved.error ?? "Не вдалося зберегти позицію" };
  if (!resolved.items || resolved.items.length !== 1) return { error: "Оберіть продукт або вкажіть назву" };

  const next = items.slice();
  next[index] = resolved.items[0];
  const saved = await updateIncomingScan(supabase, scanId, { items: next });
  if (!saved.ok) return { error: saved.error };
  revalidatePath("/scan");
  revalidatePath("/products");
  return { error: null, items: next };
}

export async function confirmScan(scanId: string): Promise<ScanActionResult> {
  const { supabase, householdId } = await getContext();
  const loaded = await loadPending(supabase, scanId);
  if ("error" in loaded && !("items" in loaded)) return { error: loaded.error ?? "Скан не знайдено" };
  const resolved = await resolveItems(supabase, householdId, loaded.items ?? []);
  if ("error" in resolved) return { error: resolved.error ?? "Не вдалося підготувати позиції" };
  if (!resolved.items?.length) return { error: "Немає позицій для запису" };

  const saved = await updateIncomingScan(supabase, scanId, { items: resolved.items });
  if (!saved.ok) return { error: saved.error };
  const confirmed = await confirmIncomingScan(supabase, scanId);
  if (!confirmed.ok) return { error: confirmed.error };
  refreshConfirmed();
  return { error: null, items: resolved.items };
}

export async function rejectScan(scanId: string): Promise<ScanActionResult> {
  const { supabase } = await getContext();
  if (!UUID.test(scanId)) return { error: "Некоректний скан" };
  const rejected = await rejectIncomingScan(supabase, scanId);
  if (!rejected.ok) return { error: rejected.error };
  refreshScan();
  return { error: null };
}
