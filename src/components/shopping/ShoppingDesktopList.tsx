import React from "react";
import { ShoppingItemRow, type ShoppingItemViewData } from "./ShoppingItemRow";

export interface StoreGroup {
  storeId: string | null;
  storeName: string;
  items: ShoppingItemViewData[];
  estimatedSum: number;
  hasPricedItems: boolean;
}

export function ShoppingDesktopList({ groups }: { groups: StoreGroup[] }) {
  if (groups.length === 0) {
    return (
      <div className="p-8 text-center text-ink-2 bg-surface rounded-[18px] border border-line">
        Список покупок порожній. Заповніть меню на тиждень і натисніть «Зібрати з меню» або додайте позиції вручну.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
      {groups.map((group) => (
        <section
          key={group.storeId ?? "unassigned"}
          className="rounded-[18px] bg-surface border border-line overflow-hidden shadow-xs"
        >
          <div className="p-[16px_18px] bg-ink text-white flex justify-between items-baseline">
            <h2 className="m-0 font-unbounded font-medium text-[16px] truncate pr-2">
              {group.storeName} · {group.items.length}
            </h2>
            <span className="font-mono text-[14px] text-lime font-semibold shrink-0">
              {group.hasPricedItems
                ? `≈ ${Math.round(group.estimatedSum).toLocaleString("uk-UA")} ₴`
                : "—"}
            </span>
          </div>

          <div className="p-[4px_18px_10px]">
            {group.items.map((item) => (
              <ShoppingItemRow key={item.id} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
