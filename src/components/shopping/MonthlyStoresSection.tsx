import React from "react";
import type { MonthlyStoreSummary } from "@/lib/prices";

export interface MonthlyStoresSectionProps {
  readonly monthName: string;
  readonly summaries: readonly MonthlyStoreSummary[];
}

export function MonthlyStoresSection({ monthName, summaries }: Readonly<MonthlyStoresSectionProps>) {
  return (
    <section className="box-border p-6 rounded-[18px] bg-surface border border-line flex flex-col gap-2">
      <h2 className="m-0 mb-2 text-[18px] font-bold text-ink">
        Наші магазини · {monthName}
      </h2>

      {summaries.length === 0 ? (
        <div className="py-6 text-center text-[14px] text-ink-2 bg-soft rounded-12 p-4">
          У {monthName === "листопад" ? "листопаді" : monthName} чеків ще немає.
        </div>
      ) : (
        <div className="flex flex-col">
          {summaries.map((s) => (
            <div
              key={s.storeId}
              className="flex items-center gap-3 min-h-[52px] border-t border-soft first:border-t-0"
            >
              <div
                aria-hidden="true"
                className="w-9 h-9 rounded-12 bg-shops-tint text-shops-ink flex items-center justify-center font-unbounded font-bold text-[14px] shrink-0"
              >
                {s.initial}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold text-ink truncate">
                  {s.storeName}
                </div>
                <div className="text-[12px] text-ink-2 truncate">
                  {s.note}
                </div>
              </div>
              <span className="font-mono text-[14px] font-semibold text-ink shrink-0 ml-2">
                {s.totalSum.toLocaleString("uk-UA")} ₴
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
