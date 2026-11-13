// Чиста логіка побудови моделі для головної сторінки «Огляд» (/).
// Без звернень до бази — тестується у scripts/check-logic.ts.

import {
  formatDate,
  formatWeekday,
  weekStart,
} from "./dates.ts";
import {
  chartWeekLabel,
  chartWeekStarts,
  daysInclusive,
  elapsedInRange,
  formatUah,
  monthEnd,
  monthLocativeUk,
  monthStart,
  paceDifference,
  paceDifferenceNote,
  sumBetween,
  toDatedAmounts,
  totalsByWeek,
  type FinanceReceipt,
} from "./finance.ts";
import {
  dishStockStatus,
  isMenuSlot,
  summarizeMenu,
  type DishStatus,
} from "./menu.ts";
import {
  calculateScalePercent,
  formatExpiryNote,
  isExpiringSoon,
  isLowStock,
  pluralizePositions,
  type StorageZone,
} from "./pantry.ts";
import {
  calculateItemEstimatedPrice,
  StorePriceIndex,
  type ReceiptInput,
  type ReceiptItemInput,
  type StoreInput,
  type StoreProductInput,
} from "./prices.ts";
import { pickUncookedToday } from "./recipes.ts";
import {
  countUncertain,
  formatScanWhen,
  inputTypeLabel,
  queueTitle,
} from "./scan/present.ts";
import type { InboxScan } from "./scan/inbox.ts";
import { formatQty, type PlanLine, type ProductInfo } from "./shopping.ts";
import type {
  HomeAlertView,
  HomeMealView,
  HomeModel,
  HomePendingScan,
  HomeScanView,
  HomeWeekView,
} from "@/components/home/types";

export type DbIngredientRow = {
  product_id: string;
  quantity: number | string;
  optional: boolean;
};

export type DbRecipeRef = {
  id: string;
  title: string;
  cook_minutes: number | null;
  base_servings: number | string;
  recipe_ingredients: DbIngredientRow[] | null;
};

export type DbMealEntry = {
  id: string;
  plan_date: string;
  meal_type: string;
  title: string | null;
  cooked_at: string | null;
  servings: number | string | null;
  recipes: DbRecipeRef | DbRecipeRef[] | null;
};

export type DbPantryRow = {
  id: string;
  product_id: string;
  quantity: number | string;
  storage_zone: string;
  expires_at: string | null;
  products: {
    id: string;
    name: string;
    category: string;
    unit: string;
    is_staple?: boolean;
    preferred_store_id?: string | null;
  } | null;
};

export type DbShoppingItemRow = {
  id: string;
  title: string | null;
  quantity: number | string | null;
  unit: string | null;
  store_id: string | null;
  checked: boolean;
  stocked_at: string | null;
  product_id: string | null;
  products: {
    id: string;
    name: string;
    category: string;
    unit: string;
    preferred_store_id: string | null;
  } | null;
};

export type BuildHomeModelInput = {
  today: string;
  familyCount: number;
  portions: number;
  finance: {
    budget: number | null;
    receipts: readonly FinanceReceipt[];
    householdCount: number;
  };
  menu: {
    entries: readonly DbMealEntry[];
    products: ReadonlyMap<string, ProductInfo>;
    names: ReadonlyMap<string, string>;
    stock: ReadonlyMap<string, number>;
  };
  pantry: {
    items: readonly DbPantryRow[];
    historicalMaxMap: ReadonlyMap<string, number>;
  };
  shopping: {
    items: readonly DbShoppingItemRow[];
    stores: readonly StoreInput[];
    storeProducts: readonly StoreProductInput[];
    receipts: readonly ReceiptInput[];
    receiptItems: readonly ReceiptItemInput[];
  };
  scans: {
    inboxScans: readonly InboxScan[];
    now: Date;
  };
};

const SLOT_ORDER: Record<string, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
};

const SLOT_TITLE: Record<string, string> = {
  breakfast: "Сніданок",
  lunch: "Обід",
  dinner: "Вечеря",
};

