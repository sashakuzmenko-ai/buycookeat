// node scripts/check-logic.ts — перевірка розрахунку порцій, списку покупок і автозаповнення
import assert from "node:assert/strict";
import { autoFill, buildShoppingList, formatQty, householdPortions, ingredientUsage, roundCooking, roundQty } from "../src/lib/shopping.ts";
import { dayMarkFromSlots, dishStockStatus, pantryCoveragePercent, positionCountLabel, summarizeMenu } from "../src/lib/menu.ts";
import {
  availabilityLabel,
  catalogHref,
  coverIngredients,
  formatPortionPrice,
  freshestPrices,
  matchesCatalog,
  mealTypeForNewEntry,
  parseCatalogFilters,
  pickUncookedToday,
  portionPriceUah,
  recipeReturnPath,
  scaledNeed,
} from "../src/lib/recipes.ts";
import { addDays, weekDays, weekStart } from "../src/lib/dates.ts";
import {
  FORECAST_MIN_ELAPSED_DAYS,
  amountOf,
  averageReceipt,
  budgetRemaining,
  categoryTotals,
  daysInMonth,
  daysInYear,
  forecastState,
  formatShare,
  formatUah,
  monthForecast,
  monthTitle,
  pace,
  parseMoney,
  parsePeriod,
  periodTitle,
  priceChanges,
  readBudget,
  shiftAnchor,
  storeTotals,
  summarizePeriod,
  totalsByMonth,
  totalsByWeek,
  type DatedLine,
} from "../src/lib/finance.ts";
import { SEED_FAMILY, SEED_PRODUCTS, SEED_RECIPES, SEED_STORES, SEED_EQUIPMENT } from "../src/lib/seed-data.ts";
import {
  pluralizePositions,
  calculateScalePercent,
  isLowStock,
  daysUntilExpiry,
  isExpiringSoon,
  formatExpiryNote,
  determineItemState,
  calculateWeekSufficiency,
  formatMovements,
  type MovementInput,
} from "../src/lib/pantry.ts";
import { MAIN_NAV_ITEMS, MORE_NAV_ITEMS, isRouteActive, isMoreActive } from "../src/components/shell/nav-items.ts";

// навігація: вісім розділів у бічній панелі та їх порядок
assert.deepEqual(
  MAIN_NAV_ITEMS.map((i) => i.name),
  ["Огляд", "Меню", "Рецепти", "Склад", "Магазини", "Фінанси", "Сім'я", "Скан"],
);
assert.deepEqual(
  MAIN_NAV_ITEMS.map((i) => i.href),
  ["/", "/menu", "/recipes", "/pantry", "/shopping", "/finance", "/settings", "/scan"],
);
assert.deepEqual(
  MORE_NAV_ITEMS.map((i) => i.name),
  ["Рецепти", "Магазини", "Фінанси", "Сім'я", "Продукти"],
);
assert.deepEqual(
  MORE_NAV_ITEMS.map((i) => i.href),
  ["/recipes", "/shopping", "/finance", "/settings", "/products"],
);
// активність маршрутів
assert.equal(isRouteActive("/", "/"), true);
assert.equal(isRouteActive("/", "/menu"), false);
assert.equal(isRouteActive("/menu", "/menu"), true);
assert.equal(isRouteActive("/recipes", "/recipes/xyz"), true);
assert.equal(isMoreActive("/recipes"), true);
assert.equal(isMoreActive("/products"), true);
assert.equal(isMoreActive("/menu"), false);
assert.equal(isMoreActive("/"), false);

// порції: 1 + 1 + 0.55 + 0.3
assert.equal(householdPortions([...SEED_FAMILY]), 2.85);

// округлення
assert.equal(roundQty(213.7, "г"), 210);
assert.equal(roundQty(3, "г"), 10);
assert.equal(roundQty(1.43, "шт"), 1.5);
assert.equal(roundQty(2, "шт"), 2);
assert.equal(roundCooking(0.36, "г"), 1); // лавровий лист
assert.equal(roundCooking(5.3, "г"), 5);
assert.equal(roundCooking(178, "г"), 180);
assert.equal(roundCooking(0.71, "шт"), 0.5);
assert.equal(formatQty(1500, "г").replace(/\s/g, " "), "1,5 кг");
assert.equal(formatQty(6, "шт"), "6 шт");

