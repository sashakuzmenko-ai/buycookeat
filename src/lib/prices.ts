// Чиста логіка розрахунку цін, порівняння «Де що дешевше» та витрат по магазинах.
// Без звернень до бази — тестується scripts/check-logic.ts.

export type Unit = "г" | "мл" | "шт";

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
  quantity: number | string | null | undefined,
  unit: string | null | undefined,
  price: number | string | null | undefined,
): number | null {
  if (price == null || price === "") return null;
  const numPrice = Number(price);
  if (!Number.isFinite(numPrice) || numPrice <= 0) return null;

  const numQty = quantity != null && quantity !== "" ? Number(quantity) : 1;
  if (!Number.isFinite(numQty) || numQty <= 0) return null;

  const basis = getUnitBasis(unit);
  return Math.round(((numPrice / numQty) * basis) * 100) / 100;
}

/**
 * Індекс останніх відомих цін на продукти в магазинах:
 * Спершу з позицій чеків за найсвіжішою датою чека,
 * а якщо їх немає — зі store_products.price.
 */
export class StorePriceIndex {
  private readonly prices = new Map<string, number>(); // key: `${storeId}:${productId}`
  private readonly freshestStoreByProduct = new Map<string, { storeId: string; price: number; at: number }>();
  private readonly storeReceiptMap = new Map<string, string>(); // storeName (lowercase) -> storeId

