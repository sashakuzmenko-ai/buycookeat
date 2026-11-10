"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { requireUser } from "@/lib/context";
import { seedHousehold } from "@/lib/seed";

function credentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  };
}

const fail = (path: string, message: string): never =>
  redirect(`${path}?error=${encodeURIComponent(message)}`);

export async function signIn(formData: FormData) {
  if (!isSupabaseConfigured) redirect("/setup");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(credentials(formData));
  if (error) fail("/login", "Невірна пошта або пароль");
  redirect("/");
}

export async function signUp(formData: FormData) {
  if (!isSupabaseConfigured) redirect("/setup");
  const { email, password } = credentials(formData);
  if (password.length < 8) fail("/login", "Пароль має бути щонайменше 8 символів");
  const supabase = await createClient();
  const origin = (await headers()).get("origin");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: origin ? { emailRedirectTo: origin + "/auth/callback" } : undefined,
  });
  if (error) fail("/login", error.message);
  if (!data.session) {
    redirect(`/login?info=${encodeURIComponent("Ми надіслали лист для підтвердження пошти. Підтвердіть і увійдіть.")}`);
  }
  redirect("/onboarding");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createHousehold(formData: FormData) {
  const { supabase } = await requireUser();
  const name = String(formData.get("name") ?? "").trim() || "Наша сім'я";
  const city = String(formData.get("city") ?? "").trim() || null;

  const { data: householdId, error } = await supabase.rpc("create_household", { p_name: name, p_city: city });
  if (error || !householdId) fail("/onboarding", error?.message ?? "Не вдалося створити сім'ю");

  if (formData.get("seed") === "on") {
    try {
      await seedHousehold(supabase, householdId as string);
    } catch (e) {
      // сім'я вже створена — пускаємо в додаток, дані можна додати вручну
      redirect(`/settings?error=${encodeURIComponent("Стартові дані додались не повністю: " + (e as Error).message)}`);
    }
  }
  redirect("/");
}
