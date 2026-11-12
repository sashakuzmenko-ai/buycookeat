// node scripts/check-logic.ts — перевірка розрахунку порцій, списку покупок і автозаповнення
import assert from "node:assert/strict";
import { autoFill, buildShoppingList, formatQty, householdPortions, ingredientUsage, roundCooking, roundQty } from "../src/lib/shopping.ts";
import { dayMarkFromSlots, dishStockStatus, pantryCoveragePercent, positionCountLabel, summarizeMenu } from "../src/lib/menu.ts";
import { addDays, weekDays, weekStart } from "../src/lib/dates.ts";
import { SEED_FAMILY, SEED_PRODUCTS, SEED_RECIPES, SEED_STORES, SEED_EQUIPMENT } from "../src/lib/seed-data.ts";
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

console.log(`ok: логіка і стартові дані (${SEED_PRODUCTS.length} продуктів, ${SEED_RECIPES.length} рецептів)`);
