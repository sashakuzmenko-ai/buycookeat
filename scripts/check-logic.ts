// node scripts/check-logic.ts — перевірка розрахунку порцій, списку покупок і автозаповнення
import assert from "node:assert/strict";
import { autoFill, buildShoppingList, formatQty, householdPortions, ingredientUsage, roundCooking, roundQty } from "../src/lib/shopping.ts";
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

console.log(`ok: логіка і стартові дані (${SEED_PRODUCTS.length} продуктів, ${SEED_RECIPES.length} рецептів)`);
