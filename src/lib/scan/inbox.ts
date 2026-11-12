// Черга вхідних сканів. Клієнт Supabase передається параметром, тож тим самим
// користується і веб, і бот. Канал — лише рядок у записі, не гілка логіки.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScanInputType, ScanStatus } from "../db-types.ts";
import type { ScanItem, ScanMode } from "../scan-types.ts";
import { isScanInputType, isScanStatus, parseScanItems } from "./present.ts";

export type InboxScan = {
  id: string;
  channel: string;
  inputType: ScanInputType;
  status: ScanStatus;
  mode: ScanMode;
  storeName: string | null;
  total: number | null;
  items: ScanItem[];
  createdAt: string;
};

export type InboxFail = { ok: false; error: string };

export type CreateScanInput = {
  householdId: string;
  sentBy: string;
  channel: string;
  inputType: ScanInputType;
  mode: ScanMode;
  storeName: string | null;
  total: number | null;
  items: ScanItem[];
  channelData?: unknown;
};

type ScanRow = {
  id: string;
  channel: string;
  input_type: string;
  status: string;
  mode: string;
  store_name: string | null;
  total: number | string | null;
  items: unknown;
  created_at: string;
};

function fail(error: { message: string } | null, fallback: string): InboxFail | null {
  if (!error) return null;
  return { ok: false, error: error.message || fallback };
}

function asTotal(value: number | string | null): number | null {
  if (value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function toInboxScan(row: ScanRow): InboxScan {
  return {
    id: row.id,
    channel: row.channel,
    inputType: isScanInputType(row.input_type) ? row.input_type : "text",
    status: isScanStatus(row.status) ? row.status : "pending",
    mode: row.mode === "set" ? "set" : "add",
    storeName: row.store_name?.trim() || null,
    total: asTotal(row.total),
    items: parseScanItems(row.items),
    createdAt: row.created_at,
  };
}

export async function createIncomingScan(
  supabase: SupabaseClient,
  input: CreateScanInput,
): Promise<{ ok: true; id: string } | InboxFail> {
  const { data, error } = await supabase
    .from("incoming_scans")
    .insert({
      household_id: input.householdId,
      sent_by: input.sentBy,
      channel: input.channel,
      input_type: input.inputType,
      status: "pending",
      mode: input.mode,
      store_name: input.storeName,
      total: input.total,
      items: input.items,
      channel_data: input.channelData ?? null,
    })
    .select("id")
    .single();
  const failed = fail(error, "Не вдалося додати скан у чергу");
  if (failed) return failed;
  const id = (data as { id?: string } | null)?.id;
  if (!id) return { ok: false, error: "Не вдалося додати скан у чергу" };
  return { ok: true, id };
}

export async function listIncomingScans(
  supabase: SupabaseClient,
  householdId?: string,
): Promise<{ ok: true; scans: InboxScan[] } | InboxFail> {
  let query = supabase
    .from("incoming_scans")
    .select("id, channel, input_type, status, mode, store_name, total, items, created_at")
    .order("created_at", { ascending: false })
    .limit(40);
  if (householdId) query = query.eq("household_id", householdId);
  const { data, error } = await query;
  const failed = fail(error, "Не вдалося прочитати чергу");
  if (failed) return failed;
  return { ok: true, scans: ((data ?? []) as ScanRow[]).map(toInboxScan) };
}

export type ScanPatch = {
  items?: ScanItem[];
  mode?: ScanMode;
  storeName?: string | null;
  total?: number | null;
};

export async function updateIncomingScan(
  supabase: SupabaseClient,
  scanId: string,
  patch: ScanPatch,
): Promise<{ ok: true } | InboxFail> {
  const row: Record<string, unknown> = {};
  if (patch.items) row.items = patch.items;
  if (patch.mode) row.mode = patch.mode;
  if (patch.storeName !== undefined) row.store_name = patch.storeName;
  if (patch.total !== undefined) row.total = patch.total;
  const { data, error } = await supabase
    .from("incoming_scans")
    .update(row)
    .eq("id", scanId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  const failed = fail(error, "Не вдалося оновити скан");
  if (failed) return failed;
  if (!data) return { ok: false, error: "Скан уже оброблено або його немає" };
  return { ok: true };
}

function explainConfirm(message: string): string {
  if (message.includes("not pending")) return "Цей скан уже оброблено";
  if (message.includes("access denied")) return "Немає доступу до цього скану";
  return message;
}

/** Одна атомарна операція бази: confirm_scan. */
export async function confirmIncomingScan(supabase: SupabaseClient, scanId: string): Promise<{ ok: true } | InboxFail> {
  const { error } = await supabase.rpc("confirm_scan", { p_scan_id: scanId });
  if (error) return { ok: false, error: explainConfirm(error.message) };
  return { ok: true };
}

export async function rejectIncomingScan(supabase: SupabaseClient, scanId: string): Promise<{ ok: true } | InboxFail> {
  const { data, error } = await supabase
    .from("incoming_scans")
    .update({ status: "rejected" })
    .eq("id", scanId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  const failed = fail(error, "Не вдалося відхилити скан");
  if (failed) return failed;
  if (!data) return { ok: false, error: "Скан уже оброблено або його немає" };
  return { ok: true };
}
