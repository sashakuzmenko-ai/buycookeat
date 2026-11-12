// Чиста логіка розрахунку цін, порівняння «Де що дешевше» та витрат по магазинах.
// Без звернень до бази — тестується scripts/check-logic.ts.

export type Unit = "г" | "мл" | "шт";
export type NullableNumberish = number | string | null | undefined;

export const PRICE_BASIS: Record<string, number> = {
  "г": 1000,
  "мл": 1000,
  "шт": 1,
};

export function getUnitBasis(unit?: string | null): number {
  if (!unit) return 1;
  return PRICE_BASIS[unit] ?? 1;
}

export type StoreInput = {
  id: string;
  name: string;
  access?: string;
  visit_frequency?: string;
  phone?: string | null;
  url?: string | null;
  notes?: string | null;
  sort_order?: number;
};

export type ReceiptInput = {
  id: string;
  store_id: string | null;
  store_name?: string | null;
  purchased_at: string; // YYYY-MM-DD
  total: number | string | null;
  created_at?: string;
};

export type ReceiptItemInput = {
  id: string;
  receipt_id: string;
  product_id: string | null;
  raw_name: string;
  quantity: number | string;
  unit: string | null;
  price: number | string | null;
  created_at?: string;
};

export type StoreProductInput = {
  store_id: string;
  product_id: string;
  price: number | string | null;
  price_updated_at?: string | null;
};

/** Нормалізована ціна з чека у перерахунку на базову одиницю (1 кг, 1 л, 1 шт). */
export function normalizeReceiptItemPrice(
  quantity: NullableNumberish,
  unit: string | null | undefined,
  price: NullableNumberish,
): number | null {
  if (price == null || price === "") return null;
  const numPrice = Number(price);
  if (!Number.isFinite(numPrice) || numPrice <= 0) return null;

  const numQty = quantity != null && quantity !== "" ? Number(quantity) : 1;
  if (!Number.isFinite(numQty) || numQty <= 0) return null;

  const basis = getUnitBasis(unit);
  return Math.round(((numPrice / numQty) * basis) * 100) / 100;
}

