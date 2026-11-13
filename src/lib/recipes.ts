// Порції, залишки складу і ціна порції для каталогу та картки рецепта.
// Без звернень до бази — перевіряється scripts/check-logic.ts.

import { MEAL_TYPES, MEAL_LABELS, type MealType } from "./seed-data.ts";
import { formatQty } from "./shopping.ts";

export type SearchParam = string | string[] | undefined;

export type CatalogState = {
  q: string;
  meal: MealType | null;
  quick: boolean;
  now: boolean;
};

export const CATALOG_MEAL_FILTERS: { meal: MealType; label: string }[] = [
  { meal: "breakfast", label: "Сніданки" },
  { meal: "lunch", label: "Обіди" },
  { meal: "dinner", label: "Вечері" },
  { meal: "snack", label: "Перекуси" },
];

const TODAY_LABEL: Record<MealType, string> = {
  breakfast: "Сьогодні на сніданок",
  lunch: "Сьогодні на обід",
  dinner: "Сьогодні на вечерю",
  snack: "Сьогодні на перекус",
};

/** Ціна в store_products: за 1 кг для «г», за 1 л для «мл», за 1 шт для «шт». */
const PRICE_BASIS: Record<string, number> = {
  "г": 1000,
  "мл": 1000,
  "шт": 1,
};

const MEAL_RANK: Record<string, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  snack: 3,
};

function firstParam(value: SearchParam): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").trim();
}

export function parseCatalogFilters(sp: {
  q?: SearchParam;
  meal?: SearchParam;
  quick?: SearchParam;
  now?: SearchParam;
}): CatalogState {
  const mealRaw = firstParam(sp.meal);
  const meal = (MEAL_TYPES as readonly string[]).includes(mealRaw) ? (mealRaw as MealType) : null;
  return {
    q: firstParam(sp.q).slice(0, 80),
    meal,
    quick: firstParam(sp.quick) === "1",
    now: firstParam(sp.now) === "1",
  };
}

export function catalogHref(state: CatalogState): string {
  const params = new URLSearchParams();
  const q = state.q.trim();
  if (q) params.set("q", q);
  if (state.meal) params.set("meal", state.meal);
  if (state.quick) params.set("quick", "1");
  if (state.now) params.set("now", "1");
  const query = params.toString();
  return query ? `/recipes?${query}` : "/recipes";
}

export type CatalogRecipe = {
  title: string;
  productNames: readonly string[];
  mealTypes: readonly string[];
  cookMinutes: number | null;
  /** null — залишки складу не вдалося прочитати, статус невідомий. */
  missingCount: number | null;
};

export function matchesCatalog(recipe: CatalogRecipe, state: CatalogState): boolean {
  if (state.meal && !recipe.mealTypes.includes(state.meal)) return false;
  if (state.quick && !(recipe.cookMinutes != null && recipe.cookMinutes <= 30)) return false;
  if (state.now && recipe.missingCount !== 0) return false;
  const q = state.q.trim().toLocaleLowerCase("uk");
  if (!q) return true;
  if (recipe.title.toLocaleLowerCase("uk").includes(q)) return true;
  return recipe.productNames.some((name) => name.toLocaleLowerCase("uk").includes(q));
}

export function todayMealLabel(mealType: string): string {
  if ((MEAL_TYPES as readonly string[]).includes(mealType)) return TODAY_LABEL[mealType as MealType];
  return "Сьогодні";
}

export function recipeKindLabel(mealTypes: readonly string[]): string {
  const labels = mealTypes
    .filter((meal): meal is MealType => (MEAL_TYPES as readonly string[]).includes(meal))
    .map((meal) => MEAL_LABELS[meal].toLocaleLowerCase("uk"));
  if (labels.length === 0) return "Рецепт";
  return `Рецепт · ${labels.join(" · ")}`;
}

export function mealTypeForNewEntry(mealTypes: readonly string[]): MealType {
  for (const meal of MEAL_TYPES) {
    if (mealTypes.includes(meal)) return meal;
  }
  return "lunch";
}

/** Лише /, /recipes і /recipes/<uuid>, щоб return_to не став відкритим редіректом. */
export function recipeReturnPath(value: string, fallback: string): string {
  const path = value.trim();
  if (path === "/" || path === "/recipes") return path;
  if (/^\/recipes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path)) return path;
  return fallback;
}

export function pickUncookedToday<T extends { cookedAt: string | null; mealType: string }>(
  entries: readonly T[],
): T | null {
  const open = entries.filter((entry) => !entry.cookedAt);
  if (open.length === 0) return null;
  return [...open].sort((a, b) => (MEAL_RANK[a.mealType] ?? 9) - (MEAL_RANK[b.mealType] ?? 9))[0];
}

export type NamedProduct = { id: string; name: string; unit: string };

export function readProduct(value: unknown): NamedProduct | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const product = row as { id?: unknown; name?: unknown; unit?: unknown };
  if (typeof product.id !== "string" || typeof product.name !== "string" || product.name.length === 0) return null;
  const unit = typeof product.unit === "string" && product.unit.length > 0 ? product.unit : "г";
  return { id: product.id, name: product.name, unit };
}

