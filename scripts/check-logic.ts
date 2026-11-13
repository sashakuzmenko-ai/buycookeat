// node scripts/check-logic.ts — перевірка розрахунку порцій, списку покупок і автозаповнення
import assert from "node:assert/strict";
import { autoFill, buildShoppingList, formatQty, householdPortions, ingredientUsage, manualShoppingRow, roundCooking, roundQty } from "../src/lib/shopping.ts";
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
import {
  StorePriceIndex,
  buildMonthlyStoreSummaries,
  buildPriceComparisonTable,
  calculateItemEstimatedPrice,
  findStoreSavingsRecommendation,
  normalizeReceiptItemPrice,
  pluralizeChecks,
  pluralizePositions as pluralizePricePositions,
} from "../src/lib/prices.ts";
import { addDays, weekDays, weekStart } from "../src/lib/dates.ts";
import { buildHomeModel } from "../src/lib/home.ts";
import {
  FORECAST_MIN_ELAPSED_DAYS,
  amountOf,
  averageReceipt,
  budgetRemaining,
  categoryTotals,
  chartWeekLabel,
  daysInMonth,
  daysInYear,
  forecastState,
  formatShare,
  formatUah,
  monthForecast,
  monthLocativeUk,
  monthTitle,
  pace,
  paceDifference,
  paceDifferenceNote,
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
import {
  familyCountTitle,
  pluralYears,
  formatMemberRole,
  formatPortionFactor,
  calculatePortionWidthPercent,
  stepPortionFactor,
  formatPortionsLabel,
  dailyBudgetUah,
  isAllergy,
  parseRestrictions,
} from "../src/lib/family.ts";
import { MAIN_NAV_ITEMS, MORE_NAV_ITEMS, isRouteActive, isMoreActive } from "../src/components/shell/nav-items.ts";
import { captureBlockReason, defaultScanMode, resolveCaptureType } from "../src/lib/scan/capture.ts";
import { chooseProduct } from "../src/lib/scan/products.ts";
import {
  SCAN_INPUTS,
  financeEffectLabel,
  financeMonthLabel,
  formatAmount,
  formatScanDay,
  formatScanWhen,
  formatUah as formatScanUah,
  parseScanItems,
  queueTitle,
  shoppingEffectLabel,
  statusLabel,
  stockEffectLabel,
} from "../src/lib/scan/present.ts";
import { buildScanPrompt, normalizeScanResult } from "../src/lib/scan/recognize.ts";
import { parseScanRequest } from "../src/lib/scan/request.ts";
import { decideChannelAccess, missingBotEnv, rowsForGrant, scopedHousehold, supabaseServerKey, webhookSecretOk } from "../src/lib/channels/access.ts";
import { decideRedeem, linkCodeFromBytes, normalizeLinkCode, pendingExternalId, redeemFailureText } from "../src/lib/channels/bind.ts";
import { dinnerText, parsePressData, quickAsk, recognitionText, scanButtons, shoppingText, stockText, wroteSummary } from "../src/lib/channels/copy.ts";
import { audioFormatFor, readTelegramUpdate, startArgument } from "../src/lib/channels/telegram.ts";

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

// ціни: нормалізація, індекс із чеками і store_products, орієнтовна вартість
assert.equal(normalizeReceiptItemPrice(1000, "г", 45.9), 45.9);
assert.equal(normalizeReceiptItemPrice(200, "г", 98), 490);
assert.equal(normalizeReceiptItemPrice(2, "шт", 30), 15);
assert.equal(normalizeReceiptItemPrice(0, "г", 45), null);
assert.equal(normalizeReceiptItemPrice(100, "г", null), null);

const testStores = [
  { id: "silpo", name: "Сільпо" },
  { id: "atb", name: "АТБ" },
];
const testStoreProducts = [
  { store_id: "silpo", product_id: "butter", price: 480 },
  { store_id: "atb", product_id: "butter", price: 420 },
  { store_id: "silpo", product_id: "eggs", price: 70 },
];
const testReceipts = [
  { id: "r1", store_id: "silpo", purchased_at: "2026-11-01", total: 100 },
  { id: "r2", store_id: "silpo", purchased_at: "2026-11-10", total: 150 },
];
const testReceiptItems = [
  { id: "ri1", receipt_id: "r1", product_id: "butter", raw_name: "Масло", quantity: 200, unit: "г", price: 96 },
  { id: "ri2", receipt_id: "r2", product_id: "butter", raw_name: "Масло", quantity: 200, unit: "г", price: 98 },
];

const priceIdx = new StorePriceIndex(testStores, testReceipts, testReceiptItems, testStoreProducts);
// r2 свіжіший за r1 і перевизначає store_products: 98 грн за 200 г = 490 грн/кг
assert.equal(priceIdx.getPrice("silpo", "butter"), 490);
// в АТБ чеків немає — береться зі store_products: 420 грн/кг
assert.equal(priceIdx.getPrice("atb", "butter"), 420);
// яйця в Сільпо тільки в store_products: 70
assert.equal(priceIdx.getPrice("silpo", "eggs"), 70);

// орієнтовна ціна позиції списку
assert.equal(calculateItemEstimatedPrice(200, "г", 490), 98);
assert.equal(calculateItemEstimatedPrice(10, "шт", 7.2), 72);
assert.equal(calculateItemEstimatedPrice(null, "г", 490), null);

// підказка економії: масло в Сільпо (98), а в АТБ (84) -> економія 14 грн
const shoppingItems = [
  {
    id: "item1",
    title: "Масло",
    quantity: 200,
    unit: "г",
    store_id: "silpo",
    checked: false,
    stocked_at: null,
    product_id: "butter",
    products: { name: "Масло вершкове", category: "молочне" },
  },
];
const savings = findStoreSavingsRecommendation(shoppingItems, testStores, priceIdx);
assert.ok(savings);
assert.equal(savings?.targetStoreId, "atb");
assert.equal(savings?.savingAmount, 14);
assert.deepEqual(savings?.itemIds, ["item1"]);

// порівняння цін: «Де що дешевше» тільки за позиціями чеків
const comparison = buildPriceComparisonTable(
  testStores,
  testReceipts,
  testReceiptItems,
  [{ id: "butter", name: "Масло", unit: "г" }],
);
assert.equal(comparison.hasReceipts, true);
assert.equal(comparison.rows.length, 1);
assert.equal(comparison.rows[0].pricesByStore[0].price, 490);

// без чеків — порожній стан
assert.equal(buildPriceComparisonTable(testStores, [], [], []).hasReceipts, false);

// витрати по магазинах за місяць
const novReceipts = [
  { id: "r1", store_id: "silpo", purchased_at: "2026-11-02", total: 400 },
  { id: "r2", store_id: "silpo", purchased_at: "2026-11-08", total: 600 },
  { id: "r3", store_id: "atb", purchased_at: "2026-11-05", total: 300 },
  { id: "r-oct", store_id: "atb", purchased_at: "2026-10-25", total: 500 }, // минулий місяць — не входить
];
const monthly = buildMonthlyStoreSummaries(testStores, novReceipts, [], new Date("2026-11-12T12:00:00Z"));
assert.equal(monthly.length, 2);
assert.equal(monthly[0].storeName, "Сільпо");
assert.equal(monthly[0].receiptsCount, 2);
assert.equal(monthly[0].totalSum, 1000);
assert.equal(monthly[0].averageCheck, 500);
assert.equal(monthly[1].storeName, "АТБ");
assert.equal(monthly[1].receiptsCount, 1);
assert.equal(monthly[1].totalSum, 300);

// плюралізація чеків і позицій
assert.equal(pluralizeChecks(1), "1 чек");
assert.equal(pluralizeChecks(2), "2 чеки");
assert.equal(pluralizeChecks(5), "5 чеків");
assert.equal(pluralizeChecks(14), "14 чеків");
assert.equal(pluralizeChecks(21), "21 чек");
assert.equal(pluralizePricePositions(1), "1 позиція");
assert.equal(pluralizePricePositions(3), "3 позиції");
assert.equal(pluralizePricePositions(10), "10 позицій");

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

// Сім'я: логіка підписів, віку, порцій, бюджету та обмежень
assert.equal(familyCountTitle(0), "Поки нікого");
assert.equal(familyCountTitle(1), "Нас один");
assert.equal(familyCountTitle(2), "Нас двоє");
assert.equal(familyCountTitle(3), "Нас троє");
assert.equal(familyCountTitle(4), "Нас четверо");
assert.equal(familyCountTitle(5), "Нас п'ятеро");
assert.equal(familyCountTitle(8), "Нас 8");

assert.equal(pluralYears(1), "рік");
assert.equal(pluralYears(2), "роки");
assert.equal(pluralYears(4), "роки");
assert.equal(pluralYears(5), "років");
assert.equal(pluralYears(12), "років");
assert.equal(pluralYears(21), "рік");

const refDate = new Date("2026-11-12T12:00:00Z");
assert.equal(formatMemberRole({ kind: "adult", notes: "дорослий" }, refDate), "дорослий");
assert.equal(formatMemberRole({ kind: "adult", notes: "доросла" }, refDate), "доросла");
assert.equal(formatMemberRole({ kind: "child", birth_date: "2014-06-01" }, refDate), "12 років");
assert.equal(formatMemberRole({ kind: "child", birth_date: "2020-03-10" }, refDate), "6 років");
assert.equal(formatMemberRole({ kind: "child" }, refDate), "дитина");

assert.equal(formatPortionFactor(1), "1,0");
assert.equal(formatPortionFactor(0.8), "0,8");
assert.equal(formatPortionFactor(0.7), "0,7");

assert.equal(calculatePortionWidthPercent(1.0), 100);
assert.equal(calculatePortionWidthPercent(0.8), 80);
assert.equal(calculatePortionWidthPercent(0.7), 70);
assert.equal(calculatePortionWidthPercent(1.5), 100);
assert.equal(calculatePortionWidthPercent(0), 0);

assert.equal(stepPortionFactor(1.0, "inc"), 1.1);
assert.equal(stepPortionFactor(1.0, "dec"), 0.9);
assert.equal(stepPortionFactor(0.8, "inc"), 0.9);
assert.equal(stepPortionFactor(0.1, "dec"), 0.1); // min clamp
assert.equal(stepPortionFactor(3.0, "inc"), 3.0); // max clamp

assert.equal(formatPortionsLabel(1), "1 порція");
assert.equal(formatPortionsLabel(2), "2 порції");
assert.equal(formatPortionsLabel(3.5), "3,5 порції");
assert.equal(formatPortionsLabel(4), "4 порції");
assert.equal(formatPortionsLabel(5), "5 порцій");
assert.equal(formatPortionsLabel(0), "0 порцій");

assert.equal(dailyBudgetUah(18000), 600);
assert.equal(dailyBudgetUah(15000), 500);
assert.equal(dailyBudgetUah(0), null);
assert.equal(dailyBudgetUah(null), null);

assert.equal(isAllergy("Алергія: горіхи"), true);
assert.equal(isAllergy("алергія на лактозу"), true);
assert.equal(isAllergy("Nut allergy"), true);
assert.equal(isAllergy("Любить гостре"), false);
assert.equal(isAllergy("Менше смаженого"), false);

assert.deepEqual(parseRestrictions("Алергія: горіхи, Менше смаженого, Любить гостре"), [
  "Алергія: горіхи",
  "Менше смаженого",
  "Любить гостре",
]);
assert.deepEqual(parseRestrictions(["Без грибів", "Вегетаріанець"]), ["Без грибів", "Вегетаріанець"]);
assert.deepEqual(parseRestrictions(""), []);

console.log(`ok: логіка і стартові дані (${SEED_PRODUCTS.length} продуктів, ${SEED_RECIPES.length} рецептів)`);

assert.equal(SCAN_INPUTS.length, 5);
assert.match(buildScanPrompt("add", []), /скріншот/i);
assert.match(buildScanPrompt("add", []), /купив сир і сметану/);

const scanCatalog = [{ id: "p1", name: "Сир", unit: "г" }];
const recognized = normalizeScanResult(
  {
    source: "text",
    store: "Сільпо",
    total: 120,
    items: [
      { raw: "СИР", product_number: 1, name: "сир", category: "молочне", unit: "шт", quantity: 400, uncertain: false, price: 80 },
      { raw: "???", product_number: 0, name: "", category: "інше", unit: "шт", quantity: 1, uncertain: true, price: 0 },
      { raw: "Сметана", product_number: 0, name: "Сметана", category: "нема", unit: "відро", quantity: 200, uncertain: true, price: 40.5 },
    ],
  },
  scanCatalog,
  { model: "test", costUsd: null },
);
assert.equal(recognized.source, "text");
assert.equal(recognized.store, "Сільпо");
assert.equal(recognized.total, 120);
assert.equal(recognized.items.length, 2);
assert.equal(recognized.items[0].productId, "p1");
assert.equal(recognized.items[0].unit, "г");
assert.equal(recognized.items[0].price, 80);
assert.equal(recognized.items[1].name, "Сметана");
assert.equal(recognized.items[1].unit, "шт");
assert.equal(recognized.items[1].category, "інше");
assert.equal(recognized.items[1].uncertain, true);

const textRequest = parseScanRequest({ text: "купив сир і сметану", inputType: "text" });
assert.equal(textRequest.ok, true);
if (textRequest.ok) assert.equal(textRequest.value.inputType, "text");
const shot = parseScanRequest({ images: ["data:image/jpeg;base64,aaaa"], inputType: "screenshot" });
assert.equal(shot.ok, true);
if (shot.ok) assert.equal(shot.value.inputType, "screenshot");
const tooMany = parseScanRequest({ images: Array.from({ length: 20 }, () => "data:image/jpeg;base64,qq") });
assert.equal(tooMany.ok, true);
if (tooMany.ok) assert.equal(tooMany.value.images.length, 12);
assert.equal(parseScanRequest({}).ok, false);
assert.equal(parseScanRequest({ audio: "не base64" }).ok, false);

const knownIds = new Set(["p1"]);
const knownNames = new Map([["сметана", "p2"]]);
assert.deepEqual(chooseProduct({ productId: "p1", name: "X", category: "інше", unit: "г" }, knownIds, knownNames), { kind: "existing", productId: "p1" });
assert.deepEqual(chooseProduct({ productId: null, name: "Сметана", category: "молочне", unit: "г" }, knownIds, knownNames), { kind: "existing", productId: "p2" });
const createdChoice = chooseProduct({ productId: null, name: "Кефір", category: "нема", unit: "літр" }, knownIds, knownNames);
assert.equal(createdChoice.kind, "create");
if (createdChoice.kind === "create") {
  assert.equal(createdChoice.category, "інше");
  assert.equal(createdChoice.unit, "шт");
}
assert.equal(chooseProduct({ productId: "nope", name: "  ", category: "інше", unit: "г" }, knownIds, knownNames).kind, "skip");

const scanNow = new Date("2026-11-12T12:00:00Z");
assert.equal(formatScanWhen("2026-11-12T08:42:00Z", scanNow), "10:42");
assert.equal(formatScanWhen("2026-11-11T20:00:00Z", scanNow), "учора");
assert.equal(formatScanWhen("2026-11-10T08:00:00Z", scanNow), "10.11");
assert.equal(formatScanDay("2026-11-12T08:42:00Z"), "12.11.2026");
assert.equal(queueTitle("receipt", "Сільпо", "telegram"), "Чек · Сільпо");
assert.equal(queueTitle("voice", null, "web"), "Голос · Веб");
assert.equal(statusLabel("pending"), "Перевірити");
assert.equal(formatScanUah(1284.5), "1 284,50 ₴");
assert.equal(formatAmount(93.8), "93,80");
assert.equal(stockEffectLabel("add", 18), "+18 позицій");
assert.equal(stockEffectLabel("set", 2), "оновити 2 позиції");
assert.equal(financeEffectLabel("add", 1284.5), "+1 284,50 ₴");
assert.equal(financeEffectLabel("add", null), "без суми");
assert.equal(financeEffectLabel("set", 10), "без чека");
assert.equal(shoppingEffectLabel("add", 3), "перерахунок зі складу");
assert.equal(shoppingEffectLabel("set", 0), "без змін");
assert.equal(financeMonthLabel("2026-11-12T10:00:00Z"), "Фінанси · листопад");
assert.equal(parseScanItems([{ raw: "СИР", productId: "p1", name: "Сир", category: "молочне", unit: "г", quantity: 200, uncertain: false, price: 80 }])[0]?.productId, "p1");
assert.equal(parseScanItems([{ quantity: 0, name: "Порожньо" }]).length, 0);

assert.equal(resolveCaptureType("screenshot", { images: 1, audio: false, fromVideo: false, text: "", note: "" }), "screenshot");
assert.equal(resolveCaptureType("file", { images: 2, audio: true, fromVideo: true, text: "", note: "" }), "video");
assert.equal(resolveCaptureType("file", { images: 0, audio: false, fromVideo: false, text: "купив сир", note: "" }), "text");
assert.equal(captureBlockReason("text", { images: 0, audio: false, fromVideo: false, text: "", note: "" }), "Напишіть, що купили");
assert.equal(captureBlockReason("voice", { images: 0, audio: true, fromVideo: false, text: "", note: "" }), null);
assert.equal(defaultScanMode("video"), "set");
assert.equal(defaultScanMode("receipt"), "add");

const householdA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const householdB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const userA = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const linked = { householdId: householdA, userId: userA, linkedAt: "2026-11-13T08:00:00Z" };
const grantA = decideChannelAccess({ binding: linked, member: true, targetHouseholdId: householdA });
assert.equal(grantA.allowed, true);
assert.equal(decideChannelAccess({ binding: null, member: false, targetHouseholdId: householdA }).allowed, false);
assert.equal(decideChannelAccess({ binding: { ...linked, linkedAt: null }, member: true, targetHouseholdId: householdA }).reason, "unbound");
assert.equal(decideChannelAccess({ binding: linked, member: false, targetHouseholdId: householdA }).reason, "not_member");
assert.equal(decideChannelAccess({ binding: linked, member: true, targetHouseholdId: householdB }).reason, "other_household");
assert.equal(scopedHousehold(grantA, householdB), null);
assert.equal(scopedHousehold(decideChannelAccess({ binding: null, member: false, targetHouseholdId: null }), householdA), null);
assert.equal(scopedHousehold(grantA, householdA), householdA);
const visible = rowsForGrant(grantA, [
  { householdId: householdA, name: "Молоко" },
  { householdId: householdB, name: "Чуже" },
]);
assert.deepEqual(visible.map((row) => row.name), ["Молоко"]);
assert.equal(rowsForGrant(decideChannelAccess({ binding: null, member: false, targetHouseholdId: null }), [{ householdId: householdA, name: "Молоко" }]).length, 0);

assert.equal(webhookSecretOk(null, "secret"), false);
assert.equal(webhookSecretOk("nope", "secret"), false);
assert.equal(webhookSecretOk("secret", "secret"), true);
assert.deepEqual(missingBotEnv({}), ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"]);
assert.equal(supabaseServerKey({ secretKey: "sb_secret_new", serviceRoleKey: "legacy" }), "sb_secret_new");
assert.equal(supabaseServerKey({ serviceRoleKey: "legacy" }), "legacy");
assert.equal(missingBotEnv({ token: "t", webhookSecret: "s", supabaseUrl: "https://db", serviceRoleKey: "legacy" }).length, 0);

assert.equal(pendingExternalId(userA), `pending:${userA}`);
assert.equal(normalizeLinkCode(" abcd efgh "), "ABCDEFGH");
assert.equal(linkCodeFromBytes(Uint8Array.from([0, 1])), "AB");
const freshCode = {
  id: "row",
  householdId: householdA,
  userId: userA,
  expiresAt: "2099-01-01T00:00:00Z",
  linkedAt: null,
};
assert.equal(decideRedeem({ row: freshCode, nowMs: Date.parse("2026-11-13T00:00:00Z"), member: true, chatOwnerHouseholdId: null }).ok, true);
assert.equal(decideRedeem({ row: null, nowMs: 0, member: false, chatOwnerHouseholdId: null }).reason, "missing");
assert.equal(decideRedeem({ row: { ...freshCode, expiresAt: "2020-01-01T00:00:00Z" }, nowMs: Date.parse("2026-11-13T00:00:00Z"), member: true, chatOwnerHouseholdId: null }).reason, "expired");
assert.equal(decideRedeem({ row: freshCode, nowMs: Date.parse("2026-11-13T00:00:00Z"), member: false, chatOwnerHouseholdId: null }).reason, "not_member");
assert.equal(decideRedeem({ row: freshCode, nowMs: Date.parse("2026-11-13T00:00:00Z"), member: true, chatOwnerHouseholdId: householdB }).reason, "chat_taken");
assert.match(redeemFailureText("not_member"), /Код недійсний/);
assert.match(redeemFailureText("chat_taken"), /вже прив/);

const scanId = "11111111-1111-1111-1111-111111111111";
assert.equal(startArgument("/start CODE"), "CODE");
assert.equal(startArgument("/start@CookEatBot CODE"), "CODE");
assert.equal(startArgument("/start"), "");
assert.equal(startArgument("купив сир"), null);
assert.equal(audioFormatFor("audio/ogg"), "ogg");
assert.equal(quickAsk("Що на вечерю?"), "dinner");
assert.equal(quickAsk("Список покупок"), "shopping");
assert.equal(quickAsk("Залишки"), "stock");
assert.equal(quickAsk("купив сир"), null);

function tgMessage(extra: Record<string, unknown>) {
  return readTelegramUpdate({
    update_id: 1,
    message: { message_id: 1, from: { id: 42, is_bot: false, first_name: "Оля" }, chat: { id: 42, type: "private" }, ...extra },
  });
}
const voiceUpdate = tgMessage({ voice: { file_id: "voice-1", mime_type: "audio/ogg", file_size: 2000 } });
assert.equal(voiceUpdate.kind, "message");
if (voiceUpdate.kind === "message") {
  assert.equal(voiceUpdate.message.inputType, "voice");
  assert.equal(voiceUpdate.message.senderId, "42");
  assert.equal(voiceUpdate.message.chatId, "42");
  assert.equal(voiceUpdate.message.media?.fileId, "voice-1");
}
const photoUpdate = tgMessage({ photo: [{ file_id: "small", file_size: 100 }, { file_id: "big", file_size: 2000 }] });
if (photoUpdate.kind === "message") assert.equal(photoUpdate.message.inputType, "receipt");
const videoUpdate = tgMessage({ video: { file_id: "vid", mime_type: "video/mp4", file_size: 3000 } });
if (videoUpdate.kind === "message") assert.equal(videoUpdate.message.inputType, "video");
const shotUpdate = tgMessage({ document: { file_id: "shot", mime_type: "image/png", file_size: 4000 } });
if (shotUpdate.kind === "message") assert.equal(shotUpdate.message.inputType, "screenshot");
const textUpdate = tgMessage({ text: "купив сир і сметану" });
if (textUpdate.kind === "message") {
  assert.equal(textUpdate.message.inputType, "text");
  assert.equal(textUpdate.message.text, "купив сир і сметану");
}
const pressUpdate = readTelegramUpdate({
  callback_query: {
    id: "cb",
    from: { id: 42, is_bot: false },
    data: `ok:${scanId}`,
    message: { message_id: 2, chat: { id: -100, type: "group" } },
  },
});
assert.equal(pressUpdate.kind, "press");
if (pressUpdate.kind === "press") {
  assert.equal(pressUpdate.press.chatId, "-100");
  assert.equal(parsePressData(pressUpdate.press.data)?.action, "ok");
}
assert.equal(readTelegramUpdate({ update_id: 2 }).kind, "ignore");

const buttons = scanButtons(scanId, "https://cook.example/scan?id=" + scanId);
assert.deepEqual(buttons.flat().map((button) => button.label), ["Записати", "Виправити", "У покупки", "Уже купили"]);
assert.equal(buttons[0][1]?.url?.includes("/scan?id="), true);
const replyText = recognitionText({
  inputType: "receipt",
  items: [
    { raw: "МОЛОКО", productId: null, name: "Молоко", category: "молочне", unit: "мл", quantity: 900, uncertain: false, price: 40 },
    { raw: "ФIЛЕ", productId: null, name: "Філе", category: "інше", unit: "г", quantity: 600, uncertain: true, price: null },
  ],
  store: "Сільпо",
  total: 1284.5,
  mode: "add",
  now: new Date("2026-11-12T10:00:00Z"),
});
assert.match(replyText, /Сільпо/);
assert.match(replyText, /1 284,50 ₴/);
assert.match(replyText, /під питанням/);
assert.match(replyText, /ФIЛЕ → Філе/);
assert.match(wroteSummary("add", 18, 1284.5, new Date("2026-11-12T10:00:00Z")), /18 позицій/);
assert.match(wroteSummary("add", 18, 1284.5, new Date("2026-11-12T10:00:00Z")), /листопада/);
assert.match(dinnerText([]), /немає/);
assert.match(dinnerText(["Борщ"]), /Борщ/);
assert.match(shoppingText([]), /порожній/);
assert.match(shoppingText([{ name: "Хліб", checked: false }]), /Хліб/);
assert.match(stockText([]), /Немає позицій/);
assert.match(stockText([{ name: "Молоко", detail: "мало" }]), /Молоко/);
assert.equal(manualShoppingRow({ householdId: householdA, weekStart: "2026-11-09", title: "Хліб" }).household_id, householdA);
assert.equal(manualShoppingRow({ householdId: householdA, weekStart: "2026-11-09", title: "Хліб" }).source, "manual");

// Огляд: темп, місяці, тижні та безпечний шлях
assert.equal(monthLocativeUk("2026-11-12"), "листопаді");
assert.equal(monthLocativeUk("2026-05-01"), "травні");
assert.equal(paceDifference(7460, 18000, 12, 30), 260);
assert.equal(paceDifference(7000, 18000, 12, 30), -200);
assert.equal(paceDifference(7200, 18000, 12, 30), 0);
assert.equal(paceDifferenceNote(260), `на ${formatUah(260)} вище темпу`);
assert.equal(paceDifferenceNote(-200), `на ${formatUah(200)} нижче темпу`);
assert.equal(paceDifferenceNote(0), "за темпом");
assert.equal(chartWeekLabel("2026-10-12", "2026-11-12"), "12–18 жов");
assert.equal(chartWeekLabel("2026-10-26", "2026-11-12"), "26 жов – 1 лис");
assert.equal(chartWeekLabel("2026-11-09", "2026-11-12"), "9–12 лис · триває");
assert.equal(recipeReturnPath("/", "/recipes"), "/");

// Тест buildHomeModel для нової сім'ї без даних
const emptyHome = buildHomeModel({
  today: "2026-11-12",
  familyCount: 0,
  portions: 1,
  finance: { budget: null, receipts: [], householdCount: 0 },
  menu: { entries: [], products: new Map(), names: new Map(), stock: new Map() },
  pantry: { items: [], historicalMaxMap: new Map() },
  shopping: { items: [], stores: [], storeProducts: [], receipts: [], receiptItems: [] },
  scans: { inboxScans: [], now: new Date("2026-11-12T12:00:00Z") },
});

assert.equal(emptyHome.dateLabel, "Четвер, 12 листопада");
assert.equal(emptyHome.finance.hasBudget, false);
assert.equal(emptyHome.finance.monthSpent, 0);
assert.equal(emptyHome.menu.hasMenu, false);
assert.equal(emptyHome.menu.todayMeals.length, 0);
assert.equal(emptyHome.menu.nextMeal, null);
assert.equal(emptyHome.pantry.totalCount, 0);
assert.equal(emptyHome.pantry.alerts.length, 0);
assert.equal(emptyHome.shopping.toBuyCount, 0);
assert.equal(emptyHome.weeks.length, 5);
assert.equal(emptyHome.recentScans.length, 0);
assert.equal(emptyHome.pendingScan, null);

// Тест buildHomeModel із заповненими даними
const filledHome = buildHomeModel({
  today: "2026-11-12",
  familyCount: 4,
  portions: 3.5,
  finance: {
    budget: 18000,
    receipts: [
      {
        id: "r1",
        purchasedAt: "2026-11-12",
        storeName: "Сільпо",
        total: 1284.5,
        inputSource: "receipt",
        scanInputType: null,
        items: [],
      },
      {
        id: "r2",
        purchasedAt: "2026-11-05",
        storeName: "АТБ",
        total: 6175.5,
        inputSource: "manual",
        scanInputType: null,
        items: [],
      },
    ],
    householdCount: 2,
  },
  menu: {
    entries: [
      {
        id: "m1",
        plan_date: "2026-11-12",
        meal_type: "breakfast",
        title: "Сирники",
        cooked_at: "2026-11-12T08:00:00Z",
        servings: null,
        recipes: {
          id: "rec1",
          title: "Сирники зі сметаною",
          cook_minutes: 25,
          base_servings: 2,
          recipe_ingredients: [{ product_id: "prod-cheese", quantity: 400, optional: false }],
        },
      },
      {
        id: "m2",
        plan_date: "2026-11-12",
        meal_type: "lunch",
        title: "Борщ",
        cooked_at: null,
        servings: null,
        recipes: {
          id: "rec2",
          title: "Борщ із пампушками",
          cook_minutes: 60,
          base_servings: 4,
          recipe_ingredients: [{ product_id: "prod-meat", quantity: 600, optional: false }],
        },
      },
      {
        id: "m3",
        plan_date: "2026-11-12",
        meal_type: "dinner",
        title: "Курка",
        cooked_at: null,
        servings: null,
        recipes: null,
      },
    ],
    products: new Map([
      ["prod-cheese", { unit: "г", isStaple: false, storeId: "store-silpo" }],
      ["prod-meat", { unit: "г", isStaple: false, storeId: "store-silpo" }],
    ]),
    names: new Map([
      ["prod-cheese", "Сир"],
      ["prod-meat", "Куряче філе"],
    ]),
    stock: new Map([
      ["prod-cheese", 500],
      ["prod-meat", 1000],
    ]),
  },
  pantry: {
    items: [
      {
        id: "p1",
        product_id: "prod-meat",
        quantity: 600,
        storage_zone: "fridge",
        expires_at: "2026-11-13",
        products: { id: "prod-meat", name: "Куряче філе", category: "м'ясо", unit: "г" },
      },
      {
        id: "p2",
        product_id: "prod-milk",
        quantity: 100,
        storage_zone: "fridge",
        expires_at: null,
        products: { id: "prod-milk", name: "Молоко", category: "молочне", unit: "мл" },
      },
    ],
    historicalMaxMap: new Map([
      ["prod-meat", 1000],
      ["prod-milk", 1000],
    ]),
  },
  shopping: {
    items: [
      {
        id: "s1",
        title: "Молоко",
        quantity: 1000,
        unit: "мл",
        store_id: "store-silpo",
        checked: false,
        stocked_at: null,
        product_id: "prod-milk",
        products: { id: "prod-milk", name: "Молоко", category: "молочне", unit: "мл", preferred_store_id: "store-silpo" },
      },
    ],
    stores: [
      { id: "store-silpo", name: "Сільпо", access: "walk", kind: "supermarket", sort_order: 1 },
    ],
    storeProducts: [
      { store_id: "store-silpo", product_id: "prod-milk", price: 42, price_updated_at: "2026-11-10" },
    ],
    receipts: [],
    receiptItems: [],
  },
  scans: {
    inboxScans: [
      {
        id: "scan1",
        channel: "telegram",
        inputType: "receipt",
        status: "pending",
        mode: "add",
        storeName: "Сільпо",
        total: 1284.5,
        items: [
          { raw: "хліб", productId: null, name: "Хліб", category: "хліб", unit: "шт", quantity: 1, uncertain: false, price: 25 },
          { raw: "сир", productId: null, name: "Сир", category: "молочне", unit: "г", quantity: 300, uncertain: true, price: 90 },
        ],
        createdAt: "2026-11-12T08:42:00Z",
      },
    ],
    now: new Date("2026-11-12T12:00:00Z"),
  },
});

assert.equal(filledHome.finance.hasBudget, true);
assert.equal(filledHome.finance.monthSpent, 7460);
assert.equal(filledHome.finance.todaySpent, 1284.5);
assert.equal(filledHome.finance.paceNote, `на ${formatUah(260)} вище темпу`);
assert.equal(filledHome.menu.hasMenu, true);
assert.equal(filledHome.menu.todayMeals.length, 3);
// Сирники приготовані
assert.equal(filledHome.menu.todayMeals[0].isNextUncooked, false);
assert.equal(filledHome.menu.todayMeals[0].status.kind, "cooked");
// Борщ — наступна неприготована страва
assert.equal(filledHome.menu.todayMeals[1].isNextUncooked, true);
assert.equal(filledHome.menu.todayMeals[1].status.kind, "ready");
// Курка — не наступна (борщ перед нею)
assert.equal(filledHome.menu.todayMeals[2].isNextUncooked, false);
assert.equal(filledHome.menu.nextMeal?.title, "Борщ із пампушками");
assert.equal(filledHome.menu.subsequentMeal?.title, "Курка");
// Склад: куряче філе спливає завтра (у меню на сьогодні), молоко — мало
assert.equal(filledHome.pantry.totalCount, 2);
assert.equal(filledHome.pantry.alerts.length, 2);
assert.equal(filledHome.pantry.alerts[0].name, "Куряче філе");
assert.match(filledHome.pantry.alerts[0].note, /Спливає завтра — у меню на сьогодні/);
assert.equal(filledHome.pantry.alerts[1].name, "Молоко");
assert.equal(filledHome.pantry.alerts[1].note, "Мало · уже в списку покупок");
// Скани: черга містить pending скан
assert.equal(filledHome.pendingScan?.title, "Чек із Сільпо чекає перевірки");
assert.equal(filledHome.pendingScan?.uncertainCount, 1);

console.log("ok: скан — розпізнавання, черга, наслідки");
console.log("ok: огляд — темп, тижні, дати, модель");
