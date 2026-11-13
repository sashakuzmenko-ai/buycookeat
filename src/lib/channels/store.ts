import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { todayISO, weekStart } from "../dates.ts";
import { formatQty, manualShoppingRow } from "../shopping.ts";
import { calculateScalePercent, formatExpiryNote, isExpiringSoon, isLowStock } from "../pantry.ts";
import type { ScanItem } from "../scan-types.ts";
import { parseScanItems } from "../scan/present.ts";
import { decideChannelAccess, rowsForGrant, scopedHousehold, type AccessDecision } from "./access.ts";
import { decideRedeem, normalizeLinkCode, type RedeemRefusal } from "./bind.ts";

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function loadGrant(supabase: SupabaseClient, chatId: string): Promise<AccessDecision> {
  const { data } = await supabase
    .from("channel_bindings")
    .select("household_id, user_id, linked_at")
    .eq("channel", "telegram")
    .eq("external_id", chatId)
    .not("linked_at", "is", null)
    .maybeSingle();
  if (!data?.linked_at) return decideChannelAccess({ binding: null, member: false, targetHouseholdId: null });
  const binding = {
    householdId: String(data.household_id),
    userId: String(data.user_id),
    linkedAt: String(data.linked_at),
  };
  const { data: member } = await supabase
    .from("household_users")
    .select("household_id")
    .eq("household_id", binding.householdId)
    .eq("user_id", binding.userId)
    .maybeSingle();
  const memberHousehold = member ? String(member.household_id) : null;
  return decideChannelAccess({
    binding,
    member: memberHousehold === binding.householdId,
    targetHouseholdId: binding.householdId,
  });
}

export async function redeemLink(
  supabase: SupabaseClient,
  input: { code: string; chatId: string; chatType?: string | null; chatTitle?: string | null },
): Promise<{ ok: true } | { ok: false; reason: RedeemRefusal }> {
  const code = normalizeLinkCode(input.code);
  if (code.length < 8) return { ok: false, reason: "missing" };
  const { data } = await supabase
    .from("channel_bindings")
    .select("id, household_id, user_id, link_code_expires_at, linked_at")
    .eq("channel", "telegram")
    .eq("link_code", code)
    .maybeSingle();
  const row = data
    ? {
        id: String(data.id),
        householdId: String(data.household_id),
        userId: String(data.user_id),
        expiresAt: data.link_code_expires_at ? String(data.link_code_expires_at) : null,
        linkedAt: data.linked_at ? String(data.linked_at) : null,
      }
    : null;
  const { data: member } = row
    ? await supabase
        .from("household_users")
        .select("user_id")
        .eq("household_id", row.householdId)
        .eq("user_id", row.userId)
        .maybeSingle()
    : { data: null };
  const { data: taken } = await supabase
    .from("channel_bindings")
    .select("household_id")
    .eq("channel", "telegram")
    .eq("external_id", input.chatId)
    .maybeSingle();
  const decision = decideRedeem({
    row,
    nowMs: Date.now(),
    member: Boolean(member),
    chatOwnerHouseholdId: taken?.household_id ? String(taken.household_id) : null,
  });
  if (!decision.ok || !row) return decision.ok ? { ok: false, reason: "missing" } : decision;

  const { data: updated, error } = await supabase
    .from("channel_bindings")
    .update({
      external_id: input.chatId,
      linked_at: new Date().toISOString(),
      link_code: null,
      link_code_expires_at: null,
      chat_type: input.chatType ?? null,
      title: input.chatTitle ?? null,
    })
    .eq("id", row.id)
    .eq("household_id", row.householdId)
    .eq("link_code", code)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, reason: error.code === "23505" ? "chat_taken" : "missing" };
  if (!updated) return { ok: false, reason: "missing" };
  return { ok: true };
}

export async function loadProducts(supabase: SupabaseClient, decision: AccessDecision) {
  const householdId = scopedHousehold(decision, null);
  if (!householdId) return [];
  const { data, error } = await supabase.from("products").select("id, name, unit, household_id").eq("household_id", householdId);
  if (error || !data) return [];
  return rowsForGrant(
    decision,
    data.map((row) => ({
      householdId: String(row.household_id),
      id: String(row.id),
      name: String(row.name ?? ""),
      unit: String(row.unit ?? "шт"),
    })),
  ).map(({ id, name, unit }) => ({ id, name, unit }));
}

