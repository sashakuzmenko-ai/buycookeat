// Спільна презентація списку покупок для UI і Telegram (без цін).

import { formatDate } from "./dates.ts";
import { formatQty } from "./shopping.ts";

export type ShoppingRowForGroup = {
  store_id: string | null;
  checked: boolean;
  productName: string;
  quantity: number | null;
  unit: string | null;
};

export type StoreGroupBase<T extends ShoppingRowForGroup> = {
  storeId: string | null;
  storeName: string;
  items: T[];
};

export function sortShoppingItems<T extends ShoppingRowForGroup & { productName: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.checked !== b.checked) return Number(a.checked) - Number(b.checked);
    return a.productName.localeCompare(b.productName, "uk");
  });
}

export function groupShoppingByStore<T extends ShoppingRowForGroup>(
  sorted: T[],
  stores: { id: string; name: string }[],
): StoreGroupBase<T>[] {
  return [
    {
      storeId: null,
      storeName: "Без магазину",
      items: sorted.filter((i) => !i.store_id || !stores.some((s) => s.id === i.store_id)),
    },
    ...stores.map((s) => ({
      storeId: s.id,
      storeName: s.name,
      items: sorted.filter((i) => i.store_id === s.id),
    })),
  ].filter((g) => g.items.length > 0);
}

export type ShoppingTelegramGroup = {
  storeName: string;
  items: { name: string; quantity: string }[];
};

/** Групи для Telegram: лише позиції, які ще не позначені купленими. */
export function buildShoppingTelegramGroups(
  items: ShoppingRowForGroup[],
  stores: { id: string; name: string }[],
): ShoppingTelegramGroup[] {
  const sorted = sortShoppingItems(items);
  return groupShoppingByStore(sorted, stores)
    .map((g) => ({
      storeName: g.storeName,
      items: g.items
        .filter((i) => !i.checked)
        .map((i) => ({
          name: i.productName,
          quantity: i.quantity !== null && i.unit ? formatQty(i.quantity, i.unit) : "—",
        })),
    }))
    .filter((g) => g.items.length > 0);
}

export function weekRangeLabel(weekStart: string, weekEnd: string): string {
  return `${formatDate(weekStart)} – ${formatDate(weekEnd)}`;
}
