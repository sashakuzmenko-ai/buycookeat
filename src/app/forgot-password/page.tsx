import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { Button, Card, Field } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { requestPasswordReset } from "../auth-actions";

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  if (!isSupabaseConfigured) redirect("/setup");
  const params = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-8">
      <div className="mb-8 flex flex-col items-center text-center">
        <Logo size="lg" className="mb-4 shrink-0" aria-hidden />
        <h1 className="mb-1 font-display text-2xl font-bold tracking-tight text-ink md:text-[28px]">Відновлення пароля</h1>
        <p className="text-[15px] text-ink-2">Надішлемо лист із посиланням для нового пароля.</p>
      </div>
      <Notice params={params} />
      <Card className="p-5">
        <form action={requestPasswordReset} className="space-y-4">
          <Field label="Пошта" id="email" name="email" type="email" autoComplete="email" required />
          <Button type="submit" className="w-full">
            Надіслати лист
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-ink-2">
        <Link href="/login" className="font-semibold text-brand hover:underline">
          Назад до входу
        </Link>
      </p>
    </main>
  );
}