function parseIsoDate(dateStr?: string | null): number {
  if (!dateStr) return 0;
  const parsed = Date.parse(dateStr);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function buildStoreNameMap(stores: readonly StoreInput[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of stores) {
    map.set(s.id, s.id);
    if (s.name) map.set(s.name.trim().toLowerCase(), s.id);
  }
  return map;
}

function resolveStoreId(receipt: ReceiptInput, storeMap: Map<string, string>): string | null {
  if (receipt.store_id) return receipt.store_id;
  if (receipt.store_name) {
    return storeMap.get(receipt.store_name.trim().toLowerCase()) ?? null;
  }
  return null;
}

function updateFreshest(
  freshest: Map<string, { storeId: string; price: number; at: number }>,
  productId: string,
  storeId: string,
  price: number,
  at: number,
) {
  const prev = freshest.get(productId);
  if (!prev || at >= prev.at) {
    freshest.set(productId, { storeId, price, at });
  }
}

type ReceiptCandidate = {
  pricePerBasis: number;
  purchasedAt: string;
  createdAt: string;
  storeId: string;
  productId: string;
};

function extractLatestReceiptPrices(
  receipts: readonly ReceiptInput[],
  receiptItems: readonly ReceiptItemInput[],
  storeMap: Map<string, string>,
): Map<string, ReceiptCandidate> {
  const receiptById = new Map<string, ReceiptInput>();
  for (const r of receipts) receiptById.set(r.id, r);

  const latest = new Map<string, ReceiptCandidate>();
  for (const item of receiptItems) {
    if (!item.product_id) continue;
    const receipt = receiptById.get(item.receipt_id);
    if (!receipt) continue;
    const storeId = resolveStoreId(receipt, storeMap);
    if (!storeId) continue;
    const norm = normalizeReceiptItemPrice(item.quantity, item.unit, item.price);
    if (norm == null) continue;

    const purchasedAt = receipt.purchased_at || "1970-01-01";
    const createdAt = item.created_at || receipt.created_at || "";
    const key = `${storeId}:${item.product_id}`;
    const existing = latest.get(key);
    if (!existing) {
      latest.set(key, { pricePerBasis: norm, purchasedAt, createdAt, storeId, productId: item.product_id });
    } else {
      const cmp = purchasedAt.localeCompare(existing.purchasedAt) || createdAt.localeCompare(existing.createdAt);
      if (cmp >= 0) {
        latest.set(key, { pricePerBasis: norm, purchasedAt, createdAt, storeId, productId: item.product_id });
      }
    }
  }
  return latest;
}

/**
 * Індекс останніх відомих цін на продукти в магазинах:
 * Спершу з позицій чеків за найсвіжішою датою чека,
 * а якщо їх немає — зі store_products.price.
 */
export class StorePriceIndex {
  private readonly prices = new Map<string, number>(); // key: `${storeId}:${productId}`
  private readonly freshestStoreByProduct = new Map<string, { storeId: string; price: number; at: number }>();
  private readonly storeReceiptMap: Map<string, string>;

  constructor(
    stores: readonly StoreInput[],
    receipts: readonly ReceiptInput[],
    receiptItems: readonly ReceiptItemInput[],
    storeProducts: readonly StoreProductInput[],
  ) {
    this.storeReceiptMap = buildStoreNameMap(stores);

    // 1. Спочатку зчитуємо базові ціни зі store_products.price
    for (const sp of storeProducts) {
      if (!sp.store_id || !sp.product_id || sp.price == null || sp.price === "") continue;
      const numPrice = Number(sp.price);
      if (!Number.isFinite(numPrice) || numPrice <= 0) continue;
      this.prices.set(`${sp.store_id}:${sp.product_id}`, numPrice);
      updateFreshest(this.freshestStoreByProduct, sp.product_id, sp.store_id, numPrice, parseIsoDate(sp.price_updated_at));
    }

    // 2. Зчитуємо ціни з чеків
    const receiptPrices = extractLatestReceiptPrices(receipts, receiptItems, this.storeReceiptMap);
    for (const [key, cand] of receiptPrices) {
      this.prices.set(key, cand.pricePerBasis);
      updateFreshest(this.freshestStoreByProduct, cand.productId, cand.storeId, cand.pricePerBasis, parseIsoDate(cand.purchasedAt));
    }
  }

  /** Повертає ціну за базову одиницю (1 кг, 1 л, 1 шт) для вказаного магазину та продукту. */
  getPrice(storeId: string | null | undefined, productId: string | null | undefined): number | undefined {
    if (!productId) return undefined;
    if (storeId) {
      const p = this.prices.get(`${storeId}:${productId}`);
      if (p !== undefined) return p;
    }
    // Якщо для магазину ціна невідома або магазин не вказано — беремо найсвіжішу ціну взагалі
    return this.freshestStoreByProduct.get(productId)?.price;
  }

  /** Точна ціна саме у вказаному магазині (без фолбеку на інші магазини). */
  getExactStorePrice(storeId: string, productId: string): number | undefined {
    return this.prices.get(`${storeId}:${productId}`);
  }
}

/** Орієнтовна ціна позиції у списку покупок. */
export function calculateItemEstimatedPrice(
  quantity: NullableNumberish,
  unit: string | null | undefined,
  pricePerBasis: number | undefined,
): number | null {
  if (pricePerBasis == null || !Number.isFinite(pricePerBasis) || pricePerBasis <= 0) return null;
  if (quantity == null || quantity === "") return null;
  const numQty = Number(quantity);
  if (!Number.isFinite(numQty) || numQty <= 0) return null;

  const basis = getUnitBasis(unit);
  return Math.round(((numQty / basis) * pricePerBasis) * 100) / 100;
}

export type ShoppingItemInput = {
  id: string;
  title: string | null;
  quantity: number | null;
  unit: string | null;
  store_id: string | null;
  checked: boolean;
  stocked_at: string | null;
  product_id: string | null;
  products?: { name: string; category: string; unit?: string } | null;
};

export type SavingsRecommendation = {
  targetStoreId: string;
  targetStoreName: string;
  savingAmount: number;
  itemIds: string[];
  itemNames: string[];
};

type StoreSavingCandidate = {
  savingAmount: number;
  itemIds: string[];
  itemNames: string[];
};

function calculateItemSaving(
  item: ShoppingItemInput,
  targetStoreId: string,
  priceIndex: StorePriceIndex,
): number | null {
  const currentPricePerBasis = item.store_id
    ? priceIndex.getExactStorePrice(item.store_id, item.product_id!)
    : priceIndex.getPrice(item.store_id, item.product_id!);
  if (currentPricePerBasis == null) return null;

  const currentItemCost = calculateItemEstimatedPrice(item.quantity, item.unit, currentPricePerBasis);
  if (currentItemCost == null) return null;

  const targetPricePerBasis = priceIndex.getExactStorePrice(targetStoreId, item.product_id!);
  if (targetPricePerBasis == null) return null;

  const targetItemCost = calculateItemEstimatedPrice(item.quantity, item.unit, targetPricePerBasis);
  if (targetItemCost == null) return null;

  const diff = currentItemCost - targetItemCost;
  return diff >= 0.5 ? diff : null;
}

function evaluateStoreSavings(
  targetStoreId: string,
  activeItems: readonly ShoppingItemInput[],
  priceIndex: StorePriceIndex,
): StoreSavingCandidate | null {
  const itemIds: string[] = [];
  const itemNames: string[] = [];
  let totalSavings = 0;

  for (const item of activeItems) {
    if (item.store_id === targetStoreId) continue;
    const diff = calculateItemSaving(item, targetStoreId, priceIndex);
    if (diff != null) {
      totalSavings += diff;
      itemIds.push(item.id);
      const name = item.products?.name ?? item.title ?? "продукт";
      itemNames.push(name.toLocaleLowerCase("uk"));
    }
  }

  if (totalSavings < 1) return null;
  return {
    savingAmount: Math.round(totalSavings),
    itemIds,
    itemNames: [...new Set(itemNames)],
  };
}

/**
 * Знаходить підказку «В {Магазині} на {N} ₴ дешевше {продукти} — за вашими чеками».
 * Повертає null, якщо вигіднішого варіанту немає або немає даних чеків.
 */
export function findStoreSavingsRecommendation(
  items: readonly ShoppingItemInput[],
  stores: readonly StoreInput[],
  priceIndex: StorePriceIndex,
): SavingsRecommendation | null {
  const activeItems = items.filter((i) => !i.checked && i.product_id && i.quantity && i.quantity > 0);
  if (activeItems.length === 0 || stores.length < 2) return null;

  let bestRecommendation: SavingsRecommendation | null = null;
  let maxSavings = 0;

  for (const targetStore of stores) {
    const candidate = evaluateStoreSavings(targetStore.id, activeItems, priceIndex);
    if (candidate && candidate.savingAmount > maxSavings) {
      maxSavings = candidate.savingAmount;
      bestRecommendation = {
        targetStoreId: targetStore.id,
        targetStoreName: targetStore.name,
        ...candidate,
      };
    }
  }

  return bestRecommendation;
}

export type PriceComparisonRow = {
  productId: string;
  productName: string;
  unit: string;
  pricesByStore: {
    storeId: string;
    storeName: string;
    price: number | null;
    formattedPrice: string;
    isMin: boolean;
  }[];
};

export type PriceComparisonData = {
  hasReceipts: boolean;
  stores: { id: string; name: string }[];
  rows: PriceComparisonRow[];
};

type ValidReceiptPrice = {
  productId: string;
  storeId: string;
  pricePerBasis: number;
  purchasedAt: string;
};

function collectValidReceiptItems(
  stores: readonly StoreInput[],
  receipts: readonly ReceiptInput[],
  receiptItems: readonly ReceiptItemInput[],
): ValidReceiptPrice[] {
  const storeMap = buildStoreNameMap(stores);
  const receiptById = new Map<string, ReceiptInput>();
  for (const r of receipts) receiptById.set(r.id, r);

  const results: ValidReceiptPrice[] = [];
  for (const item of receiptItems) {
    if (!item.product_id) continue;
    const r = receiptById.get(item.receipt_id);
    if (!r) continue;
    const storeId = resolveStoreId(r, storeMap);
    if (!storeId) continue;
    const norm = normalizeReceiptItemPrice(item.quantity, item.unit, item.price);
    if (norm == null) continue;

    results.push({
      productId: item.product_id,
      storeId,
      pricePerBasis: norm,
      purchasedAt: r.purchased_at || "1970-01-01",
    });
  }
  return results;
}

function buildComparisonRow(
  productId: string,
  product: { id: string; name: string; unit: string },
  relevantStores: readonly { id: string; name: string }[],
  latestPrice: Map<string, { price: number; purchasedAt: string }>,
): PriceComparisonRow {
  const storePrices = relevantStores.map((s) => {
    const entry = latestPrice.get(`${productId}:${s.id}`);
    return {
      storeId: s.id,
      storeName: s.name,
      price: entry?.price ?? null,
    };
  });

  const pricesWithValues = storePrices.filter((sp) => sp.price != null).map((sp) => sp.price!);
  const minPrice = pricesWithValues.length > 0 ? Math.min(...pricesWithValues) : null;

  return {
    productId,
    productName: product.name,
    unit: product.unit,
    pricesByStore: storePrices.map((sp) => ({
      storeId: sp.storeId,
      storeName: sp.storeName,
      price: sp.price,
      formattedPrice: sp.price != null ? `${sp.price.toFixed(2).replace(".", ",")} ₴` : "—",
      isMin: sp.price != null && minPrice != null && Math.abs(sp.price - minPrice) < 0.001,
    })),
  };
}

/**
 * Таблиця «Де що дешевше»: порівняння цін між магазинами
 * ВИКЛЮЧНО за позиціями власних чеків.
 */
export function buildPriceComparisonTable(
  stores: readonly StoreInput[],
  receipts: readonly ReceiptInput[],
  receiptItems: readonly ReceiptItemInput[],
  products: readonly { id: string; name: string; unit: string }[],
): PriceComparisonData {
  const validReceiptItems = collectValidReceiptItems(stores, receipts, receiptItems);
  if (validReceiptItems.length === 0) {
    return { hasReceipts: false, stores: [], rows: [] };
  }

  // Знаходимо останню ціну для кожної пари (productId, storeId)
  const latestPrice = new Map<string, { price: number; purchasedAt: string }>();
  const activeStoreIds = new Set<string>();
  const activeProductIds = new Set<string>();

  for (const item of validReceiptItems) {
    const key = `${item.productId}:${item.storeId}`;
    const existing = latestPrice.get(key);
    if (!existing || item.purchasedAt >= existing.purchasedAt) {
      latestPrice.set(key, { price: item.pricePerBasis, purchasedAt: item.purchasedAt });
      activeStoreIds.add(item.storeId);
      activeProductIds.add(item.productId);
    }
  }

  // Колонки магазинів (у порядку сортування)
  const relevantStores = stores
    .filter((s) => activeStoreIds.has(s.id))
    .map((s) => ({ id: s.id, name: s.name }));

  if (relevantStores.length === 0) {
    return { hasReceipts: false, stores: [], rows: [] };
  }

  const productMap = new Map<string, { id: string; name: string; unit: string }>();
  for (const p of products) productMap.set(p.id, p);

  // Будуємо рядки для продуктів
  const rows: PriceComparisonRow[] = [];
  for (const productId of activeProductIds) {
    const prod = productMap.get(productId);
    if (!prod) continue;
    rows.push(buildComparisonRow(productId, prod, relevantStores, latestPrice));
  }

  // Сортуємо: спочатку продукти, що мають ціни в кількох магазинах, потім за алфавітом
  rows.sort((a, b) => {
    const countA = a.pricesByStore.filter((p) => p.price != null).length;
    const countB = b.pricesByStore.filter((p) => p.price != null).length;
    if (countA !== countB) return countB - countA;
    return a.productName.localeCompare(b.productName, "uk");
  });

  return {
    hasReceipts: true,
    stores: relevantStores,
    rows,
  };
}

export type MonthlyStoreSummary = {
  storeId: string;
  storeName: string;
  initial: string;
  receiptsCount: number;
  totalSum: number;
  averageCheck: number;
  note: string;
};

const UK_MONTHS_NOMINATIVE = [
  "січень", "лютий", "березень", "квітень", "травень", "червень",
  "липень", "серпень", "вересень", "жовтень", "листопад", "грудень",
] as const;

export function currentMonthUk(d = new Date()): string {
  return UK_MONTHS_NOMINATIVE[d.getMonth()] ?? "";
}

export function pluralizeChecks(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 19) return `${count} чеків`;
  if (mod10 === 1) return `${count} чек`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} чеки`;
  return `${count} чеків`;
}

export function pluralizePositions(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 19) return `${count} позицій`;
  if (mod10 === 1) return `${count} позиція`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} позиції`;
  return `${count} позицій`;
}

