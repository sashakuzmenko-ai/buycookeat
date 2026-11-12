"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";

export interface AppShellProps {
  readonly household: {
    readonly name: string;
    readonly city: string | null;
  };
  readonly children: React.ReactNode;
}

export function AppShell({ household, children }: Readonly<AppShellProps>) {
  const pathname = usePathname();
  const dark = pathname === "/scan" || pathname.startsWith("/scan/");

  return (
    <div className={`min-h-screen font-sans flex flex-col lg:flex-row w-full max-w-full overflow-x-hidden ${dark ? "bg-scan text-white" : "bg-ground text-ink"}`}>
      {/* Бічна панель: ≥ 1024 px */}
      <Sidebar household={household} />

      {/* Основна область вмісту */}
      <main className={`flex-1 min-w-0 w-full max-w-full pb-28 lg:pb-8 ${dark ? "bg-scan text-white p-5 lg:p-8" : "p-4 sm:p-6 lg:p-8"}`}>
        <div className={dark ? "w-full" : "mx-auto max-w-6xl w-full"}>
          {children}
        </div>
      </main>

      {/* Нижня панель і шторка «Ще»: < 1024 px */}
      <BottomNav household={household} />
    </div>
  );
}