// список покупок: два рецепти з картоплею, сіль — базовий запас, сметана — необов'язкова
const products = new Map([
  ["potato", { unit: "г", isStaple: false, storeId: null }],
  ["chicken", { unit: "г", isStaple: false, storeId: "silpo" }],
  ["eggs", { unit: "шт", isStaple: false, storeId: null }],
  ["salt", { unit: "г", isStaple: true, storeId: null }],
  ["sour", { unit: "г", isStaple: false, storeId: null }],
]);
const list = buildShoppingList(
  [
    { servings: null, baseServings: 4, ingredients: [
      { productId: "potato", quantity: 1000, optional: false },
      { productId: "chicken", quantity: 900, optional: false },
      { productId: "salt", quantity: 12, optional: false },
    ] },
    { servings: 4, baseServings: 4, ingredients: [
      { productId: "potato", quantity: 1200, optional: false },
      { productId: "eggs", quantity: 2, optional: false },
      { productId: "sour", quantity: 200, optional: true },
    ] },
  ],
  2.85,
  products,
);
const byId = Object.fromEntries(list.map((l) => [l.productId, l]));
assert.equal(byId.potato.quantity, 1910); // 1000*2.85/4 + 1200 = 1912.5 → 1910
assert.equal(byId.chicken.quantity, 640); // 900*2.85/4 = 641.25 → 640
assert.equal(byId.chicken.storeId, "silpo");
assert.equal(byId.eggs.quantity, 2);
assert.equal(byId.salt, undefined);
assert.equal(byId.sour, undefined);

// запаси зменшують список: картоплі треба 1912,5 г, вдома 1500 → купити 410; яєць вистачає
const plan = [
  { servings: null, baseServings: 4, ingredients: [
    { productId: "potato", quantity: 1000, optional: false },
    { productId: "chicken", quantity: 900, optional: false },
  ] },
  { servings: 4, baseServings: 4, ingredients: [
    { productId: "potato", quantity: 1200, optional: false },
    { productId: "eggs", quantity: 2, optional: false },
    { productId: "sour", quantity: 200, optional: true },
  ] },
];
const withStock = buildShoppingList(plan, 2.85, products, new Map([["potato", 1500], ["eggs", 10]]));
const stocked = Object.fromEntries(withStock.map((l) => [l.productId, l.quantity]));
assert.equal(stocked.potato, 410);
assert.equal(stocked.eggs, undefined);
assert.equal(stocked.chicken, 640);

// списання на одну страву: точні кількості, без необов'язкових
assert.deepEqual(ingredientUsage(plan[0], 2.85), [
  { productId: "potato", quantity: 712.5 },
  { productId: "chicken", quantity: 641.25 },
]);
assert.deepEqual(ingredientUsage(plan[1], 2.85).map((u) => u.productId), ["potato", "eggs"]);

// дати
assert.equal(weekStart("2026-11-10"), "2026-11-09"); // вівторок → понеділок
assert.equal(weekStart("2026-11-15"), "2026-11-09"); // неділя
assert.equal(addDays("2026-12-31", 1), "2027-01-01");
assert.equal(weekDays("2026-11-09").length, 7);

// автозаповнення: без повторів, поки вистачає рецептів
const recipes = [
  { id: "a", meal_types: ["dinner"] },
  { id: "b", meal_types: ["dinner"] },
  { id: "c", meal_types: ["dinner", "lunch"] },
  { id: "d", meal_types: ["breakfast"] },
];
const slots = ["2026-11-09", "2026-11-10", "2026-11-11"].map((date) => ({ date, mealType: "dinner" }));
const filled = autoFill(slots, recipes, []);
assert.equal(new Set(filled.map((f) => f.recipeId)).size, 3);
const breakfasts = autoFill(
  [{ date: "x", mealType: "breakfast" }, { date: "y", mealType: "breakfast" }, { date: "z", mealType: "snack" }],
  recipes,
  [],
);
assert.deepEqual(breakfasts.map((f) => f.recipeId), ["d", "d"]); // єдиний сніданок повторюється, перекусів немає

