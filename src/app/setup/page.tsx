import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Card } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export default function SetupPage() {
  if (isSupabaseConfigured) redirect("/");
  return (
    <main className="mx-auto max-w-xl px-4 py-12 md:py-16">
      <div className="mb-8 flex items-center gap-3">
        <Logo size="md" aria-hidden className="shrink-0" />
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink md:text-[28px] mb-0.5">Підключимо базу</h1>
          <p className="text-[15px] text-ink-2">Купуй. Готуй. Смакуй. — спочатку зв&apos;яжемо Supabase.</p>
        </div>
      </div>
      <p className="mb-5 text-[15px] text-ink-2">
        Застосунок ще не знає, до якого проєкту Supabase звертатись. Це разове налаштування для локальної
        розробки чи нового середовища.
      </p>
      <Card className="p-5">
        <h2 className="font-display text-base font-bold text-ink md:text-[18px] mb-4">Що зробити</h2>
        <ol className="list-none space-y-4 text-[15px] text-ink">
          <li className="flex gap-3">
            <span
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-menu-tint font-display text-sm font-bold text-menu-ink"
              aria-hidden
            >
              1
            </span>
            <span>Створіть новий проєкт на supabase.com.</span>
          </li>
          <li className="flex gap-3">
            <span
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-menu-tint font-display text-sm font-bold text-menu-ink"
              aria-hidden
            >
              2
            </span>
            <span>
              У SQL Editor виконайте файл{" "}
              <code className="rounded-12 bg-soft px-1.5 py-0.5 font-mono text-[13px] text-ink">
                supabase/migrations/20261110000000_core.sql
              </code>
              .
            </span>
          </li>
          <li className="flex gap-3">
            <span
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-menu-tint font-display text-sm font-bold text-menu-ink"
              aria-hidden
            >
              3
            </span>
            <span>
              Скопіюйте{" "}
              <code className="rounded-12 bg-soft px-1.5 py-0.5 font-mono text-[13px] text-ink">.env.example</code> у{" "}
              <code className="rounded-12 bg-soft px-1.5 py-0.5 font-mono text-[13px] text-ink">.env.local</code> і
              вставте Project URL та publishable (anon) key із Project Settings → API.
            </span>
          </li>
          <li className="flex gap-3">
            <span
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-menu-tint font-display text-sm font-bold text-menu-ink"
              aria-hidden
            >
              4
            </span>
            <span>
              Перезапустіть{" "}
              <code className="rounded-12 bg-soft px-1.5 py-0.5 font-mono text-[13px] text-ink">npm run dev</code> —
              після цього відкриється вхід.
            </span>
          </li>
        </ol>
      </Card>
    </main>
  );
}
