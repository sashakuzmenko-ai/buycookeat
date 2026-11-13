import React from "react";
import Link from "next/link";
import { setCooked } from "@/app/(app)/actions";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatPortions } from "@/lib/recipes";
import type { HomeMealView } from "./types";

export interface TodayMenuSectionProps {
  readonly meals: readonly HomeMealView[];
  readonly portions: number;
}

export function TodayMenuSection({ meals, portions }: Readonly<TodayMenuSectionProps>) {
  return (
    <section className="box-border p-6 rounded-[18px] bg-white border border-line flex flex-col gap-4">
      <div className="flex justify-between items-baseline gap-3">
        <h2 className="m-0 text-lg font-bold text-ink">Сьогодні в меню</h2>
        <span className="text-[13px] text-ink-2">на {formatPortions(portions)} порції</span>
      </div>

      {meals.length === 0 ? (
        <div className="p-6 rounded-[14px] bg-ground text-center flex flex-col items-center gap-3">
          <p className="text-sm text-ink-2 m-0">
            На сьогодні страв ще не заплановано. Складіть меню тижня, щоб бачити розклад і запаси.
          </p>
          <Link href="/menu" className="btn text-sm">
            Скласти меню
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {meals.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center gap-3.5 p-3.5 rounded-[14px] bg-ground text-ink"
            >
              <div className="w-[76px] text-xs font-semibold tracking-wider uppercase text-ink-2 shrink-0">
                {m.slotLabel}
              </div>

              <div className="flex-1 min-w-[180px]">
                <div className="text-base font-semibold leading-snug">{m.title}</div>
                {m.meta && <div className="text-[13px] text-ink-2 mt-0.5">{m.meta}</div>}
              </div>

              <div className="shrink-0">
                {m.status.kind === "cooked" && <StatusChip status="cooked" />}
                {m.status.kind === "ready" && <StatusChip status="ready" />}
                {m.status.kind === "missing" && (
                  <StatusChip status="missing" count={m.status.missingCount} />
                )}
              </div>

              {m.isNextUncooked && (
                <form action={setCooked} className="shrink-0">
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="cooked" value="true" />
                  <input type="hidden" name="return_to" value="/" />
                  <button
                    type="submit"
                    className="h-11 px-4 border-0 rounded-12 bg-brand text-white font-semibold text-sm hover:bg-menu-ink transition cursor-pointer"
                  >
                    Готувати
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