// цілісність стартових даних
const names = new Set(SEED_PRODUCTS.map((p) => p[0]));
assert.equal(names.size, SEED_PRODUCTS.length, "дублікати продуктів");
const storeNames = new Set<string>(SEED_STORES.map((s) => s.name));
for (const p of SEED_PRODUCTS) if (p[4]) assert.ok(storeNames.has(p[4]), `невідомий магазин: ${p[4]}`);
const equipment = new Set<string>(SEED_EQUIPMENT);
for (const r of SEED_RECIPES) {
  for (const [name, qty] of r.ingredients) {
    assert.ok(names.has(name), `${r.title}: немає продукту «${name}»`);
    assert.ok(qty > 0);
  }
  for (const e of r.equipment ?? []) assert.ok(equipment.has(e), `${r.title}: немає техніки «${e}»`);
}

// меню: статус страви від залишків, покриття тижня і кількість позицій до покупки
const menuProducts = new Map([
  ["potato", { unit: "г", isStaple: false, storeId: null }],
  ["salt", { unit: "г", isStaple: true, storeId: null }],
  ["sour", { unit: "г", isStaple: false, storeId: null }],
  ["milk", { unit: "мл", isStaple: false, storeId: null }],
]);
const menuLine = {
  servings: null,
  baseServings: 4,
  ingredients: [
    { productId: "potato", quantity: 400, optional: false },
    { productId: "salt", quantity: 20, optional: false },
    { productId: "sour", quantity: 50, optional: true },
    { productId: "milk", quantity: 200, optional: false },
  ],
};
const shortStock = new Map([["potato", 200], ["milk", 40]]);
const shortDish = dishStockStatus({ cooked: false, line: menuLine }, 2, menuProducts, shortStock);
assert.equal(shortDish.kind, "missing");
assert.equal(shortDish.missingCount, 1);
assert.deepEqual([...shortDish.missingProductIds], ["milk"]);
assert.equal(dishStockStatus({ cooked: true, line: menuLine }, 2, menuProducts, shortStock).kind, "cooked");
assert.equal(
  dishStockStatus({ cooked: false, line: menuLine }, 2, menuProducts, new Map([["potato", 200], ["milk", 100]])).kind,
  "ready",
);
assert.equal(dishStockStatus({ cooked: false, line: null }, 2, menuProducts, shortStock).kind, "ready");
assert.deepEqual(
  dishStockStatus({ cooked: false, line: menuLine }, 2, menuProducts, new Map()).missingProductIds,
  ["potato", "milk"],
);
const saltOnly = {
  servings: 1,
  baseServings: 1,
  ingredients: [{ productId: "salt", quantity: 10, optional: false }],
};
assert.equal(dishStockStatus({ cooked: false, line: saltOnly }, 1, menuProducts, new Map()).kind, "ready");
assert.equal(pantryCoveragePercent([saltOnly], 1, menuProducts, new Map()), null);

const weekSummary = summarizeMenu(
  [
    { cooked: false, line: menuLine },
    { cooked: true, line: menuLine },
    { cooked: false, line: null },
  ],
  2,
  menuProducts,
  shortStock,
);
assert.equal(weekSummary.coveragePercent, 70);
assert.equal(weekSummary.cookedCount, 1);
assert.equal(weekSummary.plannedCount, 3);
assert.equal(weekSummary.toBuyCount, 1);

const potatoDish = {
  servings: null,
  baseServings: 1,
  ingredients: [{ productId: "potato", quantity: 200, optional: false }],
};
const shared = summarizeMenu(
  [
    { cooked: false, line: potatoDish },
    { cooked: false, line: potatoDish },
  ],
  1,
  menuProducts,
  new Map([["potato", 200]]),
);
assert.equal(dishStockStatus({ cooked: false, line: potatoDish }, 1, menuProducts, new Map([["potato", 200]])).kind, "ready");
assert.equal(shared.coveragePercent, 50);
assert.equal(shared.toBuyCount, 1);
assert.equal(summarizeMenu([{ cooked: true, line: potatoDish }], 1, menuProducts, new Map()).toBuyCount, 0);

