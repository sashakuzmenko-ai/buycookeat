import React from "react";
import { formatQty } from "@/lib/shopping";
import { toggleShoppingItem, deleteShoppingItem } from "@/app/(app)/shopping/actions";

export interface ShoppingItemViewData {
  readonly id: string;
  readonly title: string | null;
  readonly quantity: number | null;
  readonly unit: string | null;
  readonly store_id: string | null;
  readonly checked: boolean;
  readonly stocked_at: string | null;
  readonly product_id: string | null;
  readonly productName: string;
  readonly category: string;
  readonly estimatedPrice: number | null;
}

export interface ShoppingItemRowProps {
  readonly item: ShoppingItemViewData;
}

export function ShoppingItemRow({ item }: Readonly<ShoppingItemRowProps>) {
  return (
    <div className="flex items-center gap-2 py-1 min-h-[46px] border-b border-soft last:border-b-0">
      <form action={toggleShoppingItem} className="min-w-0 flex-1">
        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="checked" value={String(!item.checked)} />
        <button
          type="submit"
          aria-label={item.checked ? `Позначити некупленим: ${item.productName}` : `Позначити купленим: ${item.productName}`}
          className="flex w-full cursor-pointer items-center gap-3 py-1 text-left text-[15px] group"
        >
          <span
            aria-hidden="true"
            className={`flex size-5 shrink-0 items-center justify-center rounded-[6px] border text-xs font-bold text-white transition ${
              item.checked ? "border-[#8A5600] bg-[#8A5600]" : "border-line-strong bg-surface group-hover:border-[#8A5600]"
            }`}
          >
            {item.checked ? "✓" : ""}
          </span>
          <span
            className={`flex-1 truncate ${
              item.checked ? "text-ink-2 line-through opacity-70" : "text-ink"
            }`}
          >
            {item.productName}
          </span>
          {item.stocked_at && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#DDEFEE] text-[#124E51] shrink-0">
              у запасах
            </span>
          )}
          {item.quantity !== null && item.unit && (
            <span className={`text-[13px] shrink-0 ${item.checked ? "text-ink-2 opacity-60" : "text-ink-2 font-normal"}`}>
              {formatQty(Number(item.quantity), item.unit)}
            </span>
          )}
          <span
            className={`w-14 text-right font-mono text-[13px] font-semibold shrink-0 ${
              item.checked ? "text-ink-2 opacity-60" : "text-ink"
            }`}
          >
            {item.estimatedPrice != null ? `${Math.round(item.estimatedPrice)} ₴` : ""}
          </span>
        </button>
      </form>

      <form action={deleteShoppingItem} className="shrink-0">
        <input type="hidden" name="id" value={item.id} />
        <button
          type="submit"
          className="w-7 h-7 flex items-center justify-center text-stone-300 hover:text-red-500 rounded text-base transition cursor-pointer"
          aria-label={`Видалити: ${item.productName}`}
        >
          ×
        </button>
      </form>
    </div>
  );
}
