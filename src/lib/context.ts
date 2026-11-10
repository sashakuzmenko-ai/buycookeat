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
  const { data: link } = await supabase
    .from("household_users")
    .select("household_id, households(name, city)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!link) redirect("/onboarding");

  const { data: members } = await supabase
    .from("family_members")
    .select("id, name, kind, birth_date, portion_factor, notes")
    .eq("household_id", link.household_id)
    .order("created_at");

  const family = (members ?? []) as FamilyMember[];
  const household = link.households as unknown as { name: string; city: string | null };
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
