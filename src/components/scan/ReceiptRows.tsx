"use client";

import { formatAmount, formatItemDetailRow, formatItemQty } from "@/lib/scan/present";
import type { ScanItem } from "@/lib/scan-types";

export function ReceiptRows({
  items,
  pending,
  zones,
  onClarify,
}: {
  items: readonly ScanItem[];
  pending: boolean;
  zones: Readonly<Record<string, string>>;
  onClarify: (index: number) => void;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-ink-2">Продуктів не знайдено. Можна відхилити цей скан і спробувати ще раз.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-0 flex-col lg:min-w-[520px]">
        {items.map((item, index) => {
          const zone = item.productId ? zones[item.productId] : undefined;
          const detail = formatItemDetailRow(item);
          const rawOrLabel = item.label || item.raw || "—";
          return (
            <div
              key={`${item.raw}-${index}`}
              className={`flex min-h-12 items-center gap-2 rounded-[10px] border-b border-dashed border-line-strong px-2 py-1.5 lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_70px_80px_96px] lg:gap-2.5 lg:py-2 ${item.uncertain ? "bg-scan-tint" : ""}`}
            >
              <div className="min-w-0 flex-1 lg:flex-none">
                <div className="truncate text-[15px] font-semibold">{item.name || "Без назви"}</div>
                <div className="truncate text-xs text-ink-2">{detail}</div>
                <div className="truncate font-mono text-[11px] text-ink-2 lg:hidden">{rawOrLabel}</div>
              </div>
              <span className="hidden truncate font-mono text-xs text-ink-2 lg:block">{rawOrLabel}</span>
              <span className="font-mono text-[13px] whitespace-nowrap">{formatItemQty(item.quantity, item.unit)}</span>
              <span className="w-14 text-right font-mono text-[13px] font-semibold lg:w-auto">
                {item.price === null ? "—" : formatAmount(item.price)}
              </span>
              {pending ? (
                <button
                  type="button"
                  onClick={() => onClarify(index)}
                  className={
                    item.uncertain
                      ? "inline-flex h-9 shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-ink px-2 text-xs font-semibold text-lime lg:justify-self-end lg:px-3 lg:text-[13px]"
                      : "inline-flex h-9 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-line-strong bg-surface px-2 text-xs font-semibold text-ink hover:bg-soft lg:justify-self-end lg:px-2.5 lg:text-[13px]"
                  }
                >
                  {item.uncertain ? "Уточнити" : "Виправити"}
                </button>
              ) : (
                <span className="hidden text-right text-xs text-ink-2 lg:block">{zone ?? ""}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
