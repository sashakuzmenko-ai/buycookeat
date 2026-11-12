import { NextResponse, type NextRequest } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { PRODUCT_CATEGORIES } from "@/lib/seed-data";
import { SCAN_LIMITS, type ScanItem, type ScanResult } from "@/lib/scan-types";

export const maxDuration = 60;

// Модель має приймати і зображення, і аудіо. Змінюється без правок коду.
const MODEL = process.env.OPENROUTER_MODEL || "google/gemini-3.8-flash";

const UNITS = ["г", "мл", "шт"] as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["source", "store", "total", "items"],
  properties: {
    source: { type: "string", enum: ["voice", "images", "both", "none"] },
    store: { type: "string", description: "Назва магазину з чека або порожній рядок" },
    total: { type: "number", description: "Сума чека в гривнях або 0" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["raw", "product_number", "name", "category", "unit", "quantity", "uncertain"],
        properties: {
          raw: { type: "string", description: "Як позицію названо на чеку або в диктовці" },
          product_number: { type: "integer", description: "Номер продукту зі списку або 0, якщо такого немає" },
          name: { type: "string", description: "Коротка загальна назва продукту українською" },
          category: { type: "string", enum: [...PRODUCT_CATEGORIES] },
          unit: { type: "string", enum: [...UNITS] },
          quantity: { type: "number" },
          uncertain: { type: "boolean" },
        },
      },
    },
  },
} as const;

function systemPrompt(mode: "add" | "set", products: { name: string; unit: string }[]) {
  const list = products.map((p, i) => `${i + 1} | ${p.name} | ${p.unit}`).join("\n");
  return `Ти допомагаєш українській сім'ї вести домашні запаси продуктів.

На вході можуть бути: фото або скріншот чека, кадри з відео чека, фото чи кадри відео холодильника або полиці, аудіо з голосовою диктовкою продуктів. Кадри одного відео повторюють ті самі речі з різних моментів.

Режим: ${mode === "add" ? "ПОКУПКА — це щойно куплені продукти, їх додадуть до запасів." : "ІНВЕНТАРИЗАЦІЯ — це те, що зараз є вдома; кількості замінять поточні залишки."}

Правила:
1. Спершу перевір аудіо. Якщо в ньому людина розбірливо називає продукти — диктовка є головним джерелом, а зображення лише уточнюють її (source = "voice" або "both"). Якщо мовлення про продукти немає — ігноруй аудіо і працюй із зображеннями (source = "images"). Якщо нічого не розпізнано — source = "none" і порожній items.
2. Повертай лише їжу та напої. Пакети, побутову хімію, посуд, знижки, бонуси пропускай.
3. Зістав позицію з продуктом зі списку нижче, якщо це той самий продукт за змістом: бренд, жирність, сорт і фасування не важать («Молоко Яготинське 2,6% 900г» → «Молоко»). Тоді вкажи його номер у product_number і його одиницю в unit. Якщо відповідника немає — product_number = 0, у name дай коротку загальну назву з великої літери, обери category та unit.
4. quantity — завжди в одиниці продукту: г, мл або шт. Перераховуй: 1,5 кг → 1500; 0,9 л → 900; «дві пачки по 400 г» → 800; десяток яєць → 10.
5. Однаковий продукт, що трапився кілька разів, об'єднай в одну позицію із сумарною кількістю. Не дублюй позиції з повторюваних кадрів.
6. Якщо кількість не видно або її не назвали (типово для холодильника) — оціни за звичайним фасуванням і постав uncertain = true. Так само познач позиції, які прочитано або почуто нечітко.
7. store і total заповнюй лише з чека; інакше порожній рядок і 0.

Список продуктів сім'ї (номер | назва | одиниця):
${list || "(порожній)"}`;
}

type Body = { mode?: unknown; images?: unknown; audio?: unknown; note?: unknown };

