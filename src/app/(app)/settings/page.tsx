import { getContext } from "@/lib/context";
import { Notice } from "@/components/Notice";
import { FamilyScreen } from "@/components/family/FamilyScreen";
import type { HouseholdUserInfo } from "@/components/family/AccessCard";
import type { StoreItem } from "@/components/family/StoresSection";
import { linkCodeUsable } from "@/lib/channels/bind";
import { lookupBotUsername } from "@/lib/channels/telegram";
import type { TelegramBindingView } from "@/components/family/TelegramLink";

const kyivDate = new Intl.DateTimeFormat("uk-UA", {
  timeZone: "Europe/Kyiv",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function chatTypeLabel(raw: string | null): string {
  if (raw === "private") return "Особистий чат";
  if (raw === "group" || raw === "supergroup") return "Група";
  if (raw === "channel") return "Канал";
  return "Чат";
}

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
      .select("id, user_id, external_id, title, chat_type, link_code, link_code_expires_at, linked_at")
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
  const linkedRows = bindings.filter((row) => row.linked_at);
  const linkedUserIds = [...new Set(linkedRows.map((row) => String(row.user_id)))];
  const linkedCount = linkedRows.length;

  const bindingViews: TelegramBindingView[] = linkedRows.map((row) => ({
    id: String(row.id),
    title: String(row.title ?? "").trim() || `Чат ${row.external_id}`,
    chatTypeLabel: chatTypeLabel(row.chat_type ? String(row.chat_type) : null),
    linkedAtLabel: kyivDate.format(new Date(String(row.linked_at))),
  }));

  const pendingMine = bindings
    .filter(
      (row) =>
        row.user_id === user.id &&
        !row.linked_at &&
        row.link_code &&
        linkCodeUsable(String(row.link_code_expires_at)),
    )
    .sort(
      (a, b) =>
        Date.parse(String(b.link_code_expires_at)) - Date.parse(String(a.link_code_expires_at)),
    );
  const activePending = pendingMine[0];
  const expiresMs = activePending?.link_code_expires_at
    ? Date.parse(String(activePending.link_code_expires_at))
    : Number.NaN;
  const code = activePending?.link_code ? String(activePending.link_code) : null;
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
          linkedCount,
          bindings: bindingViews,
          code,
          expiresLabel: code ? kyivDate.format(new Date(expiresMs)) : null,
          botUrl: username && code ? `https://t.me/${encodeURIComponent(username)}?start=${encodeURIComponent(code)}` : null,
        }}
        linkedUserIds={linkedUserIds}
        stores={stores}
        notice={<Notice params={await searchParams} />}
      />
    </div>
  );
}
