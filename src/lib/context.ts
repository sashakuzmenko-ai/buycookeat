import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "./supabase/server";
import { householdPortions } from "./shopping";

export type FamilyMember = {
  id: string;
  name: string;
  kind: "adult" | "child";
  birth_date: string | null;
  portion_factor: number;
  notes: string | null;
  restrictions: string[];
};

/** Користувач (або редірект на /login). Викликати в кожній server action. */
export const requireUser = cache(async () => {
  if (!isSupabaseConfigured) redirect("/setup");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
});

/** Користувач + його домогосподарство + порції сім'ї. */
export const getContext = cache(async () => {
  const { supabase, user } = await requireUser();
  const { data: link, error: linkError } = await supabase
    .from("household_users")
    .select("household_id, households(id, name, city, monthly_budget)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  // Помилка запиту — не те саме, що «сім'ї ще немає»: інакше / і /onboarding
  // перекидають одне на одного без кінця (наприклад, коли в базі бракує міграції).
  if (linkError) throw new Error(`Не вдалося прочитати сім'ю: ${linkError.message}`);
  if (!link) redirect("/onboarding");

  const { data: members } = await supabase
    .from("family_members")
    .select("id, name, kind, birth_date, portion_factor, notes, restrictions")
    .eq("household_id", link.household_id)
    .order("created_at");

  const family = ((members ?? []) as unknown as Array<Record<string, unknown>>).map((m) => ({
    id: String(m.id ?? ""),
    name: String(m.name ?? ""),
    kind: m.kind === "child" ? ("child" as const) : ("adult" as const),
    birth_date: (m.birth_date as string | null) ?? null,
    portion_factor: Number(m.portion_factor ?? 1),
    notes: (m.notes as string | null) ?? null,
    restrictions: Array.isArray(m.restrictions) ? (m.restrictions as string[]) : [],
  }));
  const household = link.households as unknown as {
    id?: string;
    name: string;
    city: string | null;
    monthly_budget?: number | null;
  };
  return {
    supabase,
    user,
    householdId: link.household_id as string,
    household,
    family,
    // без членів сім'ї рахуємо як на одного дорослого, щоб не ділити на нуль
    portions: householdPortions(family) || 1,
  };
});
