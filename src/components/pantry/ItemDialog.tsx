"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui";
import {
  type PantryItemView,
  type StorageZone,
  STORAGE_ZONES,
  STORAGE_ZONE_LABELS,
} from "@/lib/pantry";
import { addPantryItem, updatePantryItem, deletePantryItem } from "@/app/(app)/pantry/actions";

export type ItemDialogProps = {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly item: PantryItemView | null;
  readonly defaultZone?: StorageZone;
  readonly products: readonly { id: string; name: string; unit: string }[];
  readonly inStockIds: ReadonlySet<string>;
};

export function ItemDialog({
  isOpen,
  onClose,
  item,
  defaultZone = "pantry",
  products,
  inStockIds,
}: ItemDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isEdit = Boolean(item);
  const selectedZone = item?.storageZone ?? defaultZone;
  const currentUnit = item?.unit ?? products[0]?.unit ?? "г";

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="fixed inset-0 m-auto w-full max-w-md rounded-18 border border-line bg-surface p-6 backdrop:bg-ink/50 backdrop:backdrop-blur-xs"
    >
      <div className="flex items-center justify-between pb-4 border-b border-line">
        <h2 className="font-display text-lg font-bold text-ink">
          {isEdit ? "Змінити позицію" : "Додати на склад"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="size-11 min-h-[44px] min-w-[44px] rounded-full inline-flex items-center justify-center text-ink-2 hover:bg-soft hover:text-ink text-xl transition"
          aria-label="Закрити"
        >
          ✕
        </button>
      </div>

      <form action={isEdit ? updatePantryItem : addPantryItem} className="mt-4 flex flex-col gap-4">
        {isEdit && <input type="hidden" name="id" value={item!.id} />}

        {isEdit ? (
          <div>
            <span className="block text-[13px] font-semibold text-ink-2 mb-1">Продукт</span>
            <div className="font-semibold text-base text-ink">{item!.name}</div>
          </div>
        ) : (
          <div>
            <label htmlFor="pantry-product-select" className="mb-1.5 block text-[13px] font-semibold text-ink-2">
              Продукт
            </label>
            <select
              id="pantry-product-select"
              name="product_id"
              required
              defaultValue=""
              className="w-full min-h-[44px] rounded-12 border border-line-strong bg-surface px-3.5 py-2 text-[15px] text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-menu-tint"
            >
              <option value="" disabled>
                Оберіть продукт…
              </option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.unit}){inStockIds.has(p.id) ? " — вже є на складі" : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label htmlFor="pantry-quantity-input" className="mb-1.5 block text-[13px] font-semibold text-ink-2">
              Кількість
            </label>
            <input
              id="pantry-quantity-input"
              name="quantity"
              type="number"
              step="any"
              min="0"
              required
              defaultValue={item ? item.quantity : ""}
              placeholder="напр. 500"
              className="w-full min-h-[44px] rounded-12 border border-line-strong bg-surface px-3.5 py-2 text-[15px] text-ink font-mono outline-none transition focus:border-brand focus:ring-2 focus:ring-menu-tint"
            />
          </div>
          {isEdit && (
            <span className="mb-2 text-sm text-ink-2 font-mono shrink-0">
              {currentUnit}
            </span>
          )}
        </div>

        <div>
          <label htmlFor="pantry-zone-select" className="mb-1.5 block text-[13px] font-semibold text-ink-2">
            Зона зберігання
          </label>
          <select
            id="pantry-zone-select"
            name="storage_zone"
            defaultValue={selectedZone}
            className="w-full min-h-[44px] rounded-12 border border-line-strong bg-surface px-3.5 py-2 text-[15px] text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-menu-tint"
          >
            {STORAGE_ZONES.map((zone) => (
              <option key={zone} value={zone}>
                {STORAGE_ZONE_LABELS[zone]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="pantry-expiry-input" className="mb-1.5 block text-[13px] font-semibold text-ink-2">
            Термін придатності (необов&apos;язково)
          </label>
          <input
            id="pantry-expiry-input"
            name="expires_at"
            type="date"
            defaultValue={item?.expiresAt ?? ""}
            className="w-full min-h-[44px] rounded-12 border border-line-strong bg-surface px-3.5 py-2 text-[15px] text-ink font-mono outline-none transition focus:border-brand focus:ring-2 focus:ring-menu-tint"
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-line">
          {isEdit ? (
            <>
              <button
                type="submit"
                formAction={deletePantryItem}
                className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-12 px-3 py-2 text-sm font-semibold text-recipes hover:bg-recipes-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
              >
                Видалити
              </button>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={onClose}>
                  Скасувати
                </Button>
                <Button type="submit" module="pantry">
                  Зберегти
                </Button>
              </div>
            </>
          ) : (
            <div className="flex justify-end gap-2 w-full">
              <Button type="button" variant="secondary" onClick={onClose}>
                Скасувати
              </Button>
              <Button type="submit" module="pantry">
                Додати
              </Button>
            </div>
          )}
        </div>
      </form>
    </dialog>
  );
}
