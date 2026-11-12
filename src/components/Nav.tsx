"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/menu", label: "Меню" },
  { href: "/shopping", label: "Покупки" },
  { href: "/pantry", label: "Склад" },
  { href: "/scan", label: "+ Скан" },
  { href: "/recipes", label: "Рецепти" },
  { href: "/products", label: "Продукти" },
  { href: "/settings", label: "Сім'я" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto" aria-label="Основна навігація">
      {LINKS.map((l) => {
        const active = pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition ${
              active ? "bg-brand text-white" : "text-ink-2 hover:bg-soft"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
