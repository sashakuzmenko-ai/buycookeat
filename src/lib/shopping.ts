// Чиста логіка: порції, список покупок, автозаповнення меню. Без залежностей — тестується scripts/check-logic.ts

export type Unit = "г" | "мл" | "шт";

export function householdPortions(members: { portion_factor: number | string }[]): number {
  const sum = members.reduce((acc, m) => acc + Number(m.portion_factor), 0);
  return Math.round(sum * 100) / 100;
}

/** Округлення до «магазинних» кількостей: вага/об'єм — до 10, штуки — вгору до 0,5. */
export function roundQty(q: number, unit: string): number {
  if (unit === "шт") return Math.ceil(q * 2 - 1e-9) / 2;
  return Math.max(10, Math.round(q / 10) * 10);
}

/** Округлення для готування: дрібні кількості (спеції, часник) не роздуваємо до 10 г. */
export function roundCooking(q: number, unit: string): number {
  if (unit === "шт") return Math.max(0.5, Math.round(q * 2) / 2);
  if (q < 20) return Math.max(1, Math.round(q));
  if (q < 100) return Math.round(q / 5) * 5;
  return Math.round(q / 10) * 10;
}

export function formatQty(q: number, unit: string): string {
  const num = (n: number) => n.toLocaleString("uk-UA", { maximumFractionDigits: 2 });
  if (unit === "г" && q >= 1000) return `${num(q / 1000)} кг`;
  if (unit === "мл" && q >= 1000) return `${num(q / 1000)} л`;
  return `${num(q)} ${unit}`;
}

export type PlanLine = {
  servings: number | null; // null = на всю сім'ю
  baseServings: number;
  ingredients: { productId: string; quantity: number; optional: boolean }[];
};

export type ProductInfo = { unit: string; isStaple: boolean; storeId: string | null };

export type ShoppingLine = { productId: string; quantity: number; unit: string; storeId: string | null };

export function buildShoppingList(
  plan: PlanLine[],
  portions: number,
  products: Map<string, ProductInfo>,
): ShoppingLine[] {
  const totals = new Map<string, number>();
  for (const line of plan) {
    const scale = (line.servings ?? portions) / line.baseServings;
    for (const ing of line.ingredients) {
      if (ing.optional) continue;
      const p = products.get(ing.productId);
      if (!p || p.isStaple) continue;
      totals.set(ing.productId, (totals.get(ing.productId) ?? 0) + ing.quantity * scale);
    }
  }
  return [...totals].map(([productId, q]) => {
    const p = products.get(productId)!;
    return { productId, quantity: roundQty(q, p.unit), unit: p.unit, storeId: p.storeId };
  });
}

export type Slot = { date: string; mealType: string };

/**
 * Заповнює порожні слоти рецептами відповідного типу.
 * Не повторює страву, поки не використані всі варіанти для цього прийому їжі.
 */
export function autoFill(
  emptySlots: Slot[],
  recipes: { id: string; meal_types: string[] }[],
  alreadyUsed: string[],
  random: () => number = Math.random,
): (Slot & { recipeId: string })[] {
  const used = new Set(alreadyUsed);
  const result: (Slot & { recipeId: string })[] = [];
  let previous: string | null = null;
  for (const slot of emptySlots) {
    const candidates = recipes.filter((r) => r.meal_types.includes(slot.mealType));
    if (candidates.length === 0) continue;
    let pool = candidates.filter((r) => !used.has(r.id));
    if (pool.length === 0) {
      pool = candidates.filter((r) => r.id !== previous);
      if (pool.length === 0) pool = candidates;
    }
    const pick = pool[Math.floor(random() * pool.length)];
    used.add(pick.id);
    previous = pick.id;
    result.push({ ...slot, recipeId: pick.id });
  }
  return result;
}