export type RecipeIngredient = {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  optional: boolean;
};

export function readIngredients(
  rows: readonly { quantity: number | string; optional: boolean; products: unknown }[] | null | undefined,
): RecipeIngredient[] {
  const ingredients: RecipeIngredient[] = [];
  for (const row of rows ?? []) {
    const product = readProduct(row.products);
    const quantity = Number(row.quantity);
    if (!product || !(quantity > 0)) continue;
    ingredients.push({
      productId: product.id,
      name: product.name,
      unit: product.unit,
      quantity,
      optional: Boolean(row.optional),
    });
  }
  return ingredients;
}

/** Кількість на сім'ю, як у списанні: округлення до сотих на кожен рядок. */
export function scaledNeed(quantity: number, baseServings: number, portions: number): number {
  const base = baseServings > 0 ? baseServings : 1;
  return Math.round(quantity * (portions / base) * 100) / 100;
}

export type CoveredIngredient = RecipeIngredient & {
  needed: number;
  have: number;
  lacks: boolean;
  short: boolean;
};

export function coverIngredients(
  ingredients: readonly RecipeIngredient[],
  baseServings: number,
  portions: number,
  stock: ReadonlyMap<string, number>,
): CoveredIngredient[] {
  const groups = new Map<string, CoveredIngredient>();
  const order: string[] = [];
  for (const ingredient of ingredients) {
    const needed = scaledNeed(ingredient.quantity, baseServings, portions);
    const key = `${ingredient.optional ? "1" : "0"}:${ingredient.productId}`;
    const prev = groups.get(key);
    if (!prev) {
      groups.set(key, {
        ...ingredient,
        needed,
        have: stock.get(ingredient.productId) ?? 0,
        lacks: false,
        short: false,
      });
      order.push(key);
    } else {
      prev.quantity = Math.round((prev.quantity + ingredient.quantity) * 100) / 100;
      prev.needed = Math.round((prev.needed + needed) * 100) / 100;
    }
  }
  for (const item of groups.values()) {
    item.lacks = item.have + 1e-9 < item.needed;
    item.short = !item.optional && item.lacks;
  }
  return order.map((key) => groups.get(key)!);
}

export function countMissing(items: readonly { short: boolean }[]): number {
  return items.reduce((count, item) => count + (item.short ? 1 : 0), 0);
}

export function availabilityLabel(have: number, needed: number, unit: string): string {
  if (have + 1e-9 >= needed) return `є ${formatQty(have, unit)}`;
  const short = Math.round((needed - have) * 100) / 100;
  if (short <= 0) return "бракує";
  return `бракує ${formatQty(short, unit)}`;
}

export type PriceQuote = {
  productId: string;
  price: number | string | null;
  updatedAt: string | null;
};

/** Найсвіжіша відома ціна продукту. Негативні й порожні ціни ігноруються. */
export function freshestPrices(quotes: readonly PriceQuote[]): Map<string, number> {
  const best = new Map<string, { price: number; at: number }>();
  for (const quote of quotes) {
    if (!quote.productId || quote.price == null || quote.price === "") continue;
    const price = typeof quote.price === "number" ? quote.price : Number(quote.price);
    if (!Number.isFinite(price) || price < 0) continue;
    const parsed = quote.updatedAt ? Date.parse(quote.updatedAt) : Number.NaN;
    const at = Number.isNaN(parsed) ? 0 : parsed;
    const prev = best.get(quote.productId);
    if (!prev || at >= prev.at) best.set(quote.productId, { price, at });
  }
  return new Map([...best].map(([id, row]) => [id, row.price]));
}

/**
 * Ціна однієї дорослої порції.
 * null, якщо хоч в одного обов'язкового продукту немає ціни або обов'язкових продуктів немає.
 * Необов'язкові продукти на ціну не впливають.
 */
export function portionPriceUah(
  baseServings: number,
  ingredients: readonly { productId: string; quantity: number; optional: boolean; unit: string }[],
  prices: ReadonlyMap<string, number>,
): number | null {
  if (!(baseServings > 0)) return null;
  const required = ingredients.filter((ingredient) => !ingredient.optional);
  if (required.length === 0) return null;
  let total = 0;
  for (const ingredient of required) {
    const price = prices.get(ingredient.productId);
    if (price == null) return null;
    const basis = PRICE_BASIS[ingredient.unit] ?? 1;
    total += (ingredient.quantity / basis) * price;
  }
  return Math.round((total / baseServings) * 100) / 100;
}

export function formatPortionPrice(amount: number): string {
  return `≈ ${Math.round(amount).toLocaleString("uk-UA")} ₴`;
}

export function formatPortions(amount: number): string {
  return amount.toLocaleString("uk-UA", { maximumFractionDigits: 2 });
}

export function stockMap(rows: readonly { productId: string; quantity: number | string }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const quantity = Number(row.quantity);
    if (row.productId && Number.isFinite(quantity)) map.set(row.productId, quantity);
  }
  return map;
}
