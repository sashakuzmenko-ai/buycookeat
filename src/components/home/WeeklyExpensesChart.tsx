import React from "react";
import Link from "next/link";
import type { HomeWeekView } from "./types";

export interface WeeklyExpensesChartProps {
  readonly weeks: readonly HomeWeekView[];
}

export function WeeklyExpensesChart({ weeks }: Readonly<WeeklyExpensesChartProps>) {
  const hasExpenses = weeks.some((w) => w.sum > 0);

  return (
    <section className="box-border p-6 rounded-[18px] bg-white border border-line flex flex-col gap-5">
      <div className="flex justify-between items-baseline gap-3">
        <h2 className="m-0 text-lg font-bold text-ink">Витрати по тижнях</h2>
        <Link
          href="/finance"
          className="text-sm font-semibold text-finance hover:underline transition"
        >
          Уся історія
        </Link>
      </div>

      {!hasExpenses && (
        <div className="text-xs text-ink-2 bg-ground px-3.5 py-2 rounded-12">
          Ще немає чеків за останні тижні. Надішліть перший чек боту або додайте витрату вручну у Фінансах.
        </div>
      )}

      <div className="flex items-end gap-2 sm:gap-4 h-[190px] pt-4">
        {weeks.map((w) => (
          <div
            key={w.start}
            className="flex-1 min-w-0 flex flex-col items-center gap-2 h-full justify-end"
          >
            <div className="font-mono text-xs sm:text-[13px] font-semibold text-ink truncate max-w-full">
              {w.sum > 0 ? Math.round(w.sum).toLocaleString("uk-UA") : "0"}
            </div>

            <div
              style={{
                height: `${w.barHeight}px`,
                backgroundColor: w.isCurrent ? "#3346A0" : "#B9C2EC",
              }}
              className="w-full max-w-[72px] rounded-t-[10px] rounded-b-[4px] transition-all duration-300"
              title={`${w.label}: ${Math.round(w.sum).toLocaleString("uk-UA")} ₴`}
            />

            <div className="text-[11px] sm:text-xs text-ink-2 text-center leading-tight line-clamp-2 h-8 flex items-center justify-center">
              {w.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
