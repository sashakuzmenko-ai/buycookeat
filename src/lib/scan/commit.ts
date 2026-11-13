// Підтвердження скану: зіставлення продуктів і confirm_scan.
// Клієнт Supabase передається параметром — і сесія застосунку, і сервер бота.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScanItem, ScanMode } from "../scan-types.ts";
import { confirmIncomingScan, updateIncomingScan } from "./inbox.ts";
import { chooseProduct, cleanCategory, cleanUnit, productKey, roundScanQty } from "./products.ts";
import { parseScanItems } from "./present.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CatalogRow = { id: string; name: string; unit: string; category: string };

async function loadCatalog(supabase: SupabaseClient, householdId: string) {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, unit, category")
    .eq("household_id", householdId);
  if (error) return { error: error.message };
  return { rows: (data ?? []) as CatalogRow[] };
}

async function createProduct(
  supabase: SupabaseClient,
  householdId: string,
  choice: { name: string; category: string; unit: string },
) {
  const { data, error } = await supabase
    .from("products")
    .insert({ household_id: householdId, name: choice.name, category: choice.category, unit: choice.unit })
    .select("id")
    .single();
  if (error || !data) return { error: `Не вдалося створити «${choice.name}»: ${error?.message ?? "невідома помилка"}` };
  return { id: data.id as string };
}

/** Ставить productId: наявний продукт, збіг за назвою або новий запис у довіднику. */
export async function resolveScanItems(
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

export type CommittedScan = {
  ok: true;
  items: ScanItem[];
  mode: ScanMode;
  total: number | null;
};

/** householdId має бути з сесії або з перевіреної прив'язки, не з тексту повідомлення. */
export async function commitPendingScan(
  supabase: SupabaseClient,
  householdId: string,
  scanId: string,
  mode?: ScanMode,
): Promise<CommittedScan | { ok: false; error: string }> {
  if (!UUID.test(scanId) || !UUID.test(householdId)) return { ok: false, error: "Некоректний скан" };
  const { data, error } = await supabase
    .from("incoming_scans")
    .select("id, status, mode, total, items")
    .eq("id", scanId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Скан не знайдено" };
  if (data.status !== "pending") return { ok: false, error: "Цей скан уже оброблено" };

  const nextMode: ScanMode = mode ?? (data.mode === "set" ? "set" : "add");
  if (mode) {
    const savedMode = await updateIncomingScan(supabase, scanId, { mode }, householdId);
    if (!savedMode.ok) return savedMode;
  }

  const resolved = await resolveScanItems(supabase, householdId, parseScanItems(data.items));
  if ("error" in resolved) return { ok: false, error: resolved.error };
  if (!resolved.items.length) return { ok: false, error: "Немає позицій для запису" };

  const saved = await updateIncomingScan(supabase, scanId, { items: resolved.items }, householdId);
  if (!saved.ok) return saved;
  const confirmed = await confirmIncomingScan(supabase, scanId);
  if (!confirmed.ok) return confirmed;
  const total = data.total === null || data.total === "" ? null : Number(data.total);
  return {
    ok: true,
    items: resolved.items,
    mode: nextMode,
    total: Number.isFinite(total) ? total : null,
  };
}
