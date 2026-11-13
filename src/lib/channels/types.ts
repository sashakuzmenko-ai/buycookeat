// Контракт зовнішнього каналу скану. Реалізація месенджера його не розширює:
// розпізнавання й запис бачать лише ці нормалізовані значення.

import type { ScanInputType } from "../db-types.ts";

export type ChannelMedia = {
  fileId: string;
  kind: "voice" | "photo" | "video" | "image";
  mimeType: string | null;
  fileSize: number | null;
};

export type TelegramChatType = "private" | "group" | "supergroup" | "channel" | "other";

export type InboundMessage = {
  senderId: string;
  chatId: string;
  chatType: TelegramChatType;
  chatTitle: string | null;
  inputType: ScanInputType;
  text: string;
  media: ChannelMedia | null;
  /** null — це не /start; порожній рядок — /start без коду. */
  startCode: string | null;
  oversized: boolean;
};

export type ButtonPress = {
  pressId: string;
  senderId: string;
  chatId: string;
  data: string;
};

export type ChannelUpdate =
  | { kind: "message"; message: InboundMessage }
  | { kind: "press"; press: ButtonPress }
  | { kind: "ignore" };

export type OutboundButton = {
  label: string;
  data?: string;
  url?: string;
};

export type OutboundMessage = {
  chatId: string;
  text: string;
  buttons?: OutboundButton[][];
  showHints?: boolean;
};

export type MediaPayload = { ok: true; base64: string; mimeType: string };
export type MediaFailure = { ok: false; tooLarge: boolean; error: string };

export interface ScanChannel {
  readUpdate(update: unknown): ChannelUpdate;
  send(message: OutboundMessage): Promise<{ ok: boolean; error?: string }>;
  ackPress(pressId: string, text?: string): Promise<void>;
  loadMedia(media: ChannelMedia): Promise<MediaPayload | MediaFailure>;
}
