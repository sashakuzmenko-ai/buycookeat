// Перевірка тіла запиту на розпізнавання. Ліміти й форма, без HTTP і без каналу.

import type { ScanInputType } from "../db-types.ts";
import { SCAN_LIMITS, type ScanMode } from "../scan-types.ts";
import { isScanInputType } from "./present.ts";

export type ScanRequest = {
  mode: ScanMode;
  inputType: ScanInputType;
  images: string[];
  audioBase64: string | null;
  text: string;
  note: string;
};

export type ScanRequestResult = { ok: true; value: ScanRequest } | { ok: false; status: number; error: string };

const JPEG = "data:image/jpeg;base64,";

function asObject(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

function readImages(value: unknown): { images: string[] } | { error: string } {
  if (value === undefined || value === null) return { images: [] };
  if (!Array.isArray(value)) return { error: "Некоректний список зображень" };
  const images = value
    .filter((item): item is string => typeof item === "string" && item.startsWith(JPEG))
    .slice(0, SCAN_LIMITS.maxImages);
  return { images };
}

function readAudio(value: unknown): { audio: string | null } | { error: string } {
  if (value === undefined || value === null || value === "") return { audio: null };
  if (typeof value !== "string" || !/^[A-Za-z0-9+/=]+$/.test(value)) return { error: "Некоректний аудіозапис" };
  if (value.length > SCAN_LIMITS.maxBodyBytes) return { error: "Запис задовгий — скоротіть його" };
  return { audio: value };
}

function inferInputType(explicit: unknown, images: number, audio: boolean, text: string): ScanInputType {
  if (typeof explicit === "string" && isScanInputType(explicit)) return explicit;
  if (text && images === 0 && !audio) return "text";
  if (audio && images === 0) return "voice";
  if (audio && images > 0) return "video";
  return images > 0 ? "receipt" : "text";
}

/** Розбирає тіло розпізнавання: режим, тип вводу, jpeg, wav і текст. */
export function parseScanRequest(body: unknown): ScanRequestResult {
  const record = asObject(body);
  if (!record) return { ok: false, status: 400, error: "Некоректний запит" };

  const images = readImages(record.images);
  if ("error" in images) return { ok: false, status: 400, error: images.error };
  const audio = readAudio(record.audio);
  if ("error" in audio) return { ok: false, status: 400, error: audio.error };

  const text = typeof record.text === "string" ? record.text.trim().slice(0, 2000) : "";
  const note = typeof record.note === "string" ? record.note.trim().slice(0, 500) : "";
  if (images.images.length === 0 && !audio.audio && !text && !note) {
    return { ok: false, status: 400, error: "Додайте фото, відео, голос або текст" };
  }

  const mode: ScanMode = record.mode === "set" ? "set" : "add";
  return {
    ok: true,
    value: {
      mode,
      inputType: inferInputType(record.inputType, images.images.length, Boolean(audio.audio), text || note),
      images: images.images,
      audioBase64: audio.audio,
      text,
      note,
    },
  };
}
