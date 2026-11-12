// Статуси меню тижня і підсумок покриття складом. Масштаб порцій і список покупок — з shopping.ts.

import { buildShoppingList, ingredientUsage, type PlanLine, type ProductInfo } from "./shopping.ts";

export const MENU_SLOTS = ["breakfast", "lunch", "dinner"] as const;
export type MenuSlot = (typeof MENU_SLOTS)[number];

const MENU_SLOT_SET = new Set<string>(MENU_SLOTS);

export function isMenuSlot(value: string): value is MenuSlot {
  return MENU_SLOT_SET.has(value);
}

export type DishKind = "cooked" | "ready" | "missing";

export type DishStatus = {
  kind: DishKind;
  missingCount: number;
  missingProductIds: readonly string[];
};

export type MenuSummary = {
  /** null — немає продуктів, які треба покривати (порожньо, усе приготовано або лише базові запаси). */
  coveragePercent: number | null;
  cookedCount: number;
  plannedCount: number;
  toBuyCount: number;
};

export type DayMark = "done" | "planned" | "open";

type DishInput = { readonly cooked: boolean; readonly line: PlanLine | null };

function countableNeeds(
  lines: readonly PlanLine[],
  portions: number,
  products: Map<string, ProductInfo>,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const line of lines) {
    for (const used of ingredientUsage(line, portions)) {
      if (products.get(used.productId)?.isStaple) continue;
      totals.set(used.productId, (totals.get(used.productId) ?? 0) + used.quantity);
    }
  }
  return totals;
}

function isShort(have: number, need: number): boolean {
  return have + 1e-6 < need;
}

/** Продукти рядків плану, яких не вистачає в залишках (без базових запасів і необов'язкових). */
export function shortProductIds(
  lines: readonly PlanLine[],
  portions: number,
  products: Map<string, ProductInfo>,
  stock: Map<string, number>,
): string[] {
  const missing: string[] = [];
  for (const [productId, need] of countableNeeds(lines, portions, products)) {
    if (need > 0 && isShort(stock.get(productId) ?? 0, need)) missing.push(productId);
  }
  return missing;
}

/**
 * Статус однієї страви: приготовано — за позначкою; інакше порівняння її інгредієнтів
 * (з порціями сім'ї) із поточними залишками, без вирахування інших страв тижня.
 */
export function dishStockStatus(
  dish: DishInput,
  portions: number,
  products: Map<string, ProductInfo>,
  stock: Map<string, number>,
): DishStatus {
  if (dish.cooked) return { kind: "cooked", missingCount: 0, missingProductIds: [] };
  if (!dish.line) return { kind: "ready", missingCount: 0, missingProductIds: [] };
  const missingProductIds = shortProductIds([dish.line], portions, products, stock);
  if (missingProductIds.length === 0) return { kind: "ready", missingCount: 0, missingProductIds };
  return { kind: "missing", missingCount: missingProductIds.length, missingProductIds };
}

/** Частка потреби відкритих страв, яку покриває склад. Кожен продукт важить однаково, одиниці не змішуються. */
export function pantryCoveragePercent(
  lines: readonly PlanLine[],
  portions: number,
  products: Map<string, ProductInfo>,
  stock: Map<string, number>,
): number | null {
  let counted = 0;
  let covered = 0;
  for (const [productId, need] of countableNeeds(lines, portions, products)) {
    if (need <= 0) continue;
    const have = stock.get(productId) ?? 0;
    covered += Math.min(1, Math.max(0, have / need));
    counted += 1;
  }
  if (counted === 0) return null;
  return Math.round((covered / counted) * 100);
}

export function summarizeMenu(
  dishes: readonly DishInput[],
  portions: number,
  products: Map<string, ProductInfo>,
  stock: Map<string, number>,
): MenuSummary {
  const open: PlanLine[] = [];
  let cookedCount = 0;
  for (const dish of dishes) {
    if (dish.cooked) cookedCount += 1;
    else if (dish.line) open.push(dish.line);
  }
  return {
    coveragePercent: pantryCoveragePercent(open, portions, products, stock),
    cookedCount,
    plannedCount: dishes.length,
    toBuyCount: buildShoppingList(open, portions, products, stock).length,
  };
}

/** ✓ усе приготовано, • є план на всі слоти, ○ є порожній слот. */
export function dayMarkFromSlots(slots: readonly { readonly filled: boolean; readonly cooked: boolean }[]): DayMark {
  if (slots.length === 0 || slots.some((slot) => !slot.filled)) return "open";
  if (slots.every((slot) => slot.cooked)) return "done";
  return "planned";
}

export function positionCountLabel(count: number): string {
  const abs = Math.abs(count);
  const n10 = abs % 10;
  const n100 = abs % 100;
  let word = "позицій";
  if (n10 === 1 && n100 !== 11) word = "позиція";
  else if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) word = "позиції";
  return `${count.toLocaleString("uk-UA")} ${word}`;
}
