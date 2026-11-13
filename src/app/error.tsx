"use client";

import { useEffect } from "react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui";

export default function AppError({ error, retry }: { readonly error: unknown; readonly retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-8 text-center">
      <Logo size="md" className="mb-4 shrink-0" aria-hidden />
      <h1 className="mb-2 font-display text-2xl font-bold tracking-tight text-ink">Щось зламалось</h1>
      <p className="mb-6 text-[15px] text-ink-2">
        Не вдалося завантажити дані. Спробуйте ще раз за хвилину. Якщо не допоможе — перевірте, чи база даних оновлена
        до останньої версії.
      </p>
      <Button type="button" onClick={() => retry()}>
        Спробувати ще раз
      </Button>
    </main>
  );
}
