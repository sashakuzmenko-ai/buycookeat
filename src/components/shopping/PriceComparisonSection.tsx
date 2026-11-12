import React from "react";
import type { PriceComparisonData } from "@/lib/prices";

export interface PriceComparisonSectionProps {
  data: PriceComparisonData;
}

export function PriceComparisonSection({ data }: PriceComparisonSectionProps) {
  return (
    <section className="box-border p-6 rounded-[18px] bg-surface border border-line flex flex-col gap-2">
      <h2 className="m-0 mb-2 text-[18px] font-bold text-ink">Де що дешевше</h2>

      {!data.hasReceipts || data.rows.length === 0 ? (
        <div className="py-6 text-center text-[14px] text-ink-2 bg-soft rounded-12 p-4">
          Ще немає чеків для порівняння цін. Додайте або відскануйте чеки з різних магазинів, щоб побачити різницю.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <div className="min-w-[360px] flex flex-col">
              {/* Header row */}
              <div
                className="grid gap-2 pb-2 text-[12px] font-semibold text-ink-2"
                style={{
                  gridTemplateColumns: `1.6fr ${data.stores.map(() => "1fr").join(" ")}`,
                }}
              >
                <span>Продукт</span>
                {data.stores.map((s) => (
                  <span key={s.id} className="text-right truncate" title={s.name}>
                    {s.name}
                  </span>
                ))}
              </div>

              {/* Data rows */}
              {data.rows.map((row) => (
                <div
                  key={row.productId}
                  className="grid gap-2 items-center min-h-[46px] border-t border-soft text-[14px]"
                  style={{
                    gridTemplateColumns: `1.6fr ${data.stores.map(() => "1fr").join(" ")}`,
                  }}
                >
                  <span className="truncate pr-2 font-medium text-ink" title={`${row.productName} (${row.unit})`}>
                    {row.productName}
                  </span>
                  {row.pricesByStore.map((cell) => (
                    <div key={cell.storeId} className="justify-self-end">
                      {cell.price != null ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[8px] font-mono text-[13px] ${
                            cell.isMin
                              ? "bg-[#FBEFD2] text-[#14201A] font-bold ring-1 ring-[#8A5600]/30"
                              : "text-ink-2 font-normal"
                          }`}
                          aria-label={cell.isMin ? `найнижча ціна: ${cell.formattedPrice}` : cell.formattedPrice}
                        >
                          {cell.formattedPrice}
                          {cell.isMin && (
                            <span
                              className="text-[10px] font-bold text-[#8A5600] px-1 py-0.2 rounded bg-[#EED8A1] uppercase select-none"
                              aria-hidden="true"
                            >
                              мін
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="font-mono text-[13px] text-stone-300">—</span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="pt-2 text-[12px] text-ink-2 leading-relaxed">
            Виділено найнижчу ціну. Ціни беруться з останніх чеків, а не з сайтів магазинів.
          </div>
        </>
      )}
    </section>
  );
}
