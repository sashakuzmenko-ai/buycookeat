import { redirect } from "next/navigation";
import { requireUser } from "@/lib/context";
import { Notice } from "@/components/Notice";
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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <h1 className="h1 mb-1">Створимо вашу сім&apos;ю</h1>
      <p className="mb-6 text-sm text-stone-600">Це займе кілька секунд. Усе можна змінити пізніше.</p>
      <Notice params={await searchParams} />
      <form action={createHousehold} className="card space-y-3">
        <div>
          <label className="label" htmlFor="name">Назва</label>
          <input className="input" id="name" name="name" defaultValue="Наша сім'я" required />
        </div>
        <div>
          <label className="label" htmlFor="city">Місто</label>
          <input className="input" id="city" name="city" defaultValue="Івано-Франківськ" />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="seed" defaultChecked className="mt-0.5 size-4 accent-brand-600" />
          <span>
            Додати стартові дані: 4 члени сім&apos;ї, 7 магазинів, базові продукти і 14 рецептів
          </span>
        </label>
        <button className="btn w-full">Почати</button>
      </form>
    </main>
  );
}
