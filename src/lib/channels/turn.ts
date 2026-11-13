import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultScanMode } from "../scan/capture.ts";
import { commitPendingScan } from "../scan/commit.ts";
import { createIncomingScan } from "../scan/inbox.ts";
import { recognize, RecognizeError } from "../scan/recognize.ts";
import { pluralizePositions } from "../pantry.ts";
import type { ScanChannel } from "./types.ts";
import { audioFormatFor } from "./telegram.ts";
import {
  accessHelp,
  dinnerText,
  LINKED_HELLO,
  parsePressData,
  recognitionText,
  scanButtons,
  scanFixUrl,
  shoppingText,
  stockText,
  TOO_BIG,
  USAGE,
  wroteSummary,
  quickAsk,
} from "./copy.ts";
import { redeemFailureText } from "./bind.ts";
import { shouldAnswerText } from "./group.ts";
import { addScanToShopping, loadGrant, loadOwnedItems, loadProducts, readDinner, readLowStock, readShopping, redeemLink } from "./store.ts";
import { maybeSendPaceAlert } from "./notify.ts";
import { todayISO } from "../dates.ts";

type Turn = {
  supabase: SupabaseClient;
  channel: ScanChannel;
  body: unknown;
  origin: string;
  apiKey: string;
  model?: string;
};

function refreshFamilyViews() {
  try {
    revalidatePath("/scan");
    revalidatePath("/pantry");
    revalidatePath("/finance");
    revalidatePath("/shopping");
  } catch {
    // Кеш сторінок оновиться за наступного відкриття.
  }
}

async function reply(ctx: Turn, chatId: string, text: string, extra?: { buttons?: ReturnType<typeof scanButtons>; hints?: boolean }) {
  await ctx.channel.send({
    chatId,
    text,
    buttons: extra?.buttons,
    showHints: extra?.hints,
  });
}

async function onStart(
  ctx: Turn,
  chatId: string,
  code: string,
  meta?: { chatType?: string | null; chatTitle?: string | null },
) {
  if (!code) {
    const grant = await loadGrant(ctx.supabase, chatId);
    if (!grant.allowed) {
      await reply(ctx, chatId, accessHelp(grant.reason));
      return;
    }
    await reply(ctx, chatId, LINKED_HELLO, { hints: true });
    return;
  }
  const redeemed = await redeemLink(ctx.supabase, {
    code,
    chatId,
    chatType: meta?.chatType,
    chatTitle: meta?.chatTitle,
  });
  if (!redeemed.ok) {
    await reply(ctx, chatId, redeemFailureText(redeemed.reason));
    return;
  }
  await reply(ctx, chatId, LINKED_HELLO, { hints: true });
}

async function onBrief(ctx: Turn, chatId: string, kind: "dinner" | "shopping" | "stock") {
  const grant = await loadGrant(ctx.supabase, chatId);
  if (!grant.allowed) {
    await reply(ctx, chatId, accessHelp(grant.reason));
    return;
  }
  if (kind === "dinner") {
    await reply(ctx, chatId, dinnerText(await readDinner(ctx.supabase, grant)), { hints: true });
    return;
  }
  if (kind === "shopping") {
    await reply(ctx, chatId, shoppingText(await readShopping(ctx.supabase, grant)), { hints: true });
    return;
  }
  await reply(ctx, chatId, stockText(await readLowStock(ctx.supabase, grant)), { hints: true });
}

