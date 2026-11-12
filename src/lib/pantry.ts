// Чиста логіка для модуля «Склад» (/pantry): розрахунок шкал, терміни, фільтри, рух та прогноз.
// Без зовнішніх залежностей від середовища — тестується scripts/check-logic.ts

import { todayISO, formatDate } from "./dates.ts";
import { formatQty, ingredientUsage, type PlanLine, type ProductInfo } from "./shopping.ts";
import type { StorageZone, MovementSource } from "./db-types.ts";

export type { StorageZone, MovementSource };

export const STORAGE_ZONES: readonly StorageZone[] = ["fridge", "freezer", "pantry"] as const;

export const STORAGE_ZONE_LABELS: Record<StorageZone, string> = {
  fridge: "Холодильник",
  freezer: "Морозилка",
  pantry: "Комора",
};

/** Поріг у відсотках, нижче або на рівні якого залишок вважається низьким («мало»). */
export const LOW_STOCK_PERCENT_THRESHOLD = 20;

/** Поріг у днях, до якого термін придатності вважається критичним («термін до 3 днів»). */
export const EXPIRING_DAYS_THRESHOLD = 3;

/** Типова місткість упаковки/об'єму за одиницею виміру за відсутності історичного еталона. */
export const TYPICAL_UNIT_CAPACITY: Record<string, number> = {
  г: 1000,
  мл: 1000,
  шт: 10,
};

/**
 * Розраховує рівень шкали у відсотках (0..100) від звичної кількості продукту.
 * Якщо в даних немає еталона, береться максимум із типової ємності одиниці,
 * історичного максимуму залишку та поточного залишку.
 */
export function calculateScalePercent(
  quantity: number,
  unit: string,
  historicalMax?: number,
): number {
  if (quantity <= 0) return 0;
  const fallback = TYPICAL_UNIT_CAPACITY[unit] ?? 1000;
  const reference = Math.max(fallback, historicalMax ?? 0, quantity);
  if (reference <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((quantity / reference) * 100)));
}

/** Перевіряє, чи залишок є низьким («мало»). */
export function isLowStock(scalePercent: number): boolean {
  return scalePercent <= LOW_STOCK_PERCENT_THRESHOLD;
}

/** Рахує кількість календарних днів від сьогодні до дати придатності (від'ємне = протерміновано). */
export function daysUntilExpiry(expiresAt: string, today = todayISO()): number {
  const d1 = new Date(`${today}T00:00:00Z`);
  const d2 = new Date(`${expiresAt}T00:00:00Z`);
  const diffMs = d2.getTime() - d1.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/** Перевіряє, чи спливає термін придатності протягом заданого порогу (за замовчуванням 3 дні). */
export function isExpiringSoon(
  expiresAt: string | null | undefined,
  today = todayISO(),
  threshold = EXPIRING_DAYS_THRESHOLD,
): boolean {
  if (!expiresAt) return false;
  return daysUntilExpiry(expiresAt, today) <= threshold;
}

/**
 * Текстовий підпис терміну придатності.
 * Наприклад: «Термін до 13 листопада», «Спливає сьогодні», «Термін минув».
 */
export function formatExpiryNote(
  expiresAt: string | null | undefined,
  today = todayISO(),
): string {
  if (!expiresAt) return "";
  const diff = daysUntilExpiry(expiresAt, today);
  if (diff < 0) return "Термін минув";
  if (diff === 0) return "Спливає сьогодні";
  if (diff === 1) return "Спливає завтра";
  return `Термін до ${formatDate(expiresAt)}`;
}

export type ItemState = "normal" | "low" | "expiring";

/** Визначає статус позиції для LevelBar. Термін придатності має найвищий пріоритет. */
export function determineItemState(isExpiring: boolean, isLow: boolean): ItemState {
  if (isExpiring) return "expiring";
  if (isLow) return "low";
  return "normal";
}

/**
 * Відмінювання слова «позиція» за правилами української мови:
 * 1 позиція, 2..4 позиції, 5..20 позицій, 21 позиція тощо.
 */
export function pluralizePositions(count: number): string {
  const n = Math.abs(Math.round(count));
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} позиція`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} позиції`;
  return `${n} позицій`;
}

export type PantryItemView = {
  id: string;
  productId: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  formattedQty: string;
  storageZone: StorageZone;
  expiresAt: string | null;
  scalePercent: number;
  isLow: boolean;
  isExpiring: boolean;
  state: ItemState;
  note: string | null;
};

export type StockSufficiency = {
  willRunOut: boolean;
  productNames: string[];
  message: string | null;
};

/**
 * Рахує, що з меню до кінця тижня (до неділі) закінчиться, порівнюючи потребу
 * неприготованих страв із поточними залишками.
 */
export function calculateWeekSufficiency(
  upcomingPlanLines: readonly PlanLine[],
  stock: Map<string, number>,
  products: Map<string, ProductInfo & { name: string }>,
  portions: number,
): StockSufficiency {
  if (upcomingPlanLines.length === 0) {
    return { willRunOut: false, productNames: [], message: null };
  }

  const totals = new Map<string, number>();
  for (const line of upcomingPlanLines) {
    for (const used of ingredientUsage(line, portions)) {
      const p = products.get(used.productId);
      if (!p || p.isStaple) continue;
      totals.set(used.productId, (totals.get(used.productId) ?? 0) + used.quantity);
    }
  }

  const runOutNames: string[] = [];
  for (const [productId, needed] of totals) {
    const current = stock.get(productId) ?? 0;
    if (needed > current) {
      const p = products.get(productId);
      if (p) runOutNames.push(p.name.toLowerCase());
    }
  }

  if (runOutNames.length === 0) {
    return { willRunOut: false, productNames: [], message: null };
  }

  const namesStr = runOutNames.join(", ");
  const message = `За меню до неділі закінчаться ${namesStr}. Вони вже в списку покупок.`;
  return {
    willRunOut: true,
    productNames: runOutNames,
    message,
  };
}

