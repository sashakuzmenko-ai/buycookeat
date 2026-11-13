import React from "react";
import Link from "next/link";
import { formatUah } from "@/lib/finance";
import { pluralizePositions } from "@/lib/pantry";
import type { HomeModel } from "./types";

export interface HomeMetricsProps {
  readonly model: HomeModel;
}

export function HomeMetrics({ model }: Readonly<HomeMetricsProps>) {
  const { finance, pantry, menu, shopping } = model;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Фінанси */}
      <Link
        href="/finance"
        className="box-border p-5 rounded-[18px] bg-finance-tint text-ink flex flex-col gap-2.5 transition hover:brightness-98"
      >
        <div className="text-[13px] font-semibold text-finance-ink">{finance.monthLabel}</div>
        <div className="font-display font-bold text-2xl lg:text-[26px] leading-tight">
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
              className="h-2 rounded-full bg-white overflow-hidden"
            >
              <div
                style={{ width: `${finance.progressPercent}%` }}
                className="h-full rounded-full bg-finance transition-all duration-300"
              />
            </div>
            <div className="text-[13px] text-finance-ink">
              з {formatUah(finance.budget)}
              {finance.paceNote ? ` · ${finance.paceNote}` : ""}
            </div>
          </>
        ) : (
          <div className="text-[13px] text-finance-ink mt-auto">
            {finance.receiptCount === 0
              ? "Надішліть перший чек або додайте витрату"
              : "Бюджет не задано · Задати в Сім'ї"}
          </div>
        )}
      </Link>

      {/* 2. Склад */}
      <Link
        href="/pantry"
        className="box-border p-5 rounded-[18px] bg-pantry-tint text-ink flex flex-col gap-2.5 transition hover:brightness-98"
      >
        <div className="text-[13px] font-semibold text-pantry-ink">На складі</div>
        <div className="font-display font-bold text-2xl lg:text-[26px] leading-tight">
          {pluralizePositions(pantry.totalCount)}
        </div>
        <div className="text-[13px] text-pantry-ink mt-auto">
          {pantry.totalCount === 0
            ? "Склад порожній · Додати продукти"
            : pantry.lowCount > 0 || pantry.expiringCount > 0
              ? `${pantry.lowCount} закінчуються · ${pantry.expiringCount} з терміном до 3 днів`
              : "Усі запаси в нормі"}
        </div>
      </Link>

      {/* 3. Меню */}
      <Link
        href="/menu"
        className="box-border p-5 rounded-[18px] bg-menu-tint text-ink flex flex-col gap-2.5 transition hover:brightness-98"
      >
        <div className="text-[13px] font-semibold text-menu-ink">Меню тижня</div>
        <div className="font-display font-bold text-2xl lg:text-[26px] leading-tight">
          {menu.hasMenu ? `${menu.cookedCount} з ${menu.plannedCount}` : "0 страв"}
        </div>
        <div className="text-[13px] text-menu-ink mt-auto">
          {!menu.hasMenu
            ? "Меню ще не складено · Скласти меню"
            : `страв приготовано · ${
                menu.emptySlotsCount > 0
                  ? `${menu.emptySlotsCount} ${menu.emptySlotsCount === 1 ? "слот порожній" : menu.emptySlotsCount >= 2 && menu.emptySlotsCount <= 4 ? "слоти порожні" : "слотів порожні"}`
                  : "усі слоти заповнено"
              }`}
        </div>
      </Link>

      {/* 4. Магазини */}
      <Link
        href="/shopping"
        className="box-border p-5 rounded-[18px] bg-shops-tint text-ink flex flex-col gap-2.5 transition hover:brightness-98"
      >
        <div className="text-[13px] font-semibold text-shops-ink">Докупити до неділі</div>
        <div className="font-display font-bold text-2xl lg:text-[26px] leading-tight">
          {shopping.toBuySum > 0 ? `≈ ${formatUah(shopping.toBuySum)}` : pluralizePositions(shopping.toBuyCount)}
        </div>
        <div className="text-[13px] text-shops-ink mt-auto">
          {shopping.toBuyCount === 0
            ? "Усе є на складі · Докуповувати нічого"
            : `${pluralizePositions(shopping.toBuyCount)} · ${shopping.storesSummary}`}
        </div>
      </Link>
    </div>
  );
}