function computeReceiptItemTotals(receiptItems: readonly ReceiptItemInput[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const item of receiptItems) {
    if (item.price != null && item.price !== "") {
      const p = Number(item.price);
      if (Number.isFinite(p) && p > 0) {
        totals.set(item.receipt_id, (totals.get(item.receipt_id) ?? 0) + p);
      }
    }
  }
  return totals;
}

function isReceiptInMonth(purchasedAt: string | null | undefined, curYear: number, curMonth: number): boolean {
  if (!purchasedAt) return false;
  const parts = purchasedAt.split("-");
  if (parts.length < 2) return false;
  const y = Number.parseInt(parts[0], 10);
  const m = Number.parseInt(parts[1], 10) - 1;
  return y === curYear && m === curMonth;
}

type StoreStats = { count: number; total: number };

function aggregateMonthlyStoreStats(
  stores: readonly StoreInput[],
  receipts: readonly ReceiptInput[],
  itemTotals: Map<string, number>,
  curYear: number,
  curMonth: number,
): Map<string, StoreStats> {
  const storeMap = buildStoreNameMap(stores);
  const stats = new Map<string, StoreStats>();

  for (const r of receipts) {
    if (!isReceiptInMonth(r.purchased_at, curYear, curMonth)) continue;
    const storeId = resolveStoreId(r, storeMap);
    if (!storeId) continue;

    const receiptTotal = r.total != null && r.total !== "" ? Number(r.total) : (itemTotals.get(r.id) ?? 0);
    const validTotal = Number.isFinite(receiptTotal) && receiptTotal >= 0 ? receiptTotal : 0;

    const cur = stats.get(storeId) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += validTotal;
    stats.set(storeId, cur);
  }

  return stats;
}

