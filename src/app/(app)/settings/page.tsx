import { getContext } from "@/lib/context";
import { Notice } from "@/components/Notice";
import { FamilyScreen } from "@/components/family/FamilyScreen";
import type { HouseholdUserInfo } from "@/components/family/AccessCard";
import type { StoreItem } from "@/components/family/StoresSection";

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const { supabase, family, portions, household, householdId, user } = await getContext();

  const [storesRes, equipmentRes, usersRes] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, access, visit_frequency, phone, notes")
      .eq("household_id", householdId)
      .order("sort_order"),
    supabase
      .from("equipment")
      .select("id, name")
      .eq("household_id", householdId)
      .order("name"),
    supabase
      .from("household_users")
      .select("user_id, role, created_at")
      .eq("household_id", householdId)
      .order("created_at"),
  ]);

  const stores = (storesRes.data ?? []) as StoreItem[];
  const equipment = (equipmentRes.data ?? []) as { id: string; name: string }[];

  const users: HouseholdUserInfo[] = (usersRes.data ?? []).map((u) => ({
    userId: u.user_id,
    role: u.role,
    isCurrentUser: u.user_id === user.id,
    email: u.user_id === user.id ? user.email : undefined,
  }));

  const monthlyBudget =
    household.monthly_budget != null ? Number(household.monthly_budget) : null;

  return (
    <div className="pb-16 pt-2">
      <FamilyScreen
        family={family}
        portions={portions}
        monthlyBudget={monthlyBudget}
        equipment={equipment}
        users={users}
        stores={stores}
        notice={<Notice params={await searchParams} />}
      />
    </div>
  );
}
