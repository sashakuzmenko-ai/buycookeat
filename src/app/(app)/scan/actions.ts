"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getContext } from "@/lib/context";
import { rejectIncomingScan, updateIncomingScan } from "@/lib/scan/inbox";
import { commitPendingScan, resolveScanItems } from "@/lib/scan/commit";
import { cleanCategory, cleanUnit, roundScanQty } from "@/lib/scan/products";
import { parseScanItems } from "@/lib/scan/present";
import type { ScanItem, ScanMode } from "@/lib/scan-types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ScanActionResult = { error: string | null; items?: ScanItem[] };

function refreshScan() {
  revalidatePath("/scan");
}

function refreshConfirmed() {
  revalidatePath("/scan");
  revalidatePath("/pantry");
  revalidatePath("/finance");
  revalidatePath("/products");
}

async function loadPending(supabase: SupabaseClient, scanId: string, householdId: string) {
  if (!UUID.test(scanId)) return { error: "Некоректний скан" as const };
  const { data, error } = await supabase
    .from("incoming_scans")
    .select("id, status, items")
    .eq("id", scanId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Скан не знайдено" };
  if (data.status !== "pending") return { error: "Цей скан уже оброблено" };
  return { items: parseScanItems(data.items) };
}

export async function saveScanMode(scanId: string, mode: ScanMode): Promise<ScanActionResult> {
  const { supabase, householdId } = await getContext();
  if (!UUID.test(scanId)) return { error: "Некоректний скан" };
  if (mode !== "add" && mode !== "set") return { error: "Некоректний режим" };
  const saved = await updateIncomingScan(supabase, scanId, { mode }, householdId);
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
  const loaded = await loadPending(supabase, scanId, householdId);
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
  const resolved = await resolveScanItems(supabase, householdId, [draft]);
  if ("error" in resolved) return { error: resolved.error ?? "Не вдалося зберегти позицію" };
  if (!resolved.items || resolved.items.length !== 1) return { error: "Оберіть продукт або вкажіть назву" };

  const next = items.slice();
  next[index] = resolved.items[0];
  const saved = await updateIncomingScan(supabase, scanId, { items: next }, householdId);
  if (!saved.ok) return { error: saved.error };
  revalidatePath("/scan");
  revalidatePath("/products");
  return { error: null, items: next };
}

export async function confirmScan(scanId: string): Promise<ScanActionResult> {
  const { supabase, householdId } = await getContext();
  const committed = await commitPendingScan(supabase, householdId, scanId);
  if (!committed.ok) return { error: committed.error };
  refreshConfirmed();
  return { error: null, items: committed.items };
}

export async function rejectScan(scanId: string): Promise<ScanActionResult> {
  const { supabase } = await getContext();
  if (!UUID.test(scanId)) return { error: "Некоректний скан" };
  const rejected = await rejectIncomingScan(supabase, scanId);
  if (!rejected.ok) return { error: rejected.error };
  refreshScan();
  return { error: null };
}
