"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MORE_NAV_ITEMS, isRouteActive, isMoreActive } from "./nav-items";
import { signOut } from "@/app/auth-actions";

export interface BottomNavProps {
  household: {
    name: string;
    city: string | null;
  };
}

export function BottomNav({ household }: BottomNavProps) {
  const pathname = usePathname();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);

  // Закриваємо шторку при переході на новий маршрут під час рендеру (рекомендований патерн React)
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setIsMoreOpen(false);
  }

  // Закриваємо шторку на клавішу Escape
  useEffect(() => {
    if (!isMoreOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsMoreOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMoreOpen]);

  // Блокуємо прокрутку тіла, коли шторка відкрита
  useEffect(() => {
    if (isMoreOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMoreOpen]);

  const isHomeActive = isRouteActive("/", pathname);
  const isMenuActive = isRouteActive("/menu", pathname);
  const isPantryActive = isRouteActive("/pantry", pathname);
  const isScanActive = isRouteActive("/scan", pathname);
  const moreSectionActive = isMoreActive(pathname);

  return (
    <>
      {/* Нижня панель для < 1024 px */}
      <nav
        aria-label="Нижня навігація"
        className="fixed bottom-0 inset-x-0 z-30 h-[84px] box-border px-3 pt-2 pb-5 bg-surface border-t border-line flex justify-between items-center lg:hidden"
      >
        {/* 1. Огляд */}
        <Link
          href="/"
          aria-current={isHomeActive ? "page" : undefined}
          className={`w-[60px] min-h-[48px] flex flex-col items-center justify-center gap-1 text-[11px] no-underline transition-colors ${
            isHomeActive ? "font-bold text-ink" : "font-medium text-ink-2"
          }`}
        >
          <svg
            aria-hidden="true"
            width={22}
            height={22}
            viewBox="0 0 24 24"
            fill="none"
            stroke={isHomeActive ? "#14201A" : "#4A5750"}
            strokeWidth={isHomeActive ? 2 : 1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 11l8-7 8 7v9H4z" />
          </svg>
          <span>Огляд</span>
        </Link>

        {/* 2. Меню */}
        <Link
          href="/menu"
          aria-current={isMenuActive ? "page" : undefined}
          className={`w-[60px] min-h-[48px] flex flex-col items-center justify-center gap-1 text-[11px] no-underline transition-colors ${
            isMenuActive ? "font-bold text-ink" : "font-medium text-ink-2"
          }`}
        >
          <svg
            aria-hidden="true"
            width={22}
            height={22}
            viewBox="0 0 24 24"
            fill="none"
            stroke={isMenuActive ? "#14201A" : "#4A5750"}
            strokeWidth={isMenuActive ? 2 : 1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 6h14v14H5zM5 10h14M9 3v4M15 3v4" />
          </svg>
          <span>Меню</span>
        </Link>

        {/* 3. Скан (темна кнопка 56 px по центру) */}
        <Link
          href="/scan"
          aria-label="Скан"
          aria-current={isScanActive ? "page" : undefined}
          className={`w-[56px] h-[56px] rounded-[18px] bg-ink flex items-center justify-center shrink-0 transition-transform active:scale-95 ${
            isScanActive ? "ring-2 ring-lime ring-offset-2" : ""
          }`}
        >
          <svg
            aria-hidden="true"
            width={24}
            height={24}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#C8F169"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 12h8" />
          </svg>
        </Link>

        {/* 4. Склад */}
        <Link
          href="/pantry"
          aria-current={isPantryActive ? "page" : undefined}
          className={`w-[60px] min-h-[48px] flex flex-col items-center justify-center gap-1 text-[11px] no-underline transition-colors ${
            isPantryActive ? "font-bold text-ink" : "font-medium text-ink-2"
          }`}
        >
          <svg
            aria-hidden="true"
            width={22}
            height={22}
            viewBox="0 0 24 24"
            fill="none"
            stroke={isPantryActive ? "#14201A" : "#4A5750"}
            strokeWidth={isPantryActive ? 2 : 1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 5h16v14H4zM4 12h16M9 8.5h6M9 15.5h6" />
          </svg>
          <span>Склад</span>
        </Link>

        {/* 5. Ще */}
        <button
          type="button"
          onClick={() => setIsMoreOpen((prev) => !prev)}
          aria-label="Відкрити меню Ще"
          aria-expanded={isMoreOpen}
          className={`w-[60px] min-h-[48px] flex flex-col items-center justify-center gap-1 text-[11px] cursor-pointer transition-colors ${
            moreSectionActive || isMoreOpen
              ? "font-bold text-ink"
              : "font-medium text-ink-2"
          }`}
        >
          <svg
            aria-hidden="true"
            width={22}
            height={22}
            viewBox="0 0 24 24"
            fill="none"
            stroke={moreSectionActive || isMoreOpen ? "#14201A" : "#4A5750"}
            strokeWidth={2.6}
            strokeLinecap="round"
          >
            <path d="M5 12h.01M12 12h.01M19 12h.01" />
          </svg>
          <span>Ще</span>
        </button>
      </nav>

      {/* Шторка «Ще» */}
      {isMoreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" aria-modal="true" role="dialog" aria-label="Меню Ще">
          {/* Тло / Backdrop */}
          <div
            className="fixed inset-0 bg-ink/40 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMoreOpen(false)}
            aria-hidden="true"
          />

          {/* Вміст шторки */}
          <div className="fixed bottom-0 inset-x-0 z-50 bg-surface rounded-t-[22px] border-t border-line p-5 pb-8 max-h-[85vh] overflow-y-auto flex flex-col gap-4 shadow-2xl">
            {/* Ручка шторки */}
            <div className="w-10 h-1 bg-track rounded-full mx-auto -mt-1" aria-hidden="true" />

            {/* Заголовок і сім'я */}
            <div className="flex items-center justify-between pb-1 border-b border-line">
              <div>
                <div className="font-display font-bold text-lg text-ink">Ще</div>
                <div className="text-xs text-ink-2">
                  {household.name}
                  {household.city ? ` · ${household.city}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMoreOpen(false)}
                aria-label="Закрити"
                className="w-8 h-8 rounded-full bg-soft flex items-center justify-center text-ink-2 hover:text-ink text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Пункти «Ще»: Рецепти, Магазини, Фінанси, Сім'я, Продукти */}
            <div className="flex flex-col gap-1">
              {MORE_NAV_ITEMS.map((item) => {
                const active = isRouteActive(item.href, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMoreOpen(false)}
                    aria-current={active ? "page" : undefined}
                    style={{
                      backgroundColor: active ? item.tint : "transparent",
                    }}
                    className={`flex items-center gap-3.5 min-h-[48px] px-3.5 rounded-12 text-[15px] transition-colors ${
                      active ? "font-bold text-ink" : "font-medium text-ink hover:bg-soft"
                    }`}
                  >
                    <svg
                      aria-hidden="true"
                      width={22}
                      height={22}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={item.color}
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0"
                    >
                      <path d={item.iconPath} />
                    </svg>
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>

            {/* Плашка «Скан у Telegram» */}
            <div className="rounded-2xl bg-ink p-4 text-white flex flex-col gap-1.5">
              <div className="text-sm font-semibold text-lime">Скан у Telegram</div>
              <div className="text-xs leading-relaxed text-ink-muted-on-dark">
                Надішліть боту чек, голосове чи відео холодильника.
              </div>
            </div>

            {/* Вихід */}
            <div className="pt-2 border-t border-line flex items-center justify-between">
              <span className="text-xs text-ink-2">{household.name}</span>
              <form action={signOut}>
                <button
                  type="submit"
                  className="text-sm font-semibold text-recipes hover:underline cursor-pointer py-1.5 px-3 rounded hover:bg-soft transition"
                >
                  Вийти
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
