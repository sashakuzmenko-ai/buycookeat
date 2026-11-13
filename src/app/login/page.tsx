import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { Button, Card, Field } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { signIn, signUp } from "../auth-actions";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (!isSupabaseConfigured) redirect("/setup");
  const params = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-8">
      <div className="mb-8 flex flex-col items-center text-center">
        <Logo size="lg" className="mb-4 shrink-0" aria-hidden />
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink md:text-[28px] mb-1">Cook &amp; Eat</h1>
        <p className="text-[15px] text-ink-2">Купуй. Готуй. Смакуй.</p>
      </div>
      <Notice params={params} />
      <Card className="p-5">
        <form className="space-y-4">
          <Field
            label="Пошта"
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
          <Field
            label="Пароль"
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <div className="flex flex-col gap-2 pt-1 sm:flex-row">
            <Button type="submit" className="flex-1" formAction={signIn}>
              Увійти в застосунок
            </Button>
            <Button type="submit" variant="secondary" className="flex-1" formAction={signUp}>
              Створити обліковий запис
            </Button>
          </div>
        </form>
      </Card>
    </main>
  );
}