async function onScan(ctx: Turn, message: Extract<ReturnType<ScanChannel["readUpdate"]>, { kind: "message" }>["message"]) {
  const grant = await loadGrant(ctx.supabase, message.chatId);
  if (!grant.allowed) {
    await reply(ctx, message.chatId, accessHelp(grant.reason));
    return;
  }
  if (message.oversized) {
    await reply(ctx, message.chatId, TOO_BIG);
    return;
  }
  const ask = quickAsk(message.text);
  if (!message.media && ask) {
    await onBrief(ctx, message.chatId, ask);
    return;
  }
  if (message.text.startsWith("/") && !message.media) {
    await reply(ctx, message.chatId, USAGE, { hints: true });
    return;
  }

  let images: string[] = [];
  let videos: string[] = [];
  let audioBase64: string | null = null;
  let audioFormat: "wav" | "mp3" | "ogg" | "aac" | "flac" | undefined;
  if (message.media) {
    const loaded = await ctx.channel.loadMedia(message.media);
    if (!loaded.ok) {
      await reply(ctx, message.chatId, loaded.tooLarge ? TOO_BIG : loaded.error);
      return;
    }
    if (message.inputType === "voice") {
      audioBase64 = loaded.base64;
      audioFormat = audioFormatFor(loaded.mimeType);
    } else if (message.inputType === "video") {
      videos = [`data:${loaded.mimeType};base64,${loaded.base64}`];
    } else {
      images = [`data:${loaded.mimeType};base64,${loaded.base64}`];
    }
  }

  const mode = defaultScanMode(message.inputType);
  try {
    const result = await recognize({
      mode,
      images,
      videos,
      audioBase64,
      audioFormat,
      text: message.text,
      note: "",
      products: await loadProducts(ctx.supabase, grant),
      apiKey: ctx.apiKey,
      model: ctx.model,
    });
    if (result.items.length === 0) {
      await reply(ctx, message.chatId, "Нічого не розпізнала. Надішліть чіткіше фото, голосове або текст.");
      return;
    }
    const householdId = grant.householdId;
    const created = await createIncomingScan(ctx.supabase, {
      householdId,
      sentBy: grant.userId,
      channel: "telegram",
      inputType: message.inputType,
      mode,
      storeName: result.store || null,
      total: result.total > 0 ? result.total : null,
      items: result.items,
      channelData: {
        chatId: message.chatId,
        telegramUserId: message.senderId,
        senderName: message.senderName,
        source: result.source,
        model: result.model,
        costUsd: result.costUsd,
      },
    });
    if (!created.ok) {
      await reply(ctx, message.chatId, "Не вдалося покласти скан у чергу.");
      return;
    }
    refreshFamilyViews();
    const now = new Date();
    await reply(ctx, message.chatId, recognitionText({
      inputType: message.inputType,
      items: result.items,
      store: result.store,
      total: result.total,
      mode,
      now,
    }), { buttons: scanButtons(created.id, scanFixUrl(ctx.origin, created.id)) });
  } catch (error) {
    const text = error instanceof RecognizeError ? error.message : "Не вдалося розпізнати. Спробуйте ще раз.";
    await reply(ctx, message.chatId, text);
  }
}

async function onPress(ctx: Turn, press: { pressId: string; chatId: string; data: string }) {
  const parsed = parsePressData(press.data);
  await ctx.channel.ackPress(press.pressId);
  const grant = await loadGrant(ctx.supabase, press.chatId);
  if (!grant.allowed) {
    await reply(ctx, press.chatId, accessHelp(grant.reason));
    return;
  }
  if (!parsed) {
    await reply(ctx, press.chatId, "Ця кнопка вже не діє.");
    return;
  }
  if (parsed.action === "fix") {
    await reply(ctx, press.chatId, "Виправте позиції в застосунку на екрані Скан.");
    return;
  }
  if (parsed.action === "shop") {
    const items = await loadOwnedItems(ctx.supabase, grant, parsed.scanId);
    if (!items) {
      await reply(ctx, press.chatId, "Скан не знайдено.");
      return;
    }
    const added = await addScanToShopping(ctx.supabase, grant, items);
    await reply(ctx, press.chatId, added.ok ? `Додала ${pluralizePositions(added.count)} у список покупок.` : added.error);
    if (added.ok) refreshFamilyViews();
    return;
  }
  const committed = await commitPendingScan(ctx.supabase, grant.householdId, parsed.scanId, parsed.action === "got" ? "add" : undefined);
  if (!committed.ok) {
    await reply(ctx, press.chatId, committed.error);
    return;
  }
  try {
    await maybeSendPaceAlert(ctx.supabase, grant.householdId, todayISO());
  } catch (err) {
    console.error("maybeSendPaceAlert in onPress failed", err);
  }
  refreshFamilyViews();
  await reply(ctx, press.chatId, wroteSummary(committed.mode, committed.items.length, committed.total, new Date()));
}

export async function handleTelegramUpdate(ctx: Turn): Promise<void> {
  const event = ctx.channel.readUpdate(ctx.body);
  if (event.kind === "ignore") return;
  if (event.kind === "press") {
    await onPress(ctx, event.press);
    return;
  }
  if (event.message.startCode !== null) {
    await onStart(ctx, event.message.chatId, event.message.startCode, {
      chatType: event.message.chatType,
      chatTitle: event.message.chatTitle,
    });
    return;
  }
  if (event.message.oversized || event.message.media) {
    await onScan(ctx, event.message);
    return;
  }
  const ask = quickAsk(event.message.text);
  if (ask) {
    await onBrief(ctx, event.message.chatId, ask);
    return;
  }
  const msg = event.message;
  if (
    !shouldAnswerText({
      chatType: msg.chatType,
      text: msg.text,
      mentionsBot: msg.mentionsBot,
      repliesToBot: msg.repliesToBot,
    })
  ) {
    return;
  }
  const isGroup = msg.chatType === "group" || msg.chatType === "supergroup";
  if (isGroup && msg.mentionsBot && msg.text.replace(/@[\w_]+/g, "").trim() === "") {
    await reply(ctx, msg.chatId, USAGE, { hints: true });
    return;
  }
  await onScan(ctx, msg);
}
