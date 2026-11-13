// Доступ каналу до сім'ї. Службовий ключ обходить RLS, тож кожне читання й запис
// проходить через ці рішення: неприв'язаний чат і чужа сім'я не отримують рядків.

import { timingSafeEqual } from "node:crypto";

export type ChannelBindingView = {
  householdId: string;
  userId: string;
  linkedAt: string | null;
};

export type AccessDecision =
  | { allowed: true; householdId: string; userId: string }
  | { allowed: false; reason: "unbound" | "not_member" | "other_household" };

export function decideChannelAccess(input: {
  binding: ChannelBindingView | null;
  member: boolean;
  targetHouseholdId: string | null;
}): AccessDecision {
  if (!input.binding?.linkedAt) return { allowed: false, reason: "unbound" };
  if (!input.member) return { allowed: false, reason: "not_member" };
  if (input.targetHouseholdId && input.targetHouseholdId !== input.binding.householdId) {
    return { allowed: false, reason: "other_household" };
  }
  return { allowed: true, householdId: input.binding.householdId, userId: input.binding.userId };
}

/** null — операцію не виконувати. Чужа сім'я не підміняє ідентифікатор прив'язки. */
export function scopedHousehold(decision: AccessDecision, requestedHouseholdId: string | null): string | null {
  if (!decision.allowed) return null;
  if (requestedHouseholdId && requestedHouseholdId !== decision.householdId) return null;
  return decision.householdId;
}

export function rowsForGrant<T extends { householdId: string }>(decision: AccessDecision, rows: readonly T[]): T[] {
  const householdId = scopedHousehold(decision, null);
  if (!householdId) return [];
  return rows.filter((row) => row.householdId === householdId);
}

export type BotEnv = {
  token?: string;
  webhookSecret?: string;
  supabaseUrl?: string;
  secretKey?: string;
  serviceRoleKey?: string;
};

/** Новий secret key (sb_secret_…) має пріоритет над legacy service_role. */
export function supabaseServerKey(env: Pick<BotEnv, "secretKey" | "serviceRoleKey">): string {
  const secret = env.secretKey?.trim() ?? "";
  if (secret) return secret;
  return env.serviceRoleKey?.trim() ?? "";
}

export function missingBotEnv(env: BotEnv): string[] {
  const missing: string[] = [];
  if (!env.token?.trim()) missing.push("TELEGRAM_BOT_TOKEN");
  if (!env.webhookSecret?.trim()) missing.push("TELEGRAM_WEBHOOK_SECRET");
  if (!env.supabaseUrl?.trim()) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseServerKey(env)) missing.push("SUPABASE_SECRET_KEY");
  return missing;
}

export function webhookSecretOk(provided: string | null, expected: string): boolean {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
