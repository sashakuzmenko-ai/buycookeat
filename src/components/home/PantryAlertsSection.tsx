import React from "react";
import Link from "next/link";
import type { HomeAlertView } from "./types";

export interface PantryAlertsSectionProps {
  readonly alerts: readonly HomeAlertView[];
  readonly totalCount: number;
}

export function PantryAlertsSection({ alerts, totalCount }: Readonly<PantryAlertsSectionProps>) {
  return (
    <section className="box-border p-6 rounded-[18px] bg-white border border-line flex flex-col gap-3.5">
      <div className="flex justify-between items-baseline gap-2">
        <h2 className="m-0 text-lg font-bold text-ink">Склад просить уваги</h2>
        {alerts.length > 0 && (
          <Link href="/pantry" className="text-xs font-semibold text-pantry-ink hover:underline">
            До складу
          </Link>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className="p-4 rounded-[14px] bg-ground text-sm text-ink-2">
          {totalCount === 0 ? (
            <div className="flex flex-col gap-2">
              <span>На складі ще немає продуктів.</span>
              <Link href="/pantry" className="text-pantry font-semibold hover:underline">
                Додати перші продукти →
              </Link>
            </div>
          ) : (
            <span className="text-[#14522F] font-medium">
              ✓ Усі запаси в нормі — нічого не закінчується і терміни не спливають.
            </span>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {alerts.map((a) => (
            <div key={a.id} className="flex flex-col gap-1.5">
              <div className="flex justify-between items-baseline gap-2 text-sm">
                <span className="font-semibold text-ink truncate">{a.name}</span>
                <span className="font-mono text-xs sm:text-sm text-ink-2 shrink-0">{a.qty}</span>
              </div>

              <div
                role="progressbar"
                aria-valuenow={a.scalePercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Залишок: ${a.name}`}
                className="h-1.5 rounded-full bg-track overflow-hidden"
              >
                <div
                  style={{
                    width: `${Math.max(4, Math.min(100, a.scalePercent))}%`,
                    backgroundColor: a.isExpiring ? "#B23A24" : "#8A5600",
                  }}
                  className="h-full rounded-full transition-all duration-300"
                />
              </div>

              <div className="text-xs text-ink-2 leading-tight">{a.note}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
