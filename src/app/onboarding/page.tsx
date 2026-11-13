import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { Button, Card, Field } from "@/components/ui";
import { requireUser } from "@/lib/context";
import { createHousehold } from "../auth-actions";

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const { supabase, user } = await requireUser();
  const { data: existing } = await supabase
    .from("household_users")
    .select("household_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (existing) redirect("/");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8">
      <div className="mb-8 flex flex-col items-center text-center">
        <Logo size="md" className="mb-3 shrink-0" aria-hidden />
        <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-2">
          Крок 1 з 1
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink md:text-[28px] mb-2">Створимо вашу сім&apos;ю</h1>
        <p className="max-w-sm text-[15px] text-ink-2">
          Назва й місто — на старт. Усе можна змінити пізніше в налаштуваннях.
        </p>
      </div>
      <Notice params={await searchParams} />
      <Card className="p-5">
        <form action={createHousehold} className="space-y-4">
          <Field
            label="Як назвемо сім'ю?"
            id="name"
            name="name"
            defaultValue="Наша сім'я"
            required
            hint="Це побачать усі, хто веде спільне меню й покупки."
          />
          <Field
            label="Місто"
            id="city"
            name="city"
            defaultValue="Івано-Франківськ"
            hint="Допомагає з магазинами та стартовими даними, якщо оберете їх нижче."
          />
          <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-12 border border-line bg-soft p-3 text-[15px] text-ink">
            <input
              type="checkbox"
              name="seed"
              defaultChecked
              className="mt-0.5 size-[18px] shrink-0 accent-brand"
            />
            <span>
              <span className="font-semibold">Додати стартові дані</span>
              <span className="mt-0.5 block text-[13px] text-ink-2">
                4 члени сім&apos;ї, 7 магазинів, базові продукти й 14 рецептів — одразу можна пробувати
                меню.
              </span>
            </span>
          </label>
          <Button type="submit" className="w-full" size="lg">
            Створити сім&apos;ю й перейти до меню
          </Button>
        </form>
      </Card>
    </main>
  );
}
