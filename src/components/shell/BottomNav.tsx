"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MORE_NAV_ITEMS, isRouteActive, isMoreActive } from "./nav-items";
import { signOut } from "@/app/auth-actions";
import { BASE_COLORS, MODULE_THEMES } from "../ui/tokens";

export interface BottomNavProps {
  readonly household: {
    readonly name: string;
    readonly city: string | null;
  };
}

interface BottomNavTabProps {
  readonly href: string;
  readonly label: string;
  readonly iconPath: string;
  readonly active: boolean;
}

function BottomNavTab({ href, label, iconPath, active }: Readonly<BottomNavTabProps>) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`w-[60px] min-h-[48px] flex flex-col items-center justify-center gap-1 text-[11px] no-underline transition-colors ${
        active ? "font-bold text-ink" : "font-medium text-ink-2"
      }`}
    >
      <svg
        aria-hidden="true"
        width={22}
        height={22}
        viewBox="0 0 24 24"
        fill="none"
        stroke={active ? BASE_COLORS.ink : BASE_COLORS.ink2}
        strokeWidth={active ? 2 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={iconPath} />
      </svg>
      <span>{label}</span>
    </Link>
  );
}

interface MoreDrawerProps {
  readonly household: {
    readonly name: string;
    readonly city: string | null;
  };
  readonly pathname: string;
  readonly onClose: () => void;
}

function MoreDrawer({ household, pathname, onClose }: Readonly<MoreDrawerProps>) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <dialog
      open
      aria-label="Меню Ще"
      className="fixed inset-0 z-40 m-0 p-0 w-full h-full max-w-none max-h-none bg-transparent border-0 lg:hidden block outline-none overflow-hidden"
    >
      {/* Тло / Backdrop */}
      <div
        className="fixed inset-0 bg-ink/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Вміст шторки */}
      <div className="fixed bottom-0 inset-x-0 z-50 bg-surface rounded-t-[22px] border-t border-line-strong p-5 pb-8 max-h-[85vh] overflow-y-auto flex flex-col gap-4">
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
            onClick={onClose}
            aria-label="Закрити"
            className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full bg-soft flex items-center justify-center text-ink-2 hover:text-ink text-base cursor-pointer"
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
                onClick={onClose}
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
    </dialog>
  );
}

export function BottomNav({ household }: Readonly<BottomNavProps>) {
  const pathname = usePathname();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);

  // Закриваємо шторку при переході на новий маршрут під час рендеру
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setIsMoreOpen(false);
  }

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
        <BottomNavTab
          href="/"
          label="Огляд"
          iconPath="M4 11l8-7 8 7v9H4z"
          active={isHomeActive}
        />

        {/* 2. Меню */}
        <BottomNavTab
          href="/menu"
          label="Меню"
          iconPath="M5 6h14v14H5zM5 10h14M9 3v4M15 3v4"
          active={isMenuActive}
        />

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
            stroke={MODULE_THEMES.scan.accent}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 12h8" />
          </svg>
        </Link>

        {/* 4. Склад */}
        <BottomNavTab
          href="/pantry"
          label="Склад"
          iconPath="M4 5h16v14H4zM4 12h16M9 8.5h6M9 15.5h6"
          active={isPantryActive}
        />

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
            stroke={moreSectionActive || isMoreOpen ? BASE_COLORS.ink : BASE_COLORS.ink2}
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
        <MoreDrawer
          household={household}
          pathname={pathname}
          onClose={() => setIsMoreOpen(false)}
        />
      )}
    </>
  );
}
