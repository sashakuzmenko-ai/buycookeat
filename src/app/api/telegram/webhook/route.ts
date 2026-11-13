import { after, NextResponse } from "next/server";
import { missingBotEnv, webhookSecretOk } from "@/lib/channels/access";
import { handleTelegramUpdate } from "@/lib/channels/turn";
import { createTelegramChannel } from "@/lib/channels/telegram";
import { createServiceClient } from "@/lib/supabase/admin";
import { SUPABASE_URL } from "@/lib/supabase/server";

export const maxDuration = 60;

function botEnv() {
  return {
    token: process.env.TELEGRAM_BOT_TOKEN,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    supabaseUrl: SUPABASE_URL,
    secretKey: process.env.SUPABASE_SECRET_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

export async function POST(request: Request) {
  const missing = missingBotEnv(botEnv());
  if (missing.length > 0) {
    return NextResponse.json({ error: `Бот не налаштовано. Додайте ${missing.join(", ")}.` }, { status: 503 });
  }
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  if (!webhookSecretOk(request.headers.get("x-telegram-bot-api-secret-token"), secret)) {
    return NextResponse.json({ error: "Невірний секрет webhook" }, { status: 401 });
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 100_000) return NextResponse.json({ error: "Завелике оновлення" }, { status: 413 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некоректне оновлення" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  if (!supabase || !token) {
    return NextResponse.json({ error: "Бот не налаштовано. Додайте SUPABASE_SECRET_KEY." }, { status: 503 });
  }
  const origin = new URL(request.url).origin;
  const channel = createTelegramChannel(token);
  const apiKey = process.env.OPENROUTER_API_KEY ?? "";
  const model = process.env.OPENROUTER_MODEL;
  after(async () => {
    try {
      await handleTelegramUpdate({ supabase, channel, body, origin, apiKey, model });
    } catch (error) {
      console.error("telegram webhook", error instanceof Error ? error.message : "fail");
    }
  });
  return NextResponse.json({ ok: true });
}
