// Telegram Bot API через fetch. Без SDK.
// setWebhook: secret_token → заголовок X-Telegram-Bot-Api-Secret-Token (1–256, A–Z a–z 0–9 _ -).
// getFile: завантаження до 20 МБ; цей канал ріже раніше через ліміт тіла Vercel 4,5 МБ.
// sendMessage: inline_keyboard, callback_data до 64 байт. answerCallbackQuery гасить спінер.

import { SCAN_LIMITS } from "../scan-types.ts";
import { QUICK_HINTS } from "./copy.ts";
import type {
  ChannelMedia,
  ChannelUpdate,
  InboundMessage,
  MediaFailure,
  MediaPayload,
  OutboundMessage,
  ScanChannel,
  TelegramChatType,
} from "./types.ts";

export const TELEGRAM_FETCH_LIMIT = SCAN_LIMITS.maxBodyBytes;

const API = "https://api.telegram.org";

type Json = Record<string, unknown>;

function record(value: unknown): Json | null {
  return value && typeof value === "object" ? (value as Json) : null;
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function numOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function startArgument(text: string): string | null {
  const match = /^\/start(?:@[\w_]+)?(?:\s+(\S+))?/i.exec(text.trim());
  if (!match) return null;
  return match[1] ?? "";
}

export function audioFormatFor(mime: string | null): "wav" | "mp3" | "ogg" | "aac" | "flac" {
  const value = (mime ?? "").toLowerCase();
  if (value.includes("wav")) return "wav";
  if (value.includes("mpeg") || value.includes("mp3")) return "mp3";
  if (value.includes("flac")) return "flac";
  if (value.includes("aac") || value.includes("mp4")) return "aac";
  return "ogg";
}

function mediaOf(message: Json): { media: ChannelMedia; inputType: InboundMessage["inputType"] } | "large" | null {
  const voice = record(message.voice) ?? record(message.audio);
  if (voice?.file_id) {
    return fileMedia(voice, "voice", "voice", "audio/ogg");
  }
  const video = record(message.video) ?? record(message.video_note);
  if (video?.file_id) return fileMedia(video, "video", "video", "video/mp4");
  const photos = Array.isArray(message.photo) ? message.photo : [];
  const photo = pickPhoto(photos);
  if (photo) return { media: photo, inputType: "receipt" };
  const document = record(message.document);
  if (document?.file_id) return documentMedia(document);
  return null;
}

function fileMedia(
  source: Json,
  kind: ChannelMedia["kind"],
  inputType: InboundMessage["inputType"],
  fallbackMime: string,
): { media: ChannelMedia; inputType: InboundMessage["inputType"] } | "large" {
  const fileSize = numOrNull(source.file_size);
  if (fileSize !== null && fileSize > TELEGRAM_FETCH_LIMIT) return "large";
  return {
    inputType,
    media: {
      fileId: textOf(source.file_id),
      kind,
      mimeType: textOf(source.mime_type) || fallbackMime,
      fileSize,
    },
  };
}

function pickPhoto(photos: unknown[]): ChannelMedia | null {
  const sizes = photos.map(record).filter((row): row is Json => Boolean(row?.file_id));
  if (sizes.length === 0) return null;
  const under = sizes.filter((row) => {
    const size = numOrNull(row.file_size);
    return size === null || size <= TELEGRAM_FETCH_LIMIT;
  });
  const chosen = (under.length ? under : sizes).at(-1);
  if (!chosen) return null;
  return {
    fileId: textOf(chosen.file_id),
    kind: "photo",
    mimeType: "image/jpeg",
    fileSize: numOrNull(chosen.file_size),
  };
}

function documentMedia(document: Json): { media: ChannelMedia; inputType: InboundMessage["inputType"] } | "large" | null {
  const mime = textOf(document.mime_type).toLowerCase();
  if (mime.startsWith("video/")) return fileMedia(document, "video", "video", mime);
  if (mime.startsWith("audio/")) return fileMedia(document, "voice", "voice", mime);
  if (mime.startsWith("image/")) return fileMedia(document, "image", "screenshot", mime || "image/jpeg");
  return null;
}

function telegramChatType(raw: string): TelegramChatType {
  if (raw === "private" || raw === "group" || raw === "supergroup" || raw === "channel") return raw;
  return "other";
}

function telegramChatTitle(chat: Json, from: Json): string | null {
  const type = textOf(chat.type);
  if (type === "private") {
    const parts = [textOf(from.first_name), textOf(from.last_name)].filter(Boolean);
    if (parts.length) return parts.join(" ");
    const username = textOf(from.username).replace(/^@/, "");
    return username ? `@${username}` : null;
  }
  const title = textOf(chat.title);
  return title || null;
}

function botNeedle(botUsername: string | null | undefined): string | null {
  if (!botUsername?.trim()) return null;
  return botUsername.replace(/^@/, "").toLowerCase();
}

function mentionsBotInMessage(message: Json, botUsername: string | null | undefined): boolean {
  const needle = botNeedle(botUsername);
  if (!needle) return false;
  const text = textOf(message.text) || textOf(message.caption);
  const entities = [
    ...(Array.isArray(message.entities) ? message.entities : []),
    ...(Array.isArray(message.caption_entities) ? message.caption_entities : []),
  ];
  for (const raw of entities) {
    const entity = record(raw);
    if (!entity) continue;
    const type = textOf(entity.type);
    if (type === "mention") {
      const offset = Number(entity.offset);
      const length = Number(entity.length);
      if (Number.isFinite(offset) && Number.isFinite(length) && length > 0) {
        const mention = text.slice(offset, offset + length).replace(/^@/, "").toLowerCase();
        if (mention === needle) return true;
      }
    }
    if (type === "text_mention") {
      const user = record(entity.user);
      const username = textOf(user?.username).replace(/^@/, "").toLowerCase();
      if (username === needle) return true;
    }
  }
  return false;
}

function repliesToBotMessage(message: Json): boolean {
  const reply = record(message.reply_to_message);
  if (!reply) return false;
  const from = record(reply.from);
  return from?.is_bot === true;
}

function inboundBase(message: Json, from: Json, chat: Json) {
  const senderId = textOf(from.id);
  const chatId = textOf(chat.id);
  if (!senderId || !chatId) return null;
  return {
    senderId,
    chatId,
    chatType: telegramChatType(textOf(chat.type)),
    chatTitle: telegramChatTitle(chat, from),
  };
}

function readMessage(message: Json, botUsername?: string | null): ChannelUpdate {
  const from = record(message.from);
  const chat = record(message.chat);
  if (!from || !chat || from.is_bot) return { kind: "ignore" };
  const base = inboundBase(message, from, chat);
  if (!base) return { kind: "ignore" };
  const text = textOf(message.text) || textOf(message.caption);
  const startCode = startArgument(text);
  const media = mediaOf(message);
  const mentionsBot = mentionsBotInMessage(message, botUsername);
  const repliesToBot = repliesToBotMessage(message);
  if (media === "large") {
    return {
      kind: "message",
      message: {
        ...base,
        inputType: "video",
        text,
        media: null,
        startCode: null,
        oversized: true,
        mentionsBot,
        repliesToBot,
      },
    };
  }
  if (!media && !text.trim()) return { kind: "ignore" };
  return {
    kind: "message",
    message: {
      ...base,
      inputType: media?.inputType ?? "text",
      text: startCode === null ? text : "",
      media: media?.media ?? null,
      startCode,
      oversized: false,
      mentionsBot,
      repliesToBot,
    },
  };
}

function readPress(query: Json): ChannelUpdate {
  const from = record(query.from);
  const message = record(query.message);
  const chat = message ? record(message.chat) : null;
  const senderId = textOf(from?.id);
  const chatId = textOf(chat?.id);
  const pressId = textOf(query.id);
  const data = textOf(query.data);
  if (!senderId || !chatId || !pressId || !data) return { kind: "ignore" };
  return { kind: "press", press: { pressId, senderId, chatId, data } };
}

export function readTelegramUpdate(update: unknown, botUsername?: string | null): ChannelUpdate {
  const body = record(update);
  if (!body) return { kind: "ignore" };
  const message = record(body.message);
  if (message) return readMessage(message, botUsername);
  const query = record(body.callback_query);
  if (query) return readPress(query);
  return { kind: "ignore" };
}

async function callApi(
  token: string,
  method: string,
  body: Json,
  fetchImpl: typeof fetch,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  try {
    const response = await fetchImpl(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; description?: string; result?: unknown } | null;
    if (!response.ok || !payload?.ok) return { ok: false, error: "Не вдалося надіслати відповідь у Telegram" };
    return { ok: true, result: payload.result };
  } catch {
    return { ok: false, error: "Не вдалося зв'язатися з Telegram" };
  }
}

function keyboard(message: OutboundMessage): Json | undefined {
  if (message.buttons?.length) {
    return {
      inline_keyboard: message.buttons.map((row) =>
        row.map((button) => (button.url ? { text: button.label, url: button.url } : { text: button.label, callback_data: button.data ?? "noop" })),
      ),
    };
  }
  if (message.showHints) {
    return {
      keyboard: [QUICK_HINTS.map((label) => ({ text: label }))],
      resize_keyboard: true,
    };
  }
  return undefined;
}

async function readLimited(response: Response, max: number): Promise<Uint8Array | "too-large"> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > max) return "too-large";
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength > max ? "too-large" : bytes;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const step = await reader.read();
    if (step.done) break;
    total += step.value.byteLength;
    if (total > max) {
      await reader.cancel();
      return "too-large";
    }
    chunks.push(step.value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export function createTelegramChannel(token: string, fetchImpl: typeof fetch = fetch, botUsername?: string | null): ScanChannel {
  return {
    readUpdate: (update) => readTelegramUpdate(update, botUsername),
    async send(message) {
      const replyMarkup = keyboard(message);
      const sent = await callApi(
        token,
        "sendMessage",
        {
          chat_id: message.chatId,
          text: message.text,
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        },
        fetchImpl,
      );
      return sent.ok ? { ok: true } : { ok: false, error: sent.error };
    },
    async ackPress(pressId, text) {
      await callApi(token, "answerCallbackQuery", { callback_query_id: pressId, ...(text ? { text } : {}) }, fetchImpl);
    },
    async loadMedia(media) {
      if (media.fileSize !== null && media.fileSize > TELEGRAM_FETCH_LIMIT) {
        return { ok: false, tooLarge: true, error: "Файл завеликий" };
      }
      const file = await callApi(token, "getFile", { file_id: media.fileId }, fetchImpl);
      if (!file.ok) return { ok: false, tooLarge: false, error: file.error };
      const info = record(file.result);
      const path = textOf(info?.file_path);
      const remoteSize = numOrNull(info?.file_size);
      if (!path || path.includes("..") || !/^[\w./-]+$/.test(path)) {
        return { ok: false, tooLarge: false, error: "Не вдалося завантажити файл" };
      }
      if (remoteSize !== null && remoteSize > TELEGRAM_FETCH_LIMIT) {
        return { ok: false, tooLarge: true, error: "Файл завеликий" };
      }
      return downloadFile(token, path, media.mimeType ?? "application/octet-stream", fetchImpl);
    },
  };
}

async function downloadFile(token: string, path: string, mimeType: string, fetchImpl: typeof fetch): Promise<MediaPayload | MediaFailure> {
  try {
    const response = await fetchImpl(`${API}/file/bot${token}/${path}`);
    if (!response.ok) return { ok: false, tooLarge: false, error: "Не вдалося завантажити файл" };
    const bytes = await readLimited(response, TELEGRAM_FETCH_LIMIT);
    if (bytes === "too-large") return { ok: false, tooLarge: true, error: "Файл завеликий" };
    return { ok: true, base64: Buffer.from(bytes).toString("base64"), mimeType };
  } catch {
    return { ok: false, tooLarge: false, error: "Не вдалося завантажити файл" };
  }
}

export async function lookupBotUsername(token: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!token.trim()) return null;
  const me = await callApi(token, "getMe", {}, fetchImpl);
  if (!me.ok) return null;
  const name = textOf(record(me.result)?.username).replace(/^@/, "");
  return name || null;
}
