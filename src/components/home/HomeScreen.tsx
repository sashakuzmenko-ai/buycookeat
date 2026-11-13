import React from "react";
import Link from "next/link";
import { HomeMetrics } from "./HomeMetrics";
import { TodayMenuSection } from "./TodayMenuSection";
import { WeeklyExpensesChart } from "./WeeklyExpensesChart";
import { PantryAlertsSection } from "./PantryAlertsSection";
import { RecentScansSection } from "./RecentScansSection";
import { MobileHome } from "./MobileHome";
import type { HomeModel } from "./types";

export interface HomeScreenProps {
  readonly model: HomeModel;
}

export function HomeScreen({ model }: Readonly<HomeScreenProps>) {
  return (
    <div className="w-full">
      {/* Спільна шапка: дата, заголовок «Сьогодні вдома», дії для мобільного та десктопу */}
      <div className="flex justify-between items-center lg:items-end mb-4 lg:mb-6">
        <div className="flex flex-col gap-1 lg:gap-1.5">
          <div className="text-sm text-ink-2">{model.dateLabel}</div>
          <h1 className="m-0 font-display font-bold text-2xl lg:text-[28px] leading-tight text-ink">
            Сьогодні вдома
          </h1>
        </div>
        {/* Мобільна плашка «Сім'я» */}
        <Link
          href="/settings"
          aria-label="Сім’я"
          className="w-11 h-11 rounded-full bg-family-tint text-family-ink flex items-center justify-center font-bold text-[15px] transition hover:brightness-95 shrink-0 lg:hidden"
        >
          {model.familyCount || 1}
        </Link>
        {/* Десктопні кнопки дій */}
        <div className="hidden lg:flex flex-wrap gap-2.5">
          <Link
            href="/menu"
            className="inline-flex items-center h-11 px-4.5 border border-line-strong rounded-12 bg-white text-ink font-semibold text-[15px] hover:bg-soft transition"
          >
            Меню тижня
          </Link>
          <Link
            href="/shopping"
            className="inline-flex items-center h-11 px-4.5 rounded-12 bg-brand text-white font-semibold text-[15px] hover:bg-menu-ink transition"
          >
            Список покупок · {model.shopping.toBuyCount}
          </Link>
        </div>
      </div>

      {/* Мобільний вигляд (< 1024 px, 390 px) за MHome.dc.html */}
      <div className="block lg:hidden">
        <MobileHome model={model} />
      </div>

      {/* Веб-вигляд (≥ 1024 px) за WebHome.dc.html */}
      <div className="hidden lg:flex flex-col gap-6">
        {/* Чотири плашки-показники на тонах модулів */}
        <HomeMetrics model={model} />

        {/* Основна сітка з двома колонками */}
        <div className="flex flex-wrap gap-6 items-start">
          {/* Ліва колонка: «Сьогодні в меню» і «Витрати по тижнях» */}
          <div className="flex-[2_1_480px] min-w-0 flex flex-col gap-6">
            <TodayMenuSection meals={model.menu.todayMeals} portions={model.portions} />
            <WeeklyExpensesChart weeks={model.weeks} />
          </div>

          {/* Права колонка: «Склад просить уваги» і темний блок «Останні скани» */}
          <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-6">
            <PantryAlertsSection
              alerts={model.pantry.alerts}
              totalCount={model.pantry.totalCount}
            />
            <RecentScansSection scans={model.recentScans} />
          </div>
        </div>
      </div>
    </div>
  );
}
