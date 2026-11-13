// Чиста логіка: порції, список покупок, автозаповнення меню. Без залежностей — тестується scripts/check-logic.ts

import { pantryCoveragePercent } from "./menu.ts";

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
  stock: Map<string, number> = new Map(),
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
  return [...totals]
    // купуємо лише те, чого бракує понад запаси
    .map(([productId, q]) => [productId, q - (stock.get(productId) ?? 0)] as const)
    .filter(([, missing]) => missing > 0)
    .map(([productId, missing]) => {
      const p = products.get(productId)!;
      return { productId, quantity: roundQty(missing, p.unit), unit: p.unit, storeId: p.storeId };
    });
}

/** Скільки кожного продукту йде на одну страву з меню (без округлення, без необов'язкових). */
export function ingredientUsage(line: PlanLine, portions: number): { productId: string; quantity: number }[] {
  const scale = (line.servings ?? portions) / line.baseServings;
  return line.ingredients
    .filter((i) => !i.optional)
    .map((i) => ({ productId: i.productId, quantity: Math.round(i.quantity * scale * 100) / 100 }));
}

export type Slot = { date: string; mealType: string };

export type AutoFillContext = {
  portions: number;
  stock: Map<string, number>;
  products: Map<string, ProductInfo>;
  needs: Map<string, PlanLine[]>;
  recipeEquipment: Map<string, string[]>;
  equipment: Set<string>;
};

/**
 * Визначає необхідну для рецепта техніку за згадками назв зі SEED_EQUIPMENT
 * та очевидних синонімів у тексті опису та інструкцій.
 * Порівняння без регістру та без регулярних виразів з уведенням користувача.
 */
export function requiredEquipment(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  const lower = text.toLowerCase();
  const words = lower.split(/[^a-zа-яіїєґ0-9]+/i);
  const result: string[] = [];

  const add = (name: string) => {
    if (!result.includes(name)) result.push(name);
  };

  if (
    lower.includes("духов") ||
    lower.includes("запект") ||
    lower.includes("запікат") ||
    lower.includes("запече") ||
    lower.includes("випікат") ||
    lower.includes("випект")
  ) {
    add("Духовка");
  }

  if (lower.includes("блендер")) {
    add("Блендер");
  }

  if (lower.includes("мікрохвильов") || words.includes("свч")) {
    add("Мікрохвильовка");
  }

  if (
    words.some((w) => w === "плита" || w === "плиті" || w === "плиту" || w === "плити" || w === "плитою" || w === "плитах") ||
    lower.includes("на плиті") ||
    lower.includes("на плиту") ||
    lower.includes("варильн") ||
    lower.includes("варочн")
  ) {
    add("Плита");
  }

  if (lower.includes("мультиварк")) {
    add("Мультиварка");
  }

  if (lower.includes("фритюр")) {
    add("Фритюрниця");
  }

  if (lower.includes("аерогриль") || lower.includes("аерогрилі")) {
    add("Аерогриль");
  } else if (
    lower.includes("гриль") ||
    lower.includes("грилі") ||
    lower.includes("гриля") ||
    lower.includes("грилю") ||
    lower.includes("грилем")
  ) {
    add("Гриль");
  }

  return result;
}

function hasAvailableEquipment(
  recipeId: string,
  context: AutoFillContext | undefined,
  normalizedEquipment: Set<string>,
): boolean {
  if (!context) return true;
  const required = context.recipeEquipment.get(recipeId);
  if (!required || required.length === 0) return true;
  return required.every((eq) => normalizedEquipment.has(eq.toLowerCase().trim()));
}

function recipeCoverage(recipeId: string, context: AutoFillContext | undefined): number {
  if (!context) return 0;
  const lines = context.needs.get(recipeId);
  if (!lines || lines.length === 0) return 0;
  const hasIngredients = lines.some((l) => l.ingredients.length > 0);
  if (!hasIngredients) return 0;
  const percent = pantryCoveragePercent(lines, context.portions, context.products, context.stock);
  return percent ?? 100;
}

/**
 * Заповнює порожні слоти рецептами відповідного типу.
 * Правила вибору для слота:
 * 1. Кандидати за meal_type
 * 2. Відкинути ті, яким потрібна відсутня техніка (якщо після цього кандидатів немає — повертаються всі)
 * 3. Перевага невикористаним на тижні, без повторів підряд
 * 4. Впорядкування за покриттям складу (вище покриття — раніше)
 * 5. Випадковість як tie-break між однаковими
 */
export function autoFill(
  emptySlots: Slot[],
  recipes: { id: string; meal_types: string[] }[],
  alreadyUsed: string[],
  contextOrRandom?: AutoFillContext | (() => number),
  random: () => number = Math.random,
): (Slot & { recipeId: string })[] {
  const context =
    typeof contextOrRandom === "object" && contextOrRandom !== null
      ? contextOrRandom
      : undefined;
  const rand = typeof contextOrRandom === "function" ? contextOrRandom : random;

  const normalizedEquipment = new Set(
    Array.from(context?.equipment ?? []).map((e) => e.toLowerCase().trim()),
  );

  const used = new Set(alreadyUsed);
  const result: (Slot & { recipeId: string })[] = [];
  let previous: string | null = null;

  for (const slot of emptySlots) {
    const candidates = recipes.filter((r) => r.meal_types.includes(slot.mealType));
    if (candidates.length === 0) continue;

    const equipped = candidates.filter((r) =>
      hasAvailableEquipment(r.id, context, normalizedEquipment),
    );
    const eligible = equipped.length > 0 ? equipped : candidates;

    let pool = eligible.filter((r) => !used.has(r.id));
    if (pool.length === 0) {
      pool = eligible.filter((r) => r.id !== previous);
      if (pool.length === 0) pool = eligible;
    }

    const scored = pool.map((r) => ({
      recipe: r,
      coverage: recipeCoverage(r.id, context),
    }));

    let maxCoverage = -Infinity;
    for (const item of scored) {
      if (item.coverage > maxCoverage) {
        maxCoverage = item.coverage;
      }
    }
    const topCandidates = scored
      .filter((item) => item.coverage === maxCoverage)
      .map((item) => item.recipe);

    const pick = topCandidates[Math.floor(rand() * topCandidates.length)];
    used.add(pick.id);
    previous = pick.id;
    result.push({ ...slot, recipeId: pick.id });
  }

  return result;
}

/** Рядок ручного пункту списку покупок. Той самий запис, що й форма в застосунку. */
export function manualShoppingRow(input: {
  householdId: string;
  weekStart: string;
  title: string;
  productId?: string | null;
  quantity?: number | null;
  unit?: string | null;
}) {
  return {
    household_id: input.householdId,
    week_start: input.weekStart,
    title: input.title,
    product_id: input.productId ?? null,
    quantity: input.quantity ?? null,
    unit: input.unit ?? null,
    source: "manual" as const,
    checked: false,
  };
}
