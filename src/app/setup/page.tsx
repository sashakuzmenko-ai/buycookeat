import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export default function SetupPage() {
  if (isSupabaseConfigured) redirect("/");
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="h1 mb-2">Cook &amp; Eat: підключення бази</h1>
      <p className="mb-6 text-sm text-stone-600">
        Додаток ще не знає, до якого проєкту Supabase звертатись.
      </p>
      <ol className="card list-decimal space-y-3 pl-8 text-sm">
        <li>Створіть новий проєкт на supabase.com.</li>
        <li>
          У SQL Editor виконайте файл <code>supabase/migrations/20261110000000_core.sql</code>.
        </li>
        <li>
          Скопіюйте <code>.env.example</code> у <code>.env.local</code> і вставте Project URL та publishable (anon) key
          із Project Settings → API.
        </li>
        <li>Перезапустіть <code>npm run dev</code>.</li>
      </ol>
    </main>
  );
}