assert.equal(dayMarkFromSlots([
  { filled: true, cooked: true },
  { filled: true, cooked: true },
  { filled: true, cooked: true },
]), "done");
assert.equal(dayMarkFromSlots([
  { filled: true, cooked: true },
  { filled: true, cooked: false },
  { filled: true, cooked: true },
]), "planned");
assert.equal(dayMarkFromSlots([
  { filled: true, cooked: true },
  { filled: false, cooked: false },
  { filled: false, cooked: false },
]), "open");
assert.equal(positionCountLabel(1), "1 позиція");
assert.equal(positionCountLabel(2), "2 позиції");
assert.equal(positionCountLabel(5), "5 позицій");
assert.equal(positionCountLabel(11), "11 позицій");
assert.equal(positionCountLabel(14), "14 позицій");
assert.equal(positionCountLabel(21), "21 позиція");

// рецепти: порція сім'ї, залишок і ціна однієї порції
assert.equal(scaledNeed(1000, 4, 2.85), 712.5);
const covered = coverIngredients(
  [
    { productId: "potato", name: "Картопля", unit: "г", quantity: 100, optional: false },
    { productId: "potato", name: "Картопля", unit: "г", quantity: 100, optional: false },
    { productId: "cream", name: "Сметана", unit: "г", quantity: 50, optional: true },
  ],
  1,
  1,
  new Map([["potato", 150]]),
);
assert.equal(covered.length, 2);
assert.equal(covered[0].needed, 200);
assert.equal(covered[0].short, true);
assert.equal(covered[1].short, false);
assert.equal(covered[1].lacks, true);
assert.equal(availabilityLabel(1200, 400, "г").replace(/\s/g, " "), "є 1,2 кг");
assert.equal(availabilityLabel(100, 400, "г").replace(/\s/g, " "), "бракує 300 г");

const priceIngredients = [
  { productId: "potato", quantity: 800, optional: false, unit: "г" },
  { productId: "eggs", quantity: 2, optional: false, unit: "шт" },
  { productId: "salt", quantity: 10, optional: false, unit: "г" },
  { productId: "cream", quantity: 50, optional: true, unit: "г" },
];
const fresh = freshestPrices([
  { productId: "potato", price: "20", updatedAt: "2026-11-01T00:00:00Z" },
  { productId: "potato", price: 40, updatedAt: "2026-11-10T00:00:00Z" },
  { productId: "eggs", price: 6, updatedAt: null },
  { productId: "salt", price: -1, updatedAt: "2026-11-12T00:00:00Z" },
]);
assert.equal(fresh.get("potato"), 40);
assert.equal(fresh.get("salt"), undefined);
assert.equal(portionPriceUah(4, priceIngredients, fresh), null);
assert.equal(
  portionPriceUah(4, priceIngredients.filter((item) => item.productId !== "salt"), fresh),
  11,
);
assert.equal(formatPortionPrice(31.4).replace(/\s/g, " "), "≈ 31 ₴");

const catalogRecipe = {
  title: "Борщ",
  productNames: ["Картопля", "Буряк"],
  mealTypes: ["lunch"],
  cookMinutes: 30 as number | null,
  missingCount: 0,
};
assert.equal(matchesCatalog(catalogRecipe, { q: "карт", meal: null, quick: false, now: false }), true);
assert.equal(matchesCatalog(catalogRecipe, { q: "борщ", meal: "lunch", quick: true, now: true }), true);
assert.equal(matchesCatalog(catalogRecipe, { q: "", meal: "dinner", quick: false, now: false }), false);
assert.equal(matchesCatalog({ ...catalogRecipe, cookMinutes: null }, { q: "", meal: null, quick: true, now: false }), false);
assert.equal(matchesCatalog({ ...catalogRecipe, cookMinutes: 45 }, { q: "", meal: null, quick: true, now: false }), false);
assert.equal(matchesCatalog({ ...catalogRecipe, missingCount: 2 }, { q: "", meal: null, quick: false, now: true }), false);
assert.equal(matchesCatalog({ ...catalogRecipe, missingCount: null }, { q: "", meal: null, quick: false, now: true }), false);
assert.equal(
  decodeURIComponent(catalogHref({ q: "  курка ", meal: "dinner", quick: true, now: false })),
  "/recipes?q=курка&meal=dinner&quick=1",
);
assert.deepEqual(parseCatalogFilters({ q: " борщ ", meal: "nope", quick: "1", now: "0" }), {
  q: "борщ",
  meal: null,
  quick: true,
  now: false,
});