export type MovementView = {
  id: string;
  sign: "+" | "−" | "=";
  bg: string;
  fg: string;
  title: string;
  note: string;
  createdAt: string;
};

export type MovementInput = {
  id: string;
  product_id: string;
  delta: number;
  source: MovementSource;
  scan_id: string | null;
  meal_plan_entry_id: string | null;
  created_at: string;
  products: { name: string; unit: string } | null;
  incoming_scans?: { store_name: string | null; input_type: string; channel: string } | null;
  meal_plan_entries?: { recipes?: { title: string } | null } | null;
};

const timeFmt = new Intl.DateTimeFormat("uk-UA", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Kyiv",
});

function formatTimeOnly(iso: string): string {
  try {
    return timeFmt.format(new Date(iso));
  } catch {
    return "";
  }
}

/**
 * Групує та форматує записи журналу руху складу за сьогодні у представлення для інтерфейсу.
 */
export function formatMovements(movements: readonly MovementInput[]): MovementView[] {
  const result: MovementView[] = [];
  const handledScanIds = new Set<string>();
  const handledMealPlanIds = new Set<string>();

  for (const m of movements) {
    const timeStr = formatTimeOnly(m.created_at);

    // 1. Групування за сканом
    if (m.scan_id) {
      if (handledScanIds.has(m.scan_id)) continue;
      handledScanIds.add(m.scan_id);

      const scanItems = movements.filter((x) => x.scan_id === m.scan_id);
      const isInventory = m.source === "inventory";
      const sign: MovementView["sign"] = isInventory ? "=" : "+";
      const bg = isInventory ? "#EEF1ED" : "#DDEFEE";
      const fg = isInventory ? "#14201A" : "#124E51";

      const store = m.incoming_scans?.store_name;
      const inputType = m.incoming_scans?.input_type;
      let title = isInventory ? "Інвентаризація" : "Скан";
      if (!isInventory) {
        if (store) title = `Чек · ${store}`;
        else if (inputType === "voice") title = "Голосове";
        else if (inputType === "receipt") title = "Чек";
      }

      const count = scanItems.length;
      const countLabel = pluralizePositions(count);
      const note = timeStr
        ? `${timeStr} · ${countLabel} ${isInventory ? "оновлено" : "додано"}`
        : `${countLabel} ${isInventory ? "оновлено" : "додано"}`;

      result.push({
        id: m.id,
        sign,
        bg,
        fg,
        title,
        note,
        createdAt: m.created_at,
      });
      continue;
    }

    // 2. Групування за списанням приготованого меню
    if (m.meal_plan_entry_id) {
      if (handledMealPlanIds.has(m.meal_plan_entry_id)) continue;
      handledMealPlanIds.add(m.meal_plan_entry_id);

      const dishItems = movements.filter((x) => x.meal_plan_entry_id === m.meal_plan_entry_id);
      const title = m.meal_plan_entries?.recipes?.title ?? "Приготовано";
      const summaryList = dishItems
        .map((x) => {
          const pName = x.products?.name ?? "";
          const qty = formatQty(Math.abs(Number(x.delta)), x.products?.unit ?? "");
          return `${pName} ${qty}`.trim();
        })
        .filter(Boolean)
        .slice(0, 4)
        .join(", ");

      const note = timeStr ? `${timeStr} · ${summaryList}` : summaryList;

      result.push({
        id: m.id,
        sign: "−",
        bg: "#FBE6E0",
        fg: "#8C2A18",
        title,
        note,
        createdAt: m.created_at,
      });
      continue;
    }

    // 3. Індивідуальні ручні рухи та інвентаризація
    const delta = Number(m.delta);
    const pName = m.products?.name ?? "Продукт";
    const pUnit = m.products?.unit ?? "";
    const qtyStr = formatQty(Math.abs(delta), pUnit);

    if (m.source === "inventory") {
      result.push({
        id: m.id,
        sign: "=",
        bg: "#EEF1ED",
        fg: "#14201A",
        title: "Інвентаризація",
        note: timeStr ? `${timeStr} · ${pName}: ${qtyStr}` : `${pName}: ${qtyStr}`,
        createdAt: m.created_at,
      });
    } else if (delta < 0) {
      result.push({
        id: m.id,
        sign: "−",
        bg: "#FBE6E0",
        fg: "#8C2A18",
        title: pName,
        note: timeStr ? `${timeStr} · списано ${qtyStr}` : `списано ${qtyStr}`,
        createdAt: m.created_at,
      });
    } else {
      result.push({
        id: m.id,
        sign: "+",
        bg: "#DDEFEE",
        fg: "#124E51",
        title: pName,
        note: timeStr ? `${timeStr} · додано ${qtyStr}` : `додано ${qtyStr}`,
        createdAt: m.created_at,
      });
    }
  }

  return result;
}