  constructor(
    stores: readonly StoreInput[],
    receipts: readonly ReceiptInput[],
    receiptItems: readonly ReceiptItemInput[],
    storeProducts: readonly StoreProductInput[],
  ) {
    for (const s of stores) {
      this.storeReceiptMap.set(s.id, s.id);
      if (s.name) this.storeReceiptMap.set(s.name.trim().toLowerCase(), s.id);
    }

    // 1. Спочатку зчитуємо базові ціни зі store_products.price
    for (const sp of storeProducts) {
      if (!sp.store_id || !sp.product_id || sp.price == null || sp.price === "") continue;
      const numPrice = Number(sp.price);
      if (!Number.isFinite(numPrice) || numPrice <= 0) continue;
      this.prices.set(`${sp.store_id}:${sp.product_id}`, numPrice);

      const parsedAt = sp.price_updated_at ? Date.parse(sp.price_updated_at) : 0;
      const at = Number.isNaN(parsedAt) ? 0 : parsedAt;
      const prev = this.freshestStoreByProduct.get(sp.product_id);
      if (!prev || at >= prev.at) {
        this.freshestStoreByProduct.set(sp.product_id, { storeId: sp.store_id, price: numPrice, at });
      }
    }

    // 2. Збираємо позиції чеків: групуємо та знаходимо найостанніший чек для (магазин, продукт)
    type Candidate = {
      pricePerBasis: number;
      purchasedAt: string;
      createdAt: string;
    };
    const receiptById = new Map<string, ReceiptInput>();
    for (const r of receipts) receiptById.set(r.id, r);

    const latestReceiptItems = new Map<string, Candidate>(); // key: `${storeId}:${productId}`

    for (const item of receiptItems) {
      if (!item.product_id) continue;
      const receipt = receiptById.get(item.receipt_id);
      if (!receipt) continue;

      let storeId = receipt.store_id;
      if (!storeId && receipt.store_name) {
        storeId = this.storeReceiptMap.get(receipt.store_name.trim().toLowerCase()) ?? null;
      }
      if (!storeId) continue;

      const norm = normalizeReceiptItemPrice(item.quantity, item.unit, item.price);
      if (norm == null) continue;

      const purchasedAt = receipt.purchased_at || "1970-01-01";
      const createdAt = item.created_at || receipt.created_at || "";
      const key = `${storeId}:${item.product_id}`;

      const existing = latestReceiptItems.get(key);
      if (!existing) {
        latestReceiptItems.set(key, { pricePerBasis: norm, purchasedAt, createdAt });
      } else {
        const cmp = purchasedAt.localeCompare(existing.purchasedAt) || createdAt.localeCompare(existing.createdAt);
        if (cmp >= 0) {
          latestReceiptItems.set(key, { pricePerBasis: norm, purchasedAt, createdAt });
        }
      }
    }

    // Записуємо ціни з чеків поверх store_products (позиція з чека має вищий пріоритет)
    for (const [key, cand] of latestReceiptItems) {
      this.prices.set(key, cand.pricePerBasis);
      const [, productId] = key.split(":");
      const storeId = key.substring(0, key.indexOf(":"));
      const parsedAt = cand.purchasedAt ? Date.parse(cand.purchasedAt) : 0;
      const at = Number.isNaN(parsedAt) ? 0 : parsedAt;
      const prev = this.freshestStoreByProduct.get(productId);
      if (!prev || at >= prev.at) {
        this.freshestStoreByProduct.set(productId, { storeId, price: cand.pricePerBasis, at });
      }
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
  quantity: number | string | null | undefined,
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
    const candidateItemIds: string[] = [];
    const candidateItemNames: string[] = [];
    let totalSavingsForStore = 0;

    for (const item of activeItems) {
      if (item.store_id === targetStore.id) continue; // вже в цьому магазині

      // Поточна ціна позиції в її теперішньому магазині
      const currentPricePerBasis = item.store_id
        ? priceIndex.getExactStorePrice(item.store_id, item.product_id!)
        : priceIndex.getPrice(item.store_id, item.product_id!);

      if (currentPricePerBasis == null) continue;
      const currentItemCost = calculateItemEstimatedPrice(item.quantity, item.unit, currentPricePerBasis);
      if (currentItemCost == null) continue;

      // Ціна в цільовому магазині
      const targetPricePerBasis = priceIndex.getExactStorePrice(targetStore.id, item.product_id!);
      if (targetPricePerBasis == null) continue;
      const targetItemCost = calculateItemEstimatedPrice(item.quantity, item.unit, targetPricePerBasis);
      if (targetItemCost == null) continue;

      const diff = currentItemCost - targetItemCost;
      // Враховуємо суттєву різницю (від 0.5 ₴)
      if (diff >= 0.5) {
        totalSavingsForStore += diff;
        candidateItemIds.push(item.id);
        const name = item.products?.name ?? item.title ?? "продукт";
        candidateItemNames.push(name.toLocaleLowerCase("uk"));
      }
    }

    if (totalSavingsForStore >= 1 && totalSavingsForStore > maxSavings) {
      maxSavings = totalSavingsForStore;
      bestRecommendation = {
        targetStoreId: targetStore.id,
        targetStoreName: targetStore.name,
        savingAmount: Math.round(totalSavingsForStore),
        itemIds: candidateItemIds,
        itemNames: [...new Set(candidateItemNames)],
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
  const storeMap = new Map<string, StoreInput>();
  for (const s of stores) storeMap.set(s.id, s);

  // Карта назв магазинів для зв'язку
  const storeByName = new Map<string, StoreInput>();
  for (const s of stores) {
    if (s.name) storeByName.set(s.name.trim().toLowerCase(), s);
  }

  const receiptById = new Map<string, ReceiptInput>();
  for (const r of receipts) receiptById.set(r.id, r);

  // Знаходимо всі позиції чеків з валідною ціною
  const validReceiptItems: {
    productId: string;
    storeId: string;
    pricePerBasis: number;
    purchasedAt: string;
  }[] = [];

  for (const item of receiptItems) {
    if (!item.product_id) continue;
    const r = receiptById.get(item.receipt_id);
    if (!r) continue;

    let store = r.store_id ? storeMap.get(r.store_id) : undefined;
    if (!store && r.store_name) {
      store = storeByName.get(r.store_name.trim().toLowerCase());
    }
    if (!store) continue;

    const norm = normalizeReceiptItemPrice(item.quantity, item.unit, item.price);
    if (norm == null) continue;

    validReceiptItems.push({
      productId: item.product_id,
      storeId: store.id,
      pricePerBasis: norm,
      purchasedAt: r.purchased_at || "1970-01-01",
    });
  }

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

    rows.push({
      productId,
      productName: prod.name,
      unit: prod.unit,
      pricesByStore: storePrices.map((sp) => ({
        storeId: sp.storeId,
        storeName: sp.storeName,
        price: sp.price,
        formattedPrice: sp.price != null ? `${sp.price.toFixed(2).replace(".", ",")} ₴` : "—",
        isMin: sp.price != null && minPrice != null && Math.abs(sp.price - minPrice) < 0.001,
      })),
    });
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

  // Карта назв магазинів
  const storeMap = new Map<string, StoreInput>();
  const storeByName = new Map<string, StoreInput>();
  for (const s of stores) {
    storeMap.set(s.id, s);
    if (s.name) storeByName.set(s.name.trim().toLowerCase(), s);
  }

  // Сума за позиціями на випадок, якщо receipt.total не заповнений
  const receiptItemTotals = new Map<string, number>();
  for (const item of receiptItems) {
    if (item.price != null && item.price !== "") {
      const p = Number(item.price);
      if (Number.isFinite(p) && p > 0) {
        receiptItemTotals.set(item.receipt_id, (receiptItemTotals.get(item.receipt_id) ?? 0) + p);
      }
    }
  }

  // Фільтруємо чеки за поточний місяць
  type StoreStats = { count: number; total: number };
  const statsByStoreId = new Map<string, StoreStats>();

  for (const r of receipts) {
    if (!r.purchased_at) continue;
    const parts = r.purchased_at.split("-");
    if (parts.length < 2) continue;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    if (y !== curYear || m !== curMonth) continue;

    let store = r.store_id ? storeMap.get(r.store_id) : undefined;
    if (!store && r.store_name) {
      store = storeByName.get(r.store_name.trim().toLowerCase());
    }
    if (!store) continue;

    const receiptTotal = r.total != null && r.total !== "" ? Number(r.total) : (receiptItemTotals.get(r.id) ?? 0);
    const validTotal = Number.isFinite(receiptTotal) && receiptTotal >= 0 ? receiptTotal : 0;

    const cur = statsByStoreId.get(store.id) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += validTotal;
    statsByStoreId.set(store.id, cur);
  }

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
