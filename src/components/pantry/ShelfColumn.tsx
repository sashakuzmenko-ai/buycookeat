"use client";

import { LevelBar } from "@/components/ui";
import { type PantryItemView, type StorageZone, pluralizePositions } from "@/lib/pantry";

export type ShelfColumnProps = {
  readonly zone: StorageZone;
  readonly title: string;
  readonly items: readonly PantryItemView[];
  readonly totalCountInZone: number;
  readonly onEditItem: (item: PantryItemView) => void;
  readonly onAddItemInZone?: (zone: StorageZone) => void;
};

export function ShelfColumn({
  zone,
  title,
  items,
  totalCountInZone,
  onEditItem,
  onAddItemInZone,
}: ShelfColumnProps) {
  return (
    <section className="flex flex-col overflow-hidden rounded-18 border border-line bg-surface">
      {/* Шапка на тоні модуля з назвою зони і лічильником */}
      <div className="flex items-baseline justify-between bg-pantry-tint px-4.5 py-4">
        <h2 className="font-display text-base font-medium text-ink">{title}</h2>
        <span className="text-[13px] text-pantry-ink">
          {pluralizePositions(totalCountInZone)}
        </span>
      </div>

      {/* Рядки з товстим розділювачем-«полицею» (3px border-[#EEF1ED]) */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 text-center text-sm text-ink-2 gap-3">
          <span>На цій полиці поки порожньо</span>
          {onAddItemInZone && (
            <button
              type="button"
              onClick={() => onAddItemInZone(zone)}
              className="text-xs font-semibold text-pantry hover:underline"
            >
              + Додати сюди продукт
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col">
          {items.map((item) => (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => onEditItem(item)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onEditItem(item);
                }
              }}
              className="group flex cursor-pointer flex-col gap-1.5 border-b-[3px] border-soft px-4.5 py-3 transition hover:bg-ground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              <LevelBar
                value={item.scalePercent}
                max={100}
                state={item.state}
                name={item.name}
                amount={item.formattedQty}
                note={item.note}
                hideStateLabel={item.state === "normal"}
                module="pantry"
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
