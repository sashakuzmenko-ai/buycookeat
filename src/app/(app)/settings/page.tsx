import { getContext } from "@/lib/context";
import { Notice } from "@/components/Notice";
import { FamilyScreen } from "@/components/family/FamilyScreen";
import type { HouseholdUserInfo } from "@/components/family/AccessCard";
import type { StoreItem } from "@/components/family/StoresSection";
import { linkCodeUsable, pendingExternalId } from "@/lib/channels/bind";
import { lookupBotUsername } from "@/lib/channels/telegram";

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const { supabase, family, portions, household, householdId, user } = await getContext();

  const [storesRes, equipmentRes, usersRes, bindingsRes] = await Promise.all([
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
    supabase
      .from("channel_bindings")
      .select("user_id, external_id, link_code, link_code_expires_at, linked_at")
      .eq("household_id", householdId)
      .eq("channel", "telegram"),
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

  const bindings = bindingsRes.data ?? [];
  const linkedUserIds = bindings.filter((row) => row.linked_at).map((row) => String(row.user_id));
  const mine =
    bindings.find((row) => row.user_id === user.id && row.linked_at) ??
    bindings.find((row) => row.user_id === user.id && row.external_id === pendingExternalId(user.id));
  const expiresMs = mine?.link_code_expires_at ? Date.parse(String(mine.link_code_expires_at)) : Number.NaN;
  const code = !mine?.linked_at && mine?.link_code && linkCodeUsable(String(mine.link_code_expires_at)) ? String(mine.link_code) : null;
  const username = code ? await lookupBotUsername(process.env.TELEGRAM_BOT_TOKEN ?? "") : null;

  return (
    <div className="pb-16 pt-2">
      <FamilyScreen
        family={family}
        portions={portions}
        monthlyBudget={monthlyBudget}
        equipment={equipment}
        users={users}
        telegram={{
          linked: linkedUserIds.includes(user.id),
          code,
          expiresLabel: code
            ? new Intl.DateTimeFormat("uk-UA", {
                timeZone: "Europe/Kyiv",
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(expiresMs))
            : null,
          botUrl: username && code ? `https://t.me/${encodeURIComponent(username)}?start=${encodeURIComponent(code)}` : null,
        }}
        linkedUserIds={linkedUserIds}
        stores={stores}
        notice={<Notice params={await searchParams} />}
      />
    </div>
  );
}