const json = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured) return json(503, "База не підключена");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json(401, "Увійдіть у додаток ще раз");

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return json(503, "Не задано OPENROUTER_API_KEY — розпізнавання недоступне");

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > SCAN_LIMITS.maxBodyBytes + 100_000) return json(413, "Забагато даних — зменште кількість фото або тривалість запису");

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json(400, "Некоректний запит");
  }
  const mode = body.mode === "set" ? "set" : "add";
  const images = Array.isArray(body.images)
    ? body.images.filter((s): s is string => typeof s === "string" && s.startsWith("data:image/jpeg;base64,")).slice(0, SCAN_LIMITS.maxImages)
    : [];
  const audio = typeof body.audio === "string" && /^[A-Za-z0-9+/=]+$/.test(body.audio) ? body.audio : null;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
  if (images.length === 0 && !audio && !note) return json(400, "Додайте фото, відео або запис голосу");

  // RLS віддасть лише продукти сім'ї користувача
  const { data: productRows, error: productsError } = await supabase.from("products").select("id, name, unit").order("name");
  if (productsError) return json(500, productsError.message);
  const products = productRows ?? [];

  const content: unknown[] = [];
  if (audio) content.push({ type: "input_audio", input_audio: { data: audio, format: "wav" } });
  for (const url of images) content.push({ type: "image_url", image_url: { url } });
  content.push({
    type: "text",
    text:
      `Матеріали: ${images.length} зображень${audio ? ", аудіозапис" : ", аудіо немає"}.` +
      (note ? `\nПримітка користувача: ${note}` : "") +
      "\nРозпізнай продукти за правилами.",
  });

  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Title": "Cook & Eat",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        reasoning: { effort: "low" },
        usage: { include: true },
        response_format: { type: "json_schema", json_schema: { name: "scan_result", strict: true, schema: SCHEMA } },
        messages: [
          { role: "system", content: systemPrompt(mode, products) },
          { role: "user", content },
        ],
      }),
      signal: AbortSignal.timeout(55_000),
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    return json(504, timedOut ? "Модель відповідає надто довго — спробуйте менше фото" : "Не вдалося зв'язатися з OpenRouter");
  }

  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: { cost?: number };
  } | null;
  if (!response.ok || !payload || payload.error) {
    const reason = payload?.error?.message ?? `HTTP ${response.status}`;
    return json(502, `OpenRouter (${MODEL}): ${reason}`);
  }
  const text = payload.choices?.[0]?.message?.content;
  if (!text) return json(502, "Модель повернула порожню відповідь");

  let parsed: { source?: string; store?: string; total?: number; items?: Record<string, unknown>[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    const cut = payload.choices?.[0]?.finish_reason === "length";
    return json(502, cut ? "Відповідь обрізано — забагато позицій, спробуйте частинами" : "Модель повернула некоректні дані");
  }

  // Модель — недовірене джерело: усе перевіряємо і приводимо до наших типів
  const items: ScanItem[] = [];
  for (const row of Array.isArray(parsed.items) ? parsed.items.slice(0, 100) : []) {
    const quantity = Number(row.quantity);
    if (!(quantity > 0) || !Number.isFinite(quantity)) continue;
    const number = Number(row.product_number);
    const matched = Number.isInteger(number) && number >= 1 && number <= products.length ? products[number - 1] : null;
    const name = String(row.name ?? "").trim().slice(0, 80);
    if (!matched && !name) continue;
    const unit = (UNITS as readonly string[]).includes(String(row.unit)) ? (row.unit as ScanItem["unit"]) : "шт";
    items.push({
      raw: String(row.raw ?? "").trim().slice(0, 120),
      productId: matched ? (matched.id as string) : null,
      name: matched ? (matched.name as string) : name,
      category: (PRODUCT_CATEGORIES as readonly string[]).includes(String(row.category)) ? String(row.category) : "інше",
      unit: matched ? (matched.unit as ScanItem["unit"]) : unit,
      quantity: Math.round(quantity * 100) / 100,
      uncertain: Boolean(row.uncertain),
    });
  }

  const source = ["voice", "images", "both", "none"].includes(String(parsed.source)) ? (parsed.source as ScanResult["source"]) : "none";
  const result: ScanResult = {
    source,
    store: String(parsed.store ?? "").slice(0, 80),
    total: Number(parsed.total) > 0 ? Number(parsed.total) : 0,
    items,
    costUsd: typeof payload.usage?.cost === "number" ? payload.usage.cost : null,
    model: MODEL,
  };
  return NextResponse.json(result);
}
