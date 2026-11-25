import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { Button, Card, Field } from "@/components/ui";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { updatePassword } from "../auth-actions";

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  if (!isSupabaseConfigured) redirect("/setup");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/forgot-password?error=${encodeURIComponent("Посилання застаріло. Запросіть новий лист.")}`);
  }
  const params = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-8">
      <div className="mb-8 flex flex-col items-center text-center">
        <Logo size="lg" className="mb-4 shrink-0" aria-hidden />
        <h1 className="mb-1 font-display text-2xl font-bold tracking-tight text-ink md:text-[28px]">Новий пароль</h1>
        <p className="text-[15px] text-ink-2">Для {user.email}</p>
      </div>
      <Notice params={params} />
      <Card className="p-5">
        <form action={updatePassword} className="space-y-4">
          <Field
            label="Новий пароль"
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <Field
            label="Повторіть пароль"
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <Button type="submit" className="w-full">
            Зберегти пароль
          </Button>
        </form>
      </Card>
    </main>
  );
}
