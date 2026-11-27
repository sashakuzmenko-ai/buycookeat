// Зіставлення позиції скану з довідником продуктів. Без бази й без каналу вводу.

import { PRODUCT_CATEGORIES } from "../seed-data.ts";
import type { ScanItem, ScanUnit } from "../scan-types.ts";

const UNITS = new Set<ScanUnit>(["г", "мл", "шт"]);

export function roundScanQty(value: number): number {
  return Math.round(value * 100) / 100;
}

export function cleanUnit(value: unknown): ScanUnit {
  const unit = String(value ?? "");
  return UNITS.has(unit as ScanUnit) ? (unit as ScanUnit) : "шт";
}

export function cleanCategory(value: unknown): string {
  const category = String(value ?? "");
  return (PRODUCT_CATEGORIES as readonly string[]).includes(category) ? category : "інше";
}

export function productKey(name: string): string {
  return name.trim().toLowerCase();
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Дата «вжити до» з етикетки: YYYY-MM-DD, DD.MM.YYYY або DD/MM/YYYY; інакше null. */
export function parseExpiryDate(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    return isValidCalendarDate(year, month, day) ? raw : null;
  }

  const dotted = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(raw);
  if (dotted) {
    const day = Number(dotted[1]);
    const month = Number(dotted[2]);
    const year = Number(dotted[3]);
    if (!isValidCalendarDate(year, month, day)) return null;
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${year}-${mm}-${dd}`;
  }

  return null;
}

export function normalizePackageFields(
  amount: unknown,
  unit: unknown,
): { packageAmount: number | null; packageUnit: "г" | "мл" | null } {
  const unitRaw = String(unit ?? "").trim();
  const packageUnit = unitRaw === "г" || unitRaw === "мл" ? unitRaw : null;
  const parsed = Number(amount);
  if (!packageUnit || !(parsed > 0) || !Number.isFinite(parsed)) {
    return { packageAmount: null, packageUnit: null };
  }
  return { packageAmount: roundScanQty(parsed), packageUnit };
}

export type ProductChoice =
  | { kind: "existing"; productId: string }
  | { kind: "create"; name: string; category: string; unit: ScanUnit }
  | { kind: "skip" };

/** Ідентифікатор зі списку сім'ї, інакше збіг за назвою, інакше новий продукт, інакше пропуск. */
export function chooseProduct(
  item: Pick<ScanItem, "productId" | "name" | "category" | "unit">,
  byId: ReadonlySet<string>,
  byName: ReadonlyMap<string, string>,
): ProductChoice {
  if (item.productId && byId.has(item.productId)) return { kind: "existing", productId: item.productId };
  const name = item.name.trim().slice(0, 80);
  const known = name ? byName.get(productKey(name)) : undefined;
  if (known) return { kind: "existing", productId: known };
  if (!name) return { kind: "skip" };
  return { kind: "create", name, category: cleanCategory(item.category), unit: cleanUnit(item.unit) };
}