/**
 * Блок «Наші магазини · місяць» — агрегати з чеків за поточний місяць.
 */
export function buildMonthlyStoreSummaries(
  stores: readonly StoreInput[],
  receipts: readonly ReceiptInput[],
  receiptItems: readonly ReceiptItemInput[] = [],
  now = new Date(),
): MonthlyStoreSummary[] {
  const curYear = now.getFullYear();
  const curMonth = now.getMonth(); // 0..11
  const itemTotals = computeReceiptItemTotals(receiptItems);
  const statsByStoreId = aggregateMonthlyStoreStats(stores, receipts, itemTotals, curYear, curMonth);

  const summaries: MonthlyStoreSummary[] = [];

  for (const s of stores) {
    const stats = statsByStoreId.get(s.id);
    if (!stats || stats.count === 0) continue;

    const avg = stats.count > 0 ? Math.round(stats.total / stats.count) : 0;
    const initial = (s.name || "М").trim().charAt(0).toUpperCase();

    const note = stats.count === 1
      ? "1 чек"
      : `${pluralizeChecks(stats.count)} · середній ${avg.toLocaleString("uk-UA")} ₴`;

    summaries.push({
      storeId: s.id,
      storeName: s.name,
      initial,
      receiptsCount: stats.count,
      totalSum: Math.round(stats.total),
      averageCheck: avg,
      note,
    });
  }

  // Сортуємо магазини за сумою витрат спаданням
  summaries.sort((a, b) => b.totalSum - a.totalSum);

  return summaries;
}
