// Правила клієнтського вводу: який тип ляже в чергу і чи вистачає матеріалів.
// Без браузера, HTTP і каналу — тим самим користується і перевірка в check-logic.

import type { ScanInputType } from "../db-types.ts";

export type CaptureKind = ScanInputType | "file";

export type MediaAllow = { image: boolean; video: boolean; audio: boolean };

export type CaptureMedia = {
  images: number;
  audio: boolean;
  fromVideo: boolean;
  text: string;
  note: string;
};

const ALLOW: readonly (readonly [CaptureKind, boolean, boolean, boolean])[] = [
  ["file", true, true, true],
  ["video", false, true, false],
  ["voice", false, false, true],
  ["receipt", true, false, false],
  ["screenshot", true, false, false],
  ["text", false, false, false],
];

export function mediaAllow(kind: CaptureKind): MediaAllow {
  const row = ALLOW.find(([id]) => id === kind) ?? ALLOW[0];
  return { image: row[1], video: row[2], audio: row[3] };
}

/** Для універсального «файлу» тип виводиться з матеріалів. Обрана плашка лишається як є. */
export function resolveCaptureType(kind: CaptureKind, media: CaptureMedia): ScanInputType {
  if (kind !== "file") return kind;
  if (media.fromVideo) return "video";
  if (media.audio && media.images === 0) return "voice";
  if (media.images > 0) return "receipt";
  return "text";
}

export function captureBlockReason(kind: CaptureKind, media: CaptureMedia): string | null {
  const hasText = media.text.trim() !== "" || media.note.trim() !== "";
  if (kind === "voice") return media.audio ? null : "Запишіть голос";
  if (kind === "video") return media.images > 0 ? null : "Додайте відео";
  if (kind === "receipt" || kind === "screenshot") return media.images > 0 ? null : "Додайте фото";
  if (kind === "text") return hasText ? null : "Напишіть, що купили";
  if (media.images > 0 || media.audio || hasText) return null;
  return "Додайте фото, відео, голос або текст";
}
