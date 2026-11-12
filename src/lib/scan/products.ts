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
