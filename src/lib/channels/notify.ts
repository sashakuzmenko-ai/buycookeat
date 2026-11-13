import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { clipMessage } from "./copy.ts";
import { createTelegramChannel } from "./telegram.ts";
import {
  amountOf,
  coerceNumber,
  daysInclusive,
  elapsedInRange,
  monthEnd,
  monthStart,
  paceAlertDecision,
  readBudget,
  sumBetween,
} from "../finance.ts";

export type TelegramHouseholdChat = {
  chatId: string;
  title: string;
};

export async function telegramChatsOfHousehold(
  supabase: SupabaseClient,
  householdId: string,
): Promise<TelegramHouseholdChat[]> {
  const { data, error } = await supabase
    .from("channel_bindings")
    .select("external_id, title")
    .eq("household_id", householdId)
    .eq("channel", "telegram")
    .not("linked_at", "is", null);
  if (error || !data) return [];
  return data
    .filter((row) => row.external_id)
    .map((row) => ({
      chatId: String(row.external_id),
      title: String(row.title ?? "").trim() || `Чат ${row.external_id}`,
    }));
}

export type HouseholdSendResult = {
  configured: boolean;
  chats: number;
  sent: number;
  failed: number;
};

export async function sendToHouseholdChats(
  supabase: SupabaseClient,
  householdId: string,
  text: string,
): Promise<HouseholdSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  if (!token.trim()) {
    return { configured: false, chats: 0, sent: 0, failed: 0 };
  }
  const chats = await telegramChatsOfHousehold(supabase, householdId);
  if (chats.length === 0) {
    return { configured: true, chats: 0, sent: 0, failed: 0 };
  }
  const channel = createTelegramChannel(token);
  const payload = clipMessage(text);
  let sent = 0;
  let failed = 0;
  for (const chat of chats) {
    const result = await channel.send({ chatId: chat.chatId, text: payload });
    if (result.ok) sent += 1;
    else failed += 1;
  }
  return { configured: true, chats: chats.length, sent, failed };
}

export type ShoppingListMessageGroup = {
  storeName: string;
  items: { name: string; quantity: string }[];
};

export function shoppingListMessage(groups: readonly ShoppingListMessageGroup[], weekLabel: string): string {
  // У повідомлення потрапляють лише некуплені позиції (відфільтровані до виклику).
  const nonEmpty = groups.filter((g) => g.items.length > 0);
  if (nonEmpty.length === 0) return "Список порожній";
  const lines: string[] = [`Список покупок · ${weekLabel}`, ""];
  for (const group of nonEmpty) {
    lines.push(group.storeName);
    for (const item of group.items) {
      lines.push(`• ${item.name} — ${item.quantity}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

type RawPaceReceipt = {
  id: string;
  purchased_at: string;
  total: unknown;
};

type RawPaceItem = {
  receipt_id: string;
  price: unknown;
};

/**
 * Перевіряє темп витрат домогосподарства і, якщо витрати перевищують план
 * і сьогодні попередження ще не надсилалося, відправляє повідомлення в Telegram-чати.
 * Помилки ловляться всередині й логуються в console.error.
 */
export async function maybeSendPaceAlert(
  supabase: SupabaseClient,
  householdId: string,
  today: string,
): Promise<void> {
  try {
    const { data: household, error: hError } = await supabase
      .from("households")
      .select("monthly_budget, pace_alert_enabled, pace_alert_sent_on")
      .eq("id", householdId)
      .maybeSingle();

    if (hError) {
      console.error("maybeSendPaceAlert: failed to read household", hError);
      return;
    }
    if (!household) return;

    const enabled = Boolean(household.pace_alert_enabled);
    const sentOn = household.pace_alert_sent_on ? String(household.pace_alert_sent_on) : null;
    const budget = readBudget(household.monthly_budget);

    // Швидка перевірка: якщо вимкнено, немає бюджету або сьогодні вже надсилали —
    // не навантажуємо БД запитами чеків.
    if (!enabled || budget === null || budget <= 0 || sentOn === today) {
      return;
    }

    const start = monthStart(today);
    const end = monthEnd(today);

    const { data: receiptsData, error: rError } = await supabase
      .from("receipts")
      .select("id, purchased_at, total")
      .eq("household_id", householdId)
      .gte("purchased_at", start)
      .lte("purchased_at", end);

    if (rError) {
      console.error("maybeSendPaceAlert: failed to read receipts", rError);
      return;
    }

    const receiptRows = (receiptsData ?? []) as RawPaceReceipt[];
    const nullTotalIds = receiptRows.filter((r) => r.total === null).map((r) => r.id);

    const itemsByReceipt = new Map<string, { price: number | null }[]>();
    if (nullTotalIds.length > 0) {
      const { data: itemsData, error: iError } = await supabase
        .from("receipt_items")
        .select("receipt_id, price")
        .eq("household_id", householdId)
        .in("receipt_id", nullTotalIds);

      if (iError) {
        console.error("maybeSendPaceAlert: failed to read receipt items", iError);
        return;
      }

      for (const item of (itemsData ?? []) as RawPaceItem[]) {
        const list = itemsByReceipt.get(item.receipt_id) ?? [];
        list.push({ price: coerceNumber(item.price) });
        itemsByReceipt.set(item.receipt_id, list);
      }
    }

    const datedAmounts = receiptRows.map((r) => ({
      purchasedAt: String(r.purchased_at).slice(0, 10),
      amount: amountOf({
        total: coerceNumber(r.total),
        items: itemsByReceipt.get(r.id) ?? [],
      }),
    }));

    const spent = sumBetween(datedAmounts, { start, end });
    const elapsedDays = elapsedInRange(start, end, today);
    const spanDays = daysInclusive(start, end);

    const decision = paceAlertDecision({
      enabled,
      budget,
      spent,
      elapsedDays,
      spanDays,
      sentOn,
      today,
    });

    if (!decision.send) {
      return;
    }

    await sendToHouseholdChats(supabase, householdId, decision.text);
    const { error: updateError } = await supabase
      .from("households")
      .update({ pace_alert_sent_on: today })
      .eq("id", householdId);

    if (updateError) {
      console.error("maybeSendPaceAlert: failed to update pace_alert_sent_on", updateError);
    }
  } catch (err) {
    console.error("maybeSendPaceAlert unexpected error", err);
  }
}

