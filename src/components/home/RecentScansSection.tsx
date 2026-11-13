import React from "react";
import Link from "next/link";
import type { HomeScanView } from "./types";

export interface RecentScansSectionProps {
  readonly scans: readonly HomeScanView[];
}

export function RecentScansSection({ scans }: Readonly<RecentScansSectionProps>) {
  return (
    <section className="box-border p-6 rounded-[18px] bg-scan text-white flex flex-col gap-3.5">
      <div className="flex justify-between items-baseline gap-2">
        <h2 className="m-0 text-lg font-bold text-lime">Останні скани</h2>
        <Link href="/scan" className="text-xs font-semibold text-lime hover:underline transition">
          Черга →
        </Link>
      </div>

      {scans.length === 0 ? (
        <div className="text-xs text-ink-muted-on-dark flex flex-col gap-2">
          <span>Ще немає сканів у черзі.</span>
          <p className="m-0 text-ink-muted-on-dark">
            Надішліть чек, голосове або відео холодильника боту чи завантажте у розділі Скан.
          </p>
          <Link href="/scan" className="text-lime font-semibold hover:underline mt-1">
            Спробувати скан →
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {scans.map((s) => (
            <Link
              key={s.id}
              href={`/scan`}
              className="flex gap-3 items-baseline group hover:opacity-90 transition text-inherit no-underline"
            >
              <div className="font-mono text-xs text-ink-muted-on-dark w-11 shrink-0">{s.time}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate group-hover:text-lime transition">
                  {s.title}
                </div>
                <div className="text-[13px] text-ink-muted-on-dark line-clamp-1">{s.note}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