export async function readDinner(supabase: SupabaseClient, decision: AccessDecision): Promise<string[]> {
  const householdId = scopedHousehold(decision, null);
  if (!householdId) return [];
  const { data, error } = await supabase
    .from("meal_plan_entries")
    .select("household_id, title, recipes(title)")
    .eq("household_id", householdId)
    .eq("plan_date", todayISO())
    .eq("meal_type", "dinner");
  if (error || !data) return [];
  return rowsForGrant(
    decision,
    data.map((row) => {
      const recipe = one(row.recipes as { title?: string } | { title?: string }[] | null);
      const title = String(recipe?.title ?? row.title ?? "").trim();
      return { householdId: String(row.household_id), title };
    }),
  )
    .map((row) => row.title)
    .filter(Boolean);
}

export async function readShopping(supabase: SupabaseClient, decision: AccessDecision) {
  const householdId = scopedHousehold(decision, null);
  if (!householdId) return [];
  const { data, error } = await supabase
    .from("shopping_list_items")
    .select("household_id, title, checked, products(name)")
    .eq("household_id", householdId)
    .eq("week_start", weekStart(todayISO()))
    .order("created_at");
  if (error || !data) return [];
  return rowsForGrant(
    decision,
    data.map((row) => {
      const product = one(row.products as { name?: string } | { name?: string }[] | null);
      return {
        householdId: String(row.household_id),
        name: String(product?.name ?? row.title ?? "").trim(),
        checked: Boolean(row.checked),
      };
    }),
  ).filter((row) => row.name);
}

export async function readLowStock(supabase: SupabaseClient, decision: AccessDecision) {
  const householdId = scopedHousehold(decision, null);
  if (!householdId) return [];
  const { data, error } = await supabase
    .from("pantry_items")
    .select("household_id, quantity, expires_at, products(name, unit)")
    .eq("household_id", householdId);
  if (error || !data) return [];
  const tagged = data.flatMap((row) => {
    const product = one(row.products as { name?: string; unit?: string } | { name?: string; unit?: string }[] | null);
    const name = String(product?.name ?? "").trim();
    const unit = String(product?.unit ?? "шт");
    const quantity = Number(row.quantity);
    if (!name || !Number.isFinite(quantity)) return [];
    const expiring = isExpiringSoon(row.expires_at ? String(row.expires_at) : null);
    const low = isLowStock(calculateScalePercent(quantity, unit));
    if (!low && !expiring) return [];
    const expiry = formatExpiryNote(row.expires_at ? String(row.expires_at) : null);
    const detail = [formatQty(quantity, unit), expiry].filter(Boolean).join(", ");
    return [{ householdId: String(row.household_id), name, detail }];
  });
  return rowsForGrant(decision, tagged);
}

export async function loadOwnedItems(
  supabase: SupabaseClient,
  decision: AccessDecision,
  scanId: string,
): Promise<ScanItem[] | null> {
  const householdId = scopedHousehold(decision, null);
  if (!householdId) return null;
  const { data, error } = await supabase
    .from("incoming_scans")
    .select("household_id, items")
    .eq("id", scanId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (error || !data) return null;
  const owned = rowsForGrant(decision, [{ householdId: String(data.household_id), items: data.items }]);
  if (!owned.length) return null;
  return parseScanItems(owned[0].items);
}

export async function addScanToShopping(
  supabase: SupabaseClient,
  decision: AccessDecision,
  items: readonly ScanItem[],
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const householdId = scopedHousehold(decision, null);
  if (!householdId) return { ok: false, error: "Немає доступу" };
  const lines = items.filter((item) => item.name.trim() && item.quantity > 0);
  if (!lines.length) return { ok: false, error: "Немає позицій для списку" };
  const week = weekStart(todayISO());
  const { error } = await supabase.from("shopping_list_items").insert(
    lines.map((item) =>
      manualShoppingRow({
        householdId,
        weekStart: week,
        title: item.name.trim(),
        productId: item.productId,
        quantity: item.quantity,
        unit: item.unit,
      }),
    ),
  );
  if (error) return { ok: false, error: "Не вдалося додати до списку покупок" };
  return { ok: true, count: lines.length };
}
