import React from "react";
import Link from "next/link";
import { setCooked } from "@/app/(app)/actions";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatUah } from "@/lib/finance";
import { formatPortions } from "@/lib/recipes";
import { pluralizePositions } from "@/lib/pantry";
import type { HomeModel } from "./types";

export interface MobileHomeProps {
  readonly model: HomeModel;
}

export function MobileHome({ model }: Readonly<MobileHomeProps>) {
  const {
    dateLabel,
    familyCount,
    portions,
    finance,
    menu,
    pantry,
    shopping,
    pendingScan,
  } = model;

  const nextMeal = menu.nextMeal;
  const subsequentMeal = menu.subsequentMeal;

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* 1. Шапка: дата, заголовок, кругла плашка-лічильник «Сім'я» */}
      <div className="flex justify-between items-center">
        <div className="flex flex-col gap-1">
          <div className="text-sm text-ink-2">{dateLabel}</div>
          <h1 className="m-0 font-display font-bold text-2xl text-ink">Сьогодні вдома</h1>
        </div>
        <Link
          href="/settings"
          aria-label="Сім’я"
          className="w-11 h-11 rounded-full bg-family-tint text-family-ink flex items-center justify-center font-bold text-[15px] transition hover:brightness-95 shrink-0"
        >
          {familyCount || 1}
        </Link>
      </div>

      {/* 2. Бюджет місяця на кольорі Фінансів */}
      <Link
        href="/finance"
        className="box-border p-[18px] rounded-[20px] bg-finance text-white flex flex-col gap-2.5 transition hover:brightness-105"
      >
        <div className="flex justify-between items-baseline gap-2">
          <span className="text-[13px] font-semibold text-[#DCE1F8]">{finance.monthLabel}</span>
          <span className="text-[13px] text-[#DCE1F8]">
            {finance.hasBudget && finance.budget ? `з ${formatUah(finance.budget)}` : "без бюджету"}
          </span>
        </div>

        <div className="font-display font-bold text-[28px] leading-tight">
          {formatUah(finance.monthSpent)}
        </div>

        {finance.hasBudget && finance.budget ? (
          <>
            <div
              role="progressbar"
              aria-valuenow={finance.progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Використання бюджету"
              className="h-2 rounded-full bg-[#5566BB] overflow-hidden"
            >
              <div
                style={{ width: `${finance.progressPercent}%` }}
                className="h-full rounded-full bg-lime transition-all duration-300"
              />
            </div>
            <div className="text-[13px] text-[#DCE1F8]">
              {finance.paceNote
                ? `${finance.paceNote.charAt(0).toUpperCase() + finance.paceNote.slice(1)} · `
                : ""}
              {finance.todaySpent > 0
                ? `сьогодні ${formatUah(finance.todaySpent)}`
                : "сьогодні без витрат"}
            </div>
          </>
        ) : (
          <div className="text-[13px] text-[#DCE1F8]">
            {finance.receiptCount === 0
              ? "Надішліть перший чек або додайте витрату"
              : "Задайте місячний бюджет у Сім’ї"}
          </div>
        )}
      </Link>

      {/* 3. Картка «Далі за меню» */}
      <section className="box-border p-[18px] rounded-[20px] bg-white border border-line flex flex-col gap-3">
        {nextMeal ? (
          <>
            <div className="flex justify-between items-center gap-2">
              <span className="text-xs font-semibold tracking-wider uppercase text-brand">
                Далі за меню · {nextMeal.slotLabel}
              </span>
              <div>
                {nextMeal.status.kind === "cooked" && <StatusChip status="cooked" />}
                {nextMeal.status.kind === "ready" && <StatusChip status="ready" />}
                {nextMeal.status.kind === "missing" && (
                  <StatusChip status="missing" count={nextMeal.status.missingCount} />
                )}
              </div>
            </div>

            <div>
              <div className="text-[19px] font-bold text-ink leading-snug">{nextMeal.title}</div>
              <div className="text-sm text-ink-2 mt-0.5">
                {nextMeal.minutes ? `${nextMeal.minutes} хв · ` : ""}
                на {formatPortions(portions)} порції
                {nextMeal.meta ? ` · ${nextMeal.meta}` : ""}
              </div>
            </div>

            <div className="flex gap-2.5">
              <form action={setCooked} className="flex-1">
                <input type="hidden" name="id" value={nextMeal.id} />
                <input type="hidden" name="cooked" value="true" />
                <input type="hidden" name="return_to" value="/" />
                <button
                  type="submit"
                  className="w-full h-12 rounded-[14px] bg-brand text-white flex items-center justify-center font-semibold text-[15px] hover:bg-menu-ink transition cursor-pointer"
                >
                  Готувати
                </button>
              </form>
              <Link
                href="/menu"
                className="h-12 px-4 rounded-[14px] border border-line-strong text-ink flex items-center justify-center font-semibold text-[15px] hover:bg-soft transition shrink-0"
              >
                Замінити
              </Link>
            </div>

            {subsequentMeal && (
              <div className="pt-3 border-t border-line flex justify-between items-center text-sm">
                <span className="text-ink-2 truncate pr-2">
                  {subsequentMeal.slotLabel} · {subsequentMeal.title}
                </span>
                <span className="font-semibold text-shops-ink shrink-0">
                  {subsequentMeal.status.kind === "missing"
                    ? `бракує ${subsequentMeal.status.missingCount}`
                    : subsequentMeal.status.kind === "ready"
                      ? "усе є"
                      : "приготовано"}
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-2.5 py-2">
            <span className="text-xs font-semibold tracking-wider uppercase text-brand">
              Меню на сьогодні
            </span>
            <div className="text-base font-semibold text-ink">
              {menu.hasMenu ? "Усі страви на сьогодні вже приготовано" : "На сьогодні меню не складено"}
            </div>
            <p className="text-sm text-ink-2 m-0">
              {menu.hasMenu
                ? "Можна переглянути меню на тиждень або вибрати рецепт."
                : "Складіть меню тижня, щоб запланувати сніданок, обід і вечерю."}
            </p>
            <Link
              href="/menu"
              className="btn h-12 rounded-[14px] text-[15px] font-semibold flex items-center justify-center mt-1"
            >
              Перейти до меню
            </Link>
          </div>
        )}
      </section>

      {/* 4. Дві плашки поруч: Склад і Покупки */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/pantry"
          className="box-border p-4 rounded-[20px] bg-pantry-tint text-ink flex flex-col gap-1.5 transition hover:brightness-98"
        >
          <span className="text-[13px] font-semibold text-pantry-ink">Склад</span>
          <span className="font-display font-bold text-xl leading-tight">
            {pantry.lowCount > 0 ? `${pantry.lowCount} мало` : pluralizePositions(pantry.totalCount)}
          </span>
          <span className="text-[13px] text-pantry-ink line-clamp-2">
            {pantry.totalCount === 0
              ? "Порожньо"
              : pantry.expiringCount > 0
                ? `${pantry.expiringCount} з терміном до 3 днів`
                : "Терміни в нормі"}
          </span>
        </Link>

        <Link
          href="/shopping"
          className="box-border p-4 rounded-[20px] bg-shops-tint text-ink flex flex-col gap-1.5 transition hover:brightness-98"
        >
          <span className="text-[13px] font-semibold text-shops-ink">Покупки</span>
          <span className="font-display font-bold text-xl leading-tight">
            {pluralizePositions(shopping.toBuyCount)}
          </span>
          <span className="text-[13px] text-shops-ink line-clamp-2">
            {shopping.toBuyCount === 0
              ? "Усе є на складі"
              : `${shopping.toBuySum > 0 ? `≈ ${formatUah(shopping.toBuySum)} · ` : ""}${shopping.storesSummary}`}
          </span>
        </Link>
      </div>

      {/* 5. Темний рядок про скан, що чекає перевірки (ЛИШЕ ЯКЩО ТАКИЙ Є) */}
      {pendingScan && (
        <Link
          href="/scan"
          className="box-border p-[16px_18px] rounded-[20px] bg-scan text-white flex items-center gap-3.5 transition hover:brightness-110"
        >
          <svg
            aria-hidden="true"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#C8F169"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
          >
            <path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 12h8" />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold truncate text-white">{pendingScan.title}</div>
            <div className="text-[13px] text-ink-muted-on-dark truncate">{pendingScan.note}</div>
          </div>
          <span aria-hidden="true" className="text-lime text-lg shrink-0">
            →
          </span>
        </Link>
      )}
    </div>
  );
}
