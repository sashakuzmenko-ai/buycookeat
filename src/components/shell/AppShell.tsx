"use client";

import React from "react";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";

export interface AppShellProps {
  household: {
    name: string;
    city: string | null;
  };
  children: React.ReactNode;
}

export function AppShell({ household, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-ground text-ink font-sans flex flex-col lg:flex-row w-full max-w-full overflow-x-hidden">
      {/* Бічна панель: ≥ 1024 px */}
      <Sidebar household={household} />

      {/* Основна область вмісту */}
      <main className="flex-1 min-w-0 w-full max-w-full p-4 sm:p-6 lg:p-8 pb-28 lg:pb-8">
        <div className="mx-auto max-w-6xl w-full">
          {children}
        </div>
      </main>

      {/* Нижня панель і шторка «Ще»: < 1024 px */}
      <BottomNav household={household} />
    </div>
  );
}
