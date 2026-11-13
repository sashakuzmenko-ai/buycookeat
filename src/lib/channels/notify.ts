import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { clipMessage } from "./copy.ts";
import { createTelegramChannel } from "./telegram.ts";

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