assert.equal(pickUncookedToday([
  { id: "dinner", cookedAt: null, mealType: "dinner" },
  { id: "breakfast", cookedAt: null, mealType: "breakfast" },
  { id: "done", cookedAt: "2026-11-12T08:00:00Z", mealType: "lunch" },
])?.id, "breakfast");
assert.equal(pickUncookedToday([{ id: "done", cookedAt: "2026-11-12T08:00:00Z", mealType: "lunch" }]), null);
assert.equal(mealTypeForNewEntry(["snack"]), "snack");
assert.equal(mealTypeForNewEntry([]), "lunch");
assert.equal(recipeReturnPath("/recipes", "/menu"), "/recipes");
assert.equal(recipeReturnPath("/recipes/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "/menu"), "/recipes/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
assert.equal(recipeReturnPath("https://evil.test/recipes", "/menu"), "/menu");
assert.equal(recipeReturnPath("/recipes/not-an-id", "/menu"), "/menu");

// фінанси: 7 460 ₴ за 12 днів листопада з бюджету 18 000 ₴ → прогноз 18 650 ₴
assert.equal(FORECAST_MIN_ELAPSED_DAYS, 3);
assert.equal(monthForecast(7460, 12, 30), 18650);
assert.equal(monthForecast(100, 2, 30), null);
assert.equal(monthForecast(30, 3, 30), 300);
assert.equal(monthForecast(0, 12, 30), null);
assert.equal(budgetRemaining(7460, 18000), 10540);
assert.equal(formatShare(7460 / 18000), "41%");
assert.equal(formatShare(12 / 30), "40%");
assert.equal(pace(7460, 18000, 12, 30)?.spentShare, 7460 / 18000);
assert.equal(pace(0, 18000, 12, 30), null);
assert.equal(pace(100, null, 12, 30), null);
assert.equal(formatUah(7460).replace(/\s/g, " "), "7 460 ₴");
assert.equal(formatUah(1284.5).replace(/\s/g, " "), "1 284,50 ₴");
assert.equal(formatUah(-650).replace(/\s/g, " "), "−650 ₴");
assert.equal(daysInMonth("2026-11-12"), 30);
assert.equal(daysInYear("2024-01-01"), 366);
assert.equal(daysInYear("2026-01-01"), 365);
assert.equal(readBudget(null), null);
assert.equal(readBudget(0), null);
assert.equal(readBudget("18000.00"), 18000);
assert.equal(parseMoney("1 284,50"), 1284.5);
assert.equal(parseMoney("12."), 12);
assert.equal(parseMoney("-1"), null);
assert.equal(parsePeriod("week", "2026-11-12", "2026-11-01").anchor, weekStart("2026-11-12"));
assert.equal(parsePeriod("nope", undefined, "2026-11-12").anchor, "2026-11-01");
assert.equal(shiftAnchor("month", "2026-12-01", 1), "2027-01-01");
assert.equal(shiftAnchor("week", "2026-11-09", 1), "2026-11-16");
assert.equal(monthTitle("2026-11-01"), "Листопад 2026");
assert.equal(periodTitle("year", "2026-01-01"), "2026");

const november = { start: "2026-11-01", end: "2026-11-30" };
const financeRows = [{ id: "nov", purchasedAt: "2026-11-12", amount: 7460, storeName: "Сільпо" }];
const novemberSummary = summarizePeriod("month", "2026-11-01", "2026-11-12", 18000, financeRows);
assert.equal(novemberSummary.spent, 7460);
assert.equal(novemberSummary.remaining, 10540);
assert.equal(novemberSummary.perDay, 585.56);
assert.equal(novemberSummary.forecast.status, "value");
if (novemberSummary.forecast.status === "value") assert.equal(novemberSummary.forecast.amount, 18650);
assert.equal(novemberSummary.pace && Math.round(novemberSummary.pace.spentShare * 100), 41);
assert.equal(novemberSummary.pace && Math.round(novemberSummary.pace.elapsedShare * 100), 40);

const earlyRows = [{ id: "early", purchasedAt: "2026-11-01", amount: 100, storeName: "АТБ" }];
assert.equal(summarizePeriod("month", "2026-11-01", "2026-11-02", 18000, earlyRows).forecast.status, "too-early");
assert.equal(forecastState(financeRows, november, "2026-11-12", null).status, "no-budget");
assert.equal(forecastState([], november, "2026-11-12", 18000).status, "no-receipts");
assert.equal(forecastState(financeRows, { start: "2026-10-01", end: "2026-10-31" }, "2026-11-12", 18000).status, "outside");

const emptyMonth = summarizePeriod("month", "2026-11-01", "2026-11-12", 18000, []);
assert.equal(emptyMonth.spent, 0);
assert.equal(emptyMonth.average, null);
assert.equal(emptyMonth.pace, null);
assert.equal(emptyMonth.remaining, 18000);
assert.equal(emptyMonth.forecast.status, "no-receipts");

const financeWeek = summarizePeriod("week", "2026-11-09", "2026-11-12", 18000, financeRows);
assert.equal(financeWeek.basis, 4200);
assert.equal(financeWeek.remaining, -3260);
assert.equal(financeWeek.forecast.status, "value");
assert.equal(summarizePeriod("year", "2026-01-01", "2026-11-12", 18000, financeRows).basis, 216000);

assert.deepEqual(
  totalsByMonth(
    [
      { purchasedAt: "2026-10-02", amount: 10 },
      { purchasedAt: "2026-11-02", amount: 5 },
      { purchasedAt: "2026-11-03", amount: 7 },
    ],
    ["2026-10-01", "2026-11-01"],
  ),
  [10, 12],
);
assert.deepEqual(totalsByWeek([{ purchasedAt: "2026-11-12", amount: 4 }], ["2026-11-09"]), [4]);

function financeLine(partial: Partial<DatedLine> & Pick<DatedLine, "purchasedAt" | "price">): DatedLine {
  return {
    id: partial.id ?? "line",
    productId: partial.productId ?? null,
    productName: partial.productName ?? null,
    category: partial.category ?? null,
    rawName: partial.rawName ?? "сире",
    quantity: partial.quantity ?? 1,
    unit: partial.unit ?? "шт",
    price: partial.price,
    purchasedAt: partial.purchasedAt,
  };
}

assert.deepEqual(
  categoryTotals(
    [
      financeLine({ purchasedAt: "2026-11-02", productId: "meat", category: "м'ясо", price: 100, productName: "Філе" }),
      financeLine({ purchasedAt: "2026-11-03", price: 40 }),
      financeLine({ purchasedAt: "2026-10-01", productId: "meat", category: "м'ясо", price: 999 }),
      financeLine({ purchasedAt: "2026-11-04", productId: "misc", category: "інше", price: 15 }),
    ],
    november,
  ).map((row) => [row.name, row.total]),
  [
    ["М'ясо", 100],
    ["Інше", 55],
  ],
);

const financeStores = storeTotals(
  [
    { purchasedAt: "2026-11-01", amount: 70, storeName: "Сільпо" },
    { purchasedAt: "2026-11-02", amount: 30, storeName: "АТБ" },
    { purchasedAt: "2026-10-02", amount: 500, storeName: "Сільпо" },
    { purchasedAt: "2026-11-03", amount: 10, storeName: "  " },
  ],
  november,
);
assert.deepEqual(
  financeStores.map((row) => [row.name, row.total]),
  [
    ["Сільпо", 70],
    ["АТБ", 30],
    ["Без магазину", 10],
  ],
);
assert.equal(storeTotals(
  [
    { purchasedAt: "2026-11-01", amount: 70, storeName: "Сільпо" },
    { purchasedAt: "2026-11-02", amount: 30, storeName: "АТБ" },
  ],
  november,
)[0].share, 0.7);

const financePrices = priceChanges(
  [
    financeLine({ id: "1", purchasedAt: "2026-11-01", productId: "butter", productName: "Масло", price: 100, quantity: 1, unit: "шт" }),
    financeLine({ id: "2", purchasedAt: "2026-11-20", productId: "butter", productName: "Масло", price: 112, quantity: 1, unit: "шт" }),
    financeLine({ id: "3", purchasedAt: "2026-11-05", productId: "bread", productName: "Хліб", price: 20, quantity: 1 }),
    financeLine({ id: "4", purchasedAt: "2026-11-08", productId: "mix", productName: "Молоко", price: 40, quantity: 1, unit: "л" }),
    financeLine({ id: "5", purchasedAt: "2026-11-18", productId: "mix", productName: "Молоко", price: 50, quantity: 1, unit: "шт" }),
  ],
  november,
);
assert.equal(financePrices.length, 1);
assert.equal(financePrices[0].productId, "butter");
assert.equal(Math.round(financePrices[0].change * 100), 12);
assert.equal(amountOf({ total: null, items: [{ price: 10 }, { price: 2.5 }] }), 12.5);
assert.equal(amountOf({ total: 0, items: [{ price: 10 }] }), 0);
assert.equal(averageReceipt(
  [
    { purchasedAt: "2026-11-01", amount: 10 },
    { purchasedAt: "2026-11-02", amount: 20 },
    { purchasedAt: "2026-10-01", amount: 99 },
  ],
  november,
), 15);

// ---------- Склад (pantry) ----------
// відмінювання
assert.equal(pluralizePositions(0), "0 позицій");
assert.equal(pluralizePositions(1), "1 позиція");
assert.equal(pluralizePositions(2), "2 позиції");
assert.equal(pluralizePositions(4), "4 позиції");
assert.equal(pluralizePositions(5), "5 позицій");
assert.equal(pluralizePositions(11), "11 позицій");
assert.equal(pluralizePositions(21), "21 позиція");
assert.equal(pluralizePositions(22), "22 позиції");
assert.equal(pluralizePositions(31), "31 позиція");
assert.equal(pluralizePositions(64), "64 позиції");

// шкала рівня
assert.equal(calculateScalePercent(600, "г"), 60);
assert.equal(calculateScalePercent(140, "мл"), 14);
assert.equal(calculateScalePercent(2, "шт"), 20); // 2 / 10 = 20%
assert.equal(calculateScalePercent(0, "г"), 0);
assert.equal(calculateScalePercent(1500, "г"), 100);
assert.equal(calculateScalePercent(600, "г", 2000), 30); // 600 / 2000 = 30%

// поріг «мало»
assert.equal(isLowStock(20), true);
assert.equal(isLowStock(10), true);
assert.equal(isLowStock(21), false);
assert.equal(isLowStock(60), false);

// терміни придатності (базова дата 2026-11-12)
const t0 = "2026-11-12";
assert.equal(daysUntilExpiry("2026-11-13", t0), 1);
assert.equal(daysUntilExpiry("2026-11-12", t0), 0);
assert.equal(daysUntilExpiry("2026-11-11", t0), -1);
assert.equal(daysUntilExpiry("2026-11-15", t0), 3);
assert.equal(daysUntilExpiry("2026-11-16", t0), 4);

assert.equal(isExpiringSoon("2026-11-15", t0), true);
assert.equal(isExpiringSoon("2026-11-16", t0), false);
assert.equal(isExpiringSoon(null, t0), false);

assert.equal(formatExpiryNote("2026-11-11", t0), "Термін минув");
assert.equal(formatExpiryNote("2026-11-12", t0), "Спливає сьогодні");
assert.equal(formatExpiryNote("2026-11-13", t0), "Спливає завтра");
assert.equal(formatExpiryNote("2026-11-15", t0), "Термін до 15 листопада");

// стан позиції для LevelBar
assert.equal(determineItemState(true, true), "expiring");
assert.equal(determineItemState(true, false), "expiring");
assert.equal(determineItemState(false, true), "low");
assert.equal(determineItemState(false, false), "normal");

// на скільки вистачить
const testProducts = new Map([
  ["chicken", { unit: "г", isStaple: false, storeId: null, name: "Курка" }],
  ["eggs", { unit: "шт", isStaple: false, storeId: null, name: "Яйця" }],
  ["salt", { unit: "г", isStaple: true, storeId: null, name: "Сіль" }],
]);
const testUpcoming = [
  {
    servings: null,
    baseServings: 2,
    ingredients: [
      { productId: "chicken", quantity: 500, optional: false },
      { productId: "eggs", quantity: 2, optional: false },
      { productId: "salt", quantity: 10, optional: false },
    ],
  },
];
// порції = 2. Потреба: chicken 500г, eggs 2шт. Вдома: chicken 200г, eggs 10шт.
const shortRes = calculateWeekSufficiency(testUpcoming, new Map([["chicken", 200], ["eggs", 10]]), testProducts, 2);
assert.equal(shortRes.willRunOut, true);
assert.deepEqual(shortRes.productNames, ["курка"]);
assert.match(shortRes.message ?? "", /курка/);

const okRes = calculateWeekSufficiency(testUpcoming, new Map([["chicken", 800], ["eggs", 10]]), testProducts, 2);
assert.equal(okRes.willRunOut, false);
assert.equal(okRes.message, null);

// форматування руху складу
const sampleMovements: MovementInput[] = [
  {
    id: "m1",
    product_id: "chicken",
    delta: 500,
    source: "scan",
    scan_id: "scan-1",
    meal_plan_entry_id: null,
    created_at: "2026-11-12T10:42:00Z",
    products: { name: "Курка", unit: "г" },
    incoming_scans: { store_name: "Сільпо", input_type: "receipt", channel: "telegram" },
  },
  {
    id: "m2",
    product_id: "eggs",
    delta: 10,
    source: "scan",
    scan_id: "scan-1",
    meal_plan_entry_id: null,
    created_at: "2026-11-12T10:42:00Z",
    products: { name: "Яйця", unit: "шт" },
    incoming_scans: { store_name: "Сільпо", input_type: "receipt", channel: "telegram" },
  },
  {
    id: "m3",
    product_id: "chicken",
    delta: -300,
    source: "cooked",
    scan_id: null,
    meal_plan_entry_id: "plan-1",
    created_at: "2026-11-12T08:40:00Z",
    products: { name: "Курка", unit: "г" },
    meal_plan_entries: { recipes: { title: "Курячий суп" } },
  },
  {
    id: "m4",
    product_id: "eggs",
    delta: 5,
    source: "inventory",
    scan_id: null,
    meal_plan_entry_id: null,
    created_at: "2026-11-12T07:00:00Z",
    products: { name: "Яйця", unit: "шт" },
  },
  {
    id: "m5",
    product_id: "chicken",
    delta: 100,
    source: "manual",
    scan_id: null,
    meal_plan_entry_id: null,
    created_at: "2026-11-12T06:00:00Z",
    products: { name: "Курка", unit: "г" },
  },
];
const formattedMoves = formatMovements(sampleMovements);
assert.equal(formattedMoves.length, 4); // scan-1 (2 items) -> 1 move; plan-1 -> 1 move; inventory -> 1 move; manual -> 1 move
assert.equal(formattedMoves[0].title, "Чек · Сільпо");
assert.equal(formattedMoves[0].sign, "+");
assert.equal(formattedMoves[1].title, "Курячий суп");
assert.equal(formattedMoves[1].sign, "−");
assert.equal(formattedMoves[2].title, "Інвентаризація");
assert.equal(formattedMoves[2].sign, "=");
assert.equal(formattedMoves[3].sign, "+");

console.log(`ok: логіка і стартові дані (${SEED_PRODUCTS.length} продуктів, ${SEED_RECIPES.length} рецептів)`);
