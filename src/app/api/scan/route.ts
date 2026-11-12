import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { createIncomingScan } from "@/lib/scan/inbox";
import { recognize, RecognizeError } from "@/lib/scan/recognize";
import { parseScanRequest } from "@/lib/scan/request";
import { SCAN_LIMITS } from "@/lib/scan-types";

export const maxDuration = 60;

const json = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured) return json(503, "База не підключена");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json(401, "Увійдіть у додаток ще раз");

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return json(503, "Не задано OPENROUTER_API_KEY — розпізнавання недоступне");

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > SCAN_LIMITS.maxBodyBytes + 100_000) {
    return json(413, "Забагато даних — зменште кількість фото або тривалість запису");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, "Некоректний запит");
  }
  const parsed = parseScanRequest(body);
  if (!parsed.ok) return json(parsed.status, parsed.error);

  const { data: link } = await supabase
    .from("household_users")
    .select("household_id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!link) return json(403, "Спочатку створіть сім'ю");

  const { data: productRows, error: productsError } = await supabase.from("products").select("id, name, unit").order("name");
  if (productsError) return json(500, productsError.message);

  const requestBody = parsed.value;
  try {
    const result = await recognize({
      mode: requestBody.mode,
      images: requestBody.images,
      audioBase64: requestBody.audioBase64,
      text: requestBody.text,
      note: requestBody.note,
      products: productRows ?? [],
      apiKey,
      model: process.env.OPENROUTER_MODEL,
    });
    const created = await createIncomingScan(supabase, {
      householdId: link.household_id as string,
      sentBy: user.id,
      channel: "web",
      inputType: requestBody.inputType,
      mode: requestBody.mode,
      storeName: result.store || null,
      total: result.total,
      items: result.items,
      channelData: { source: result.source, model: result.model, costUsd: result.costUsd },
    });
    if (!created.ok) return json(500, created.error);
    revalidatePath("/scan");
    return NextResponse.json({ id: created.id, result });
  } catch (error) {
    if (error instanceof RecognizeError) return json(error.status, error.message);
    return json(500, "Не вдалося розпізнати");
  }
}
