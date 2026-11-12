// Підписи черги й наслідки підтвердження. Чисті функції, без запиту й без каналу.

import type { ScanInputType, ScanStatus } from "../db-types.ts";
import { pluralizePositions } from "../pantry.ts";
import type { ScanItem, ScanMode } from "../scan-types.ts";

export const SCAN_INPUTS: readonly (readonly [ScanInputType, string, string, string])[] = [
  ["receipt", "Чек", "Фото — позиції, магазин, сума", "фото чека"],
  ["voice", "Голос", "«Купив сир і сметану»", "голос"],
  ["video", "Відео", "Холодильник або полиця — інвентаризація", "відео"],
  ["screenshot", "Скріншот", "Замовлення з доставки", "скріншот"],
  ["text", "Текст", "Список одним повідомленням", "текст"],
];

const STATUS_LABELS: readonly (readonly [ScanStatus, string])[] = [
  ["pending", "Перевірити"],
  ["confirmed", "Записано"],
  ["rejected", "Відхилено"],
];

const INPUT_TYPES = new Set<string>(SCAN_INPUTS.map(([id]) => id));
const STATUSES = new Set<string>(STATUS_LABELS.map(([id]) => id));

export function isScanInputType(value: string): value is ScanInputType {
  return INPUT_TYPES.has(value);
}

export function isScanStatus(value: string): value is ScanStatus {
  return STATUSES.has(value);
}

export function inputTypeLabel(type: string): string {
  return SCAN_INPUTS.find(([id]) => id === type)?.[1] ?? type;
}

export function inputPhrase(type: string): string {
  return SCAN_INPUTS.find(([id]) => id === type)?.[3] ?? type;
}

export function statusLabel(status: string): string {
  return STATUS_LABELS.find(([id]) => id === status)?.[1] ?? status;
}

export function channelLabel(channel: string): string {
  if (channel === "web") return "Веб";
  if (channel === "telegram") return "Telegram";
  return channel;
}

export function formatAmount(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const negative = safe < 0;
  const [whole, frac] = Math.abs(safe).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${negative ? "−" : ""}${grouped},${frac}`;
}

export function formatUah(amount: number): string {
  return `${formatAmount(amount)} ₴`;
}

export function financeMonthLabel(iso: string): string {
  const month = new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", month: "long" }).format(new Date(iso));
  return `Фінанси · ${month}`;
}

type KyivParts = { dayKey: string; day: string; month: string; year: string; hour: string; minute: string };

function kyivParts(date: Date): KyivParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const year = pick("year");
  const month = pick("month");
  const day = pick("day");
  return { dayKey: `${year}-${month}-${day}`, day, month, year, hour: pick("hour"), minute: pick("minute") };
}

function shiftDay(dayKey: string, delta: number): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + delta));
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${mm}-${dd}`;
}

/** Час у черзі: сьогодні година, вчора — «учора», інакше день і місяць. Пояс Київ. */
export function formatScanWhen(iso: string, now: Date): string {
  const when = kyivParts(new Date(iso));
  const today = kyivParts(now);
  if (when.dayKey === today.dayKey) return `${when.hour}:${when.minute}`;
  if (when.dayKey === shiftDay(today.dayKey, -1)) return "учора";
  return `${when.day}.${when.month}`;
}

export function formatScanDay(iso: string): string {
  const when = kyivParts(new Date(iso));
  return `${when.day}.${when.month}.${when.year}`;
}

export function queueTitle(inputType: string, storeName: string | null, channel: string): string {
  const tail = storeName?.trim() || channelLabel(channel);
  return `${inputTypeLabel(inputType)} · ${tail}`;
}

export function queueNote(count: number, total: number | null, channel: string): string {
  const parts = [pluralizePositions(count)];
  if (total !== null && total > 0) parts.push(formatUah(total));
  parts.push(channelLabel(channel));
  return parts.join(" · ");
}

export function countStockItems(items: readonly ScanItem[]): number {
  return items.filter((item) => item.quantity > 0 && (item.productId !== null || item.name.trim() !== "")).length;
}

export function countUncertain(items: readonly ScanItem[]): number {
  return items.filter((item) => item.uncertain).length;
}

export function stockEffectLabel(mode: ScanMode, count: number): string {
  const word = pluralizePositions(count);
  return mode === "set" ? `оновити ${word}` : `+${word}`;
}

export function financeEffectLabel(mode: ScanMode, total: number | null): string {
  if (mode === "set") return "без чека";
  if (total === null || total <= 0) return "без суми";
  return `+${formatUah(total)}`;
}

/** Список покупок рахується зі складу, тож підтвердження не пише окремий список. */
export function shoppingEffectLabel(mode: ScanMode, count: number): string {
  if (count <= 0) return "без змін";
  return mode === "set" ? "залишки заміняться" : "перерахунок зі складу";
}

export function uncertainHint(count: number): string | null {
  if (count <= 0) return null;
  return `${pluralizePositions(count)} під питанням запишуться як є — їх можна виправити пізніше`;
}

export type ScanProductOption = {
  id: string;
  name: string;
  unit: string;
  category: string;
};

export function formatItemQty(quantity: number, unit: string): string {
  const text = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(quantity);
  return `${text} ${unit}`;
}

export function parseScanItems(value: unknown): ScanItem[] {
  if (!Array.isArray(value)) return [];
  const items: ScanItem[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const quantity = Number(record.quantity);
    if (!(quantity > 0) || !Number.isFinite(quantity)) continue;
    const price = Number(record.price);
    const productId = typeof record.productId === "string" && record.productId ? record.productId : null;
    items.push({
      raw: String(record.raw ?? "").slice(0, 120),
      productId,
      name: String(record.name ?? "").slice(0, 80),
      category: String(record.category ?? "інше"),
      unit: record.unit === "г" || record.unit === "мл" || record.unit === "шт" ? record.unit : "шт",
      quantity: Math.round(quantity * 100) / 100,
      uncertain: Boolean(record.uncertain),
      price: Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : null,
    });
  }
  return items;
}
