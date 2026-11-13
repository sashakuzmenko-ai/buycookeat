// Одноразовий код прив'язки чату до акаунта й сім'ї. Без бази.

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const LINK_CODE_TTL_MS = 20 * 60 * 1000;

export function pendingExternalId(userId: string): string {
  return `pending:${userId}`;
}

export function linkCodeFromBytes(bytes: Uint8Array): string {
  let code = "";
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
  return code;
}

export function createLinkCode(now = Date.now()): { code: string; expiresAt: string } {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return { code: linkCodeFromBytes(bytes), expiresAt: new Date(now + LINK_CODE_TTL_MS).toISOString() };
}

export function linkCodeUsable(expiresAt: string | null, nowMs = Date.now()): boolean {
  if (!expiresAt) return false;
  const expires = Date.parse(expiresAt);
  return Number.isFinite(expires) && expires > nowMs;
}

export function normalizeLinkCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g, "");
}

export type RedeemRow = {
  id: string;
  householdId: string;
  userId: string;
  expiresAt: string | null;
  linkedAt: string | null;
};

export type RedeemRefusal = "missing" | "expired" | "used" | "not_member" | "chat_taken";

export function decideRedeem(input: {
  row: RedeemRow | null;
  nowMs: number;
  member: boolean;
  chatOwnerHouseholdId: string | null;
}): { ok: true } | { ok: false; reason: RedeemRefusal } {
  if (!input.row) return { ok: false, reason: "missing" };
  if (input.row.linkedAt) return { ok: false, reason: "used" };
  const expires = input.row.expiresAt ? Date.parse(input.row.expiresAt) : Number.NaN;
  if (!Number.isFinite(expires) || expires <= input.nowMs) return { ok: false, reason: "expired" };
  if (!input.member) return { ok: false, reason: "not_member" };
  if (input.chatOwnerHouseholdId) return { ok: false, reason: "chat_taken" };
  return { ok: true };
}

export function redeemFailureText(reason: RedeemRefusal): string {
  if (reason === "chat_taken") return "Цей чат вже прив'язаний.";
  return "Код недійсний або прострочений. Згенеруйте новий у розділі Сім'я.";
}
