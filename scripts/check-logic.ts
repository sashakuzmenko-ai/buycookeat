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
import { captureBlockReason, resolveCaptureType } from "../src/lib/scan/capture.ts";
import { chooseProduct } from "../src/lib/scan/products.ts";
import {
  SCAN_INPUTS,
  financeEffectLabel,
  financeMonthLabel,
  formatAmount,
  formatScanDay,
  formatScanWhen,
  formatUah,
  parseScanItems,
  queueTitle,
  shoppingEffectLabel,
  statusLabel,
  stockEffectLabel,
} from "../src/lib/scan/present.ts";
import { buildScanPrompt, normalizeScanResult } from "../src/lib/scan/recognize.ts";
import { parseScanRequest } from "../src/lib/scan/request.ts";

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
assert.equal(formatUah(1284.5), "1 284,50 ₴");
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

console.log("ok: скан — розпізнавання, черга, наслідки");
