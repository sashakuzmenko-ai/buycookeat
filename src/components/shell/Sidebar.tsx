"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";
import { MAIN_NAV_ITEMS, isRouteActive } from "./nav-items";
import { signOut } from "@/app/auth-actions";

export interface SidebarProps {
  readonly household: {
    readonly name: string;
    readonly city: string | null;
  };
}

export function Sidebar({ household }: Readonly<SidebarProps>) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Основна навігація"
      className="hidden lg:flex w-[232px] shrink-0 sticky top-0 h-screen overflow-y-auto bg-surface border-r border-line p-6 flex-col gap-6 box-border"
    >
      {/* Логотип і назва застосунку */}
      <div className="flex flex-col gap-1 px-2">
        <Link href="/" className="flex items-center gap-2.5 text-ink no-underline">
          <Logo size={34} aria-hidden />
          <span className="font-display font-bold text-base tracking-tight text-ink">
            Cook &amp; Eat
          </span>
        </Link>
        <div className="truncate text-xs font-medium text-ink-2 pl-[44px]">
          {household.name}
          {household.city ? ` · ${household.city}` : ""}
        </div>
      </div>

      {/* 8 розділів навігації */}
      <div className="flex flex-col gap-0.5">
        {MAIN_NAV_ITEMS.map((item) => {
          const active = isRouteActive(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              style={{
                backgroundColor: active ? item.tint : "transparent",
              }}
              className={`flex items-center gap-3 min-h-[44px] px-3 rounded-12 text-[15px] transition-colors ${
                active ? "font-bold text-ink" : "font-medium text-ink hover:bg-soft"
              }`}
            >
              <svg
                aria-hidden="true"
                width={20}
                height={20}
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

      {/* Внизу: плашка «Скан у Telegram» та «Вийти» */}
      <div className="mt-auto flex flex-col gap-4">
        <div className="rounded-2xl bg-ink p-4 text-white flex flex-col gap-2">
          <div className="text-sm font-semibold text-lime">Скан у Telegram</div>
          <div className="text-[13px] leading-[1.45] text-ink-muted-on-dark">
            Надішліть боту чек, голосове чи відео холодильника.
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-line pt-3 px-1 text-xs">
          <div className="min-w-0 pr-2">
            <div className="truncate font-semibold text-ink">{household.name}</div>
            {household.city && (
              <div className="truncate text-[11px] text-ink-2">{household.city}</div>
            )}
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="text-xs text-ink-2 hover:text-ink underline-offset-2 hover:underline cursor-pointer py-1 px-1.5 rounded transition hover:bg-soft"
            >
              Вийти
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
