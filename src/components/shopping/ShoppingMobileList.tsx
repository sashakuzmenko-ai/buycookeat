"use client";

import React, { useState } from "react";
import type { StoreGroup } from "./ShoppingDesktopList";
import { ShoppingItemRow, type ShoppingItemViewData } from "./ShoppingItemRow";

export interface ShoppingMobileListProps {
  readonly groups: readonly StoreGroup[];
}

export function ShoppingMobileList({ groups }: Readonly<ShoppingMobileListProps>) {
  const [selectedStoreIndex, setSelectedStoreIndex] = useState(0);

  if (groups.length === 0) {
    return (
      <div className="p-6 text-center text-ink-2 bg-surface rounded-[18px] border border-line">
        Список покупок порожній.
      </div>
    );
  }

  const activeIndex = selectedStoreIndex < groups.length ? selectedStoreIndex : 0;
  const activeGroup = groups[activeIndex];

  // Групуємо позиції вибраного магазину за категорією
  const categoryMap = new Map<string, ShoppingItemViewData[]>();
  for (const item of activeGroup.items) {
    const cat = item.category || "інше";
    const existing = categoryMap.get(cat);
    if (!existing) {
      categoryMap.set(cat, [item]);
    } else {
      existing.push(item);
    }
  }

  const categoryGroups = [...categoryMap.entries()].map(([name, items]) => ({
    name,
    items,
  }));

  return (
    <div className="space-y-4">
      {/* Перемикач магазинів вкладками */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {groups.map((group, idx) => {
          const isActive = idx === activeIndex;
          const sumPart = group.hasPricedItems
            ? ` · ≈ ${Math.round(group.estimatedSum).toLocaleString("uk-UA")} ₴`
            : "";
          return (
            <button
              key={group.storeId ?? "unassigned"}
              type="button"
              aria-pressed={isActive}
              onClick={() => setSelectedStoreIndex(idx)}
              className={`flex-1 min-w-[140px] h-[48px] px-3 rounded-[14px] text-[14px] font-semibold whitespace-nowrap transition cursor-pointer ${
                isActive
                  ? "bg-ink text-white border border-ink"
                  : "bg-surface text-ink border border-line-strong hover:bg-soft"
              }`}
            >
              {group.storeName} · {group.items.length}
              {sumPart}
            </button>
          );
        })}
      </div>

      {/* Позиції вибраного магазину, згруповані за категорією */}
      <div className="space-y-3">
        {categoryGroups.map((catGroup) => (
          <section
            key={catGroup.name}
            className="rounded-[18px] bg-surface border border-line p-[6px_14px]"
          >
            <div className="flex justify-between py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">
              <span>{catGroup.name}</span>
            </div>
            <div className="divide-y divide-soft">
              {catGroup.items.map((item) => (
                <ShoppingItemRow key={item.id} item={item} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
