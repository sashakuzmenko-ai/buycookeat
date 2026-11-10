"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Меню" },
  { href: "/shopping", label: "Покупки" },
  { href: "/pantry", label: "Запаси" },
  { href: "/recipes", label: "Рецепти" },
  { href: "/products", label: "Продукти" },
  { href: "/settings", label: "Сім'я" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto" aria-label="Основна навігація">
      {LINKS.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition ${
              active ? "bg-brand-600 text-white" : "text-stone-600 hover:bg-stone-100"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