function oneRecipe(value: DbRecipeRef | DbRecipeRef[] | null): DbRecipeRef | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function toPlanLine(entry: DbMealEntry): PlanLine | null {
  const recipe = oneRecipe(entry.recipes);
  if (!recipe) return null;
  const base = Number(recipe.base_servings);
  return {
    servings: entry.servings === null ? null : Number(entry.servings),
    baseServings: Number.isFinite(base) && base > 0 ? base : 1,
    ingredients: (recipe.recipe_ingredients ?? []).map((item) => ({
      productId: item.product_id,
      quantity: Number(item.quantity),
      optional: Boolean(item.optional),
    })),
  };
}

function storesLabel(names: readonly string[]): string {
  if (names.length === 0) return "Без магазину";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} та ${names[1]}`;
  return `${names.length} магазини`;
}

export function buildHomeModel(input: BuildHomeModelInput): HomeModel {
  const { today, familyCount, portions, finance, menu, pantry, shopping, scans } = input;

  // 1. Шапка
  const dateLabel = `${formatWeekday(today)}, ${formatDate(today)}`;

  // 2. Фінанси
  const currentMonth = { start: monthStart(today), end: monthEnd(today) };
  const datedAmounts = toDatedAmounts(finance.receipts);
  const monthSpent = sumBetween(datedAmounts, currentMonth);
  const todaySpent = sumBetween(datedAmounts, { start: today, end: today });
  const hasBudget = finance.budget !== null && finance.budget > 0;
  const elapsed = elapsedInRange(currentMonth.start, currentMonth.end, today);
  const span = daysInclusive(currentMonth.start, currentMonth.end);
  const progressPercent =
    hasBudget && finance.budget ? Math.min(100, Math.round((monthSpent / finance.budget) * 100)) : 0;
  const paceDiff = paceDifference(monthSpent, finance.budget, elapsed, span);
  const paceNote = paceDifferenceNote(paceDiff);
  const monthLabel = `Витрачено в ${monthLocativeUk(today)}`;

  // 3. Графік витрат по тижнях (останні 5 тижнів)
  const weekStarts = chartWeekStarts("week", today, today);
  const weekSums = totalsByWeek(datedAmounts, weekStarts);
  const maxWeekSum = Math.max(0, ...weekSums);
  const currWeekStart = weekStart(today);
  const weeks: HomeWeekView[] = weekStarts.map((start, index) => {
    const sum = weekSums[index] ?? 0;
    const isCurrent = start === currWeekStart;
    const barHeight = maxWeekSum > 0 && sum > 0 ? Math.max(6, Math.round((sum / maxWeekSum) * 140)) : 6;
    return {
      start,
      label: chartWeekLabel(start, today),
      sum,
      isCurrent,
      barHeight,
    };
  });

  // 4. Меню тижня
  const productInfoMap = new Map(menu.products);
  const stockMap = new Map(menu.stock);

  const processedDishes: {
    cooked: boolean;
    line: PlanLine | null;
    meal: HomeMealView;
    planDate: string;
    productIds: string[];
  }[] = [];

  for (const entry of menu.entries) {
    if (!isMenuSlot(entry.meal_type)) continue;
    const recipe = oneRecipe(entry.recipes);
    const line = toPlanLine(entry);
    const cooked = Boolean(entry.cooked_at);
    const status: DishStatus = dishStockStatus({ cooked, line }, portions, productInfoMap, stockMap);
    const title = recipe?.title ?? entry.title ?? "Страва";
    const minutes = recipe?.cook_minutes ?? null;
    const missingNames = status.missingProductIds
      .map((id) => menu.names.get(id) ?? "продукт")
      .filter(Boolean);

    let meta = "";
    if (cooked) {
      meta = minutes ? `${minutes} хв · продукти списано` : "продукти списано";
    } else if (status.kind === "ready") {
      meta = minutes ? `${minutes} хв · усе є на складі` : "усе є на складі";
    } else if (missingNames.length > 0) {
      const missingList = missingNames.slice(0, 2).join(" і ");
      meta = minutes ? `${minutes} хв · немає ${missingList}` : `немає ${missingList}`;
    }

    const productIds = line ? line.ingredients.map((i) => i.productId) : [];

    processedDishes.push({
      cooked,
      line,
      planDate: entry.plan_date,
      productIds,
      meal: {
        id: entry.id,
        slot: entry.meal_type as "breakfast" | "lunch" | "dinner",
        slotLabel: SLOT_TITLE[entry.meal_type] ?? "Страва",
        title,
        minutes,
        meta,
        status,
        isNextUncooked: false,
      },
    });
  }

  const menuSummary = summarizeMenu(
    processedDishes.map((d) => ({ cooked: d.cooked, line: d.line })),
    portions,
    productInfoMap,
    stockMap,
  );

  const todayMealsDishes = processedDishes
    .filter((d) => d.planDate === today)
    .sort((a, b) => (SLOT_ORDER[a.meal.slot] ?? 9) - (SLOT_ORDER[b.meal.slot] ?? 9));

  const uncookedToday = pickUncookedToday(
    todayMealsDishes.map((d) => ({
      id: d.meal.id,
      cookedAt: d.cooked ? "yes" : null,
      mealType: d.meal.slot,
    })),
  );

  const nextMealDish = uncookedToday
    ? todayMealsDishes.find((d) => d.meal.id === uncookedToday.id) ?? null
    : null;

  const todayMeals: HomeMealView[] = todayMealsDishes.map((d) => ({
    ...d.meal,
    isNextUncooked: nextMealDish?.meal.id === d.meal.id,
  }));

  const nextMeal = nextMealDish ? { ...nextMealDish.meal, isNextUncooked: true } : null;

  let subsequentMeal: HomeMealView | null = null;
  if (nextMealDish) {
    const nextIndex = todayMealsDishes.findIndex((d) => d.meal.id === nextMealDish.meal.id);
    const sub = todayMealsDishes.slice(nextIndex + 1).find((d) => !d.cooked);
    if (sub) subsequentMeal = sub.meal;
  }

  const todayProductIds = new Set(todayMealsDishes.flatMap((d) => d.productIds));

  // 5. Покупки
  const priceIndex = new StorePriceIndex(
    [...shopping.stores],
    [...shopping.receipts],
    [...shopping.receiptItems],
    [...shopping.storeProducts],
  );

  const activeShoppingItems = shopping.items.filter((item) => !item.stocked_at && !item.checked);
  const shoppingProductIds = new Set(
    shopping.items.map((i) => i.product_id).filter((id): id is string => Boolean(id)),
  );

  const pricedItems = activeShoppingItems.map((item) => {
    const qty = item.quantity !== null ? Number(item.quantity) : null;
    const storeId = item.store_id ?? item.products?.preferred_store_id ?? null;
    const pricePerBasis = priceIndex.getPrice(storeId, item.product_id);
    const estimatedPrice = calculateItemEstimatedPrice(qty, item.unit, pricePerBasis);
    return { ...item, estimatedPrice };
  });

  const toBuySum = pricedItems.reduce((acc, i) => acc + (i.estimatedPrice ?? 0), 0);
  const toBuyCount =
    activeShoppingItems.length > 0 ? activeShoppingItems.length : menuSummary.toBuyCount;

  const storeMap = new Map(shopping.stores.map((s) => [s.id, s.name]));
  const activeStoreNames = [
    ...new Set(
      activeShoppingItems
        .map((i) => (i.store_id ? storeMap.get(i.store_id) : null))
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  const storesSummary =
    activeStoreNames.length > 0
      ? storesLabel(activeStoreNames)
      : shopping.stores.length > 0
        ? storesLabel(shopping.stores.slice(0, 2).map((s) => s.name))
        : "список покупок";

  // 6. Склад і сповіщення
  const totalPantryCount = pantry.items.length;
  let lowCount = 0;
  let expiringCount = 0;
  const alertCandidates: HomeAlertView[] = [];

  for (const item of pantry.items) {
    const qty = Number(item.quantity);
    const unit = item.products?.unit ?? "г";
    const name = item.products?.name ?? "Продукт";
    const histMax = pantry.historicalMaxMap.get(item.product_id);
    const scalePercent = calculateScalePercent(qty, unit, histMax);
    const isLow = isLowStock(scalePercent);
    const isExpiring = isExpiringSoon(item.expires_at, today, 3);
    const storageZone = (item.storage_zone as StorageZone) || "fridge";

    if (isLow) lowCount += 1;
    if (isExpiring) expiringCount += 1;

    if (isExpiring || isLow) {
      let note = "";
      if (isExpiring && item.expires_at) {
        const exp = formatExpiryNote(item.expires_at, today);
        note = todayProductIds.has(item.product_id)
          ? `${exp} — у меню на сьогодні`
          : exp;
      } else if (isLow) {
        note = shoppingProductIds.has(item.product_id)
          ? "Мало · уже в списку покупок"
          : "Мало";
      }

      alertCandidates.push({
        id: item.id,
        productId: item.product_id,
        name,
        qty: formatQty(qty, unit),
        storageZone,
        scalePercent,
        isExpiring,
        isLow,
        note,
      });
    }
  }

  alertCandidates.sort((a, b) => {
    if (a.isExpiring !== b.isExpiring) return Number(b.isExpiring) - Number(a.isExpiring);
    return a.scalePercent - b.scalePercent;
  });

  const alerts = alertCandidates.slice(0, 5);

  // 7. Скани
  const recentScans: HomeScanView[] = scans.inboxScans.slice(0, 4).map((s) => {
    let title = "";
    if (s.inputType === "receipt") {
      title = queueTitle(s.inputType, s.storeName, s.channel, s.senderName);
      if (s.total) title += ` · ${formatUah(s.total)}`;
    } else {
      title = `${inputTypeLabel(s.inputType)} · ${pluralizePositions(s.items.length)}`;
      if (s.senderName) title += ` · від ${s.senderName}`;
    }

    let note = "";
    if (s.status === "pending") {
      const uncertain = countUncertain(s.items);
      note = `Чекає перевірки · ${pluralizePositions(s.items.length)}${uncertain > 0 ? `, ${uncertain} під питанням` : ""}`;
    } else if (s.status === "confirmed") {
      note = `${pluralizePositions(s.items.length)} на склад`;
    } else {
      note = "Відхилено";
    }

    return {
      id: s.id,
      time: formatScanWhen(s.createdAt, scans.now),
      title,
      note,
      status: s.status,
    };
  });

  const pending = scans.inboxScans.find((s) => s.status === "pending");
  let pendingScan: HomePendingScan | null = null;
  if (pending) {
    const uncertain = countUncertain(pending.items);
    let title = "";
    if (pending.inputType === "receipt") {
      title = `Чек${pending.storeName ? ` із ${pending.storeName}` : ""} чекає перевірки`;
    } else {
      title = `${inputTypeLabel(pending.inputType)} чекає перевірки`;
    }
    const note = `${pluralizePositions(pending.items.length)}${uncertain > 0 ? ` · ${uncertain} під питанням` : ""}`;

    pendingScan = {
      id: pending.id,
      title,
      note,
      uncertainCount: uncertain,
      itemCount: pending.items.length,
    };
  }

  return {
    today,
    dateLabel,
    familyCount,
    portions,
    finance: {
      hasBudget,
      budget: finance.budget,
      monthSpent,
      monthLabel,
      progressPercent,
      paceNote,
      todaySpent,
      receiptCount: finance.householdCount,
    },
    pantry: {
      totalCount: totalPantryCount,
      lowCount,
      expiringCount,
      alerts,
    },
    menu: {
      hasMenu: processedDishes.length > 0,
      cookedCount: menuSummary.cookedCount,
      plannedCount: menuSummary.plannedCount,
      emptySlotsCount: Math.max(0, 21 - processedDishes.length),
      todayMeals,
      nextMeal,
      subsequentMeal,
    },
    shopping: {
      toBuyCount,
      toBuySum,
      storesSummary,
      storesCount: activeStoreNames.length,
    },
    weeks,
    recentScans,
    pendingScan,
  };
}
