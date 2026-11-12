// Розпізнавання продуктів через OpenRouter.
// Не знає про HTTP-запит, чергу й канал: на вході медіа або текст і довідник сім'ї.

import { PRODUCT_CATEGORIES } from "../seed-data.ts";
import { SCAN_LIMITS, type ScanItem, type ScanMode, type ScanResult, type ScanSource } from "../scan-types.ts";
import { cleanCategory, cleanUnit, roundScanQty } from "./products.ts";

export type CatalogProduct = { id: string; name: string; unit: string };

export type RecognizeInput = {
  mode: ScanMode;
  images: string[];
  audioBase64: string | null;
  text: string;
  note: string;
  products: readonly CatalogProduct[];
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
};

const SOURCES = new Set<ScanSource>(["voice", "images", "both", "text", "none"]);
const UNITS = ["г", "мл", "шт"] as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["source", "store", "total", "items"],
  properties: {
    source: { type: "string", enum: ["voice", "images", "both", "text", "none"] },
    store: { type: "string", description: "Назва магазину або сервісу доставки, інакше порожній рядок" },
    total: { type: "number", description: "Сума в гривнях або 0" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["raw", "product_number", "name", "category", "unit", "quantity", "uncertain", "price"],
        properties: {
          raw: { type: "string", description: "Як позицію названо на чеку, у замовленні або в тексті" },
          product_number: { type: "integer", description: "Номер продукту зі списку або 0, якщо такого немає" },
          name: { type: "string", description: "Коротка загальна назва продукту українською" },
          category: { type: "string", enum: [...PRODUCT_CATEGORIES] },
          unit: { type: "string", enum: [...UNITS] },
          quantity: { type: "number" },
          uncertain: { type: "boolean" },
          price: { type: "number", description: "Ціна позиції в гривнях або 0, якщо її не видно" },
        },
      },
    },
  },
} as const;

export class RecognizeError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "RecognizeError";
    this.status = status;
  }
}

export function buildScanPrompt(mode: ScanMode, products: readonly { name: string; unit: string }[]): string {
  const list = products.map((product, index) => `${index + 1} | ${product.name} | ${product.unit}`).join("\n");
  const regime =
    mode === "add"
      ? "ПОКУПКА — це щойно куплені продукти, їх додадуть до запасів."
      : "ІНВЕНТАРИЗАЦІЯ — це те, що зараз є вдома; кількості замінять поточні залишки.";
  return `Ти допомагаєш українській сім'ї вести домашні запаси продуктів.

На вході можуть бути: фото чека, скріншот замовлення з доставки, кадри з відео холодильника або полиці, аудіо з голосовою диктовкою, або текст на кшталт «купив сир і сметану». Кадри одного відео повторюють ті самі речі з різних моментів.

Режим: ${regime}

Правила:
1. Обери джерело. Якщо є текст зі списком продуктів — він головний (source = "text"), а зображення лише уточнюють. Якщо людина розбірливо диктує продукти — диктовка головна (source = "voice", або "both", коли зображення теж додають позиції). Якщо мовлення й тексту немає — працюй із зображеннями (source = "images"). Якщо нічого не розпізнано — source = "none" і порожній items.
2. Скріншот замовлення з доставки читай як чек: магазин або сервіс у store, сума замовлення в total, кожен продукт окремою позицією. Доставку, знижки, пакування й сервісний збір пропускай.
3. Повертай лише їжу та напої. Побутову хімію, посуд, бонуси пропускай.
4. Зістав позицію з продуктом зі списку, якщо це той самий продукт за змістом: бренд, жирність, сорт і фасування не важать («Молоко Яготинське 2,6% 900г» → «Молоко»). Тоді вкажи його номер у product_number і його одиницю в unit. Якщо відповідника немає — product_number = 0, у name дай коротку загальну назву з великої літери, обери category та unit.
5. quantity — завжди в одиниці продукту: г, мл або шт. Перераховуй: 1,5 кг → 1500; 0,9 л → 900; «дві пачки по 400 г» → 800; десяток яєць → 10.
6. Однаковий продукт, що трапився кілька разів, об'єднай в одну позицію із сумарною кількістю. Не дублюй позиції з повторюваних кадрів.
7. Якщо кількість не видно або її не назвали — оціни за звичайним фасуванням і постав uncertain = true. Так само познач нечітко прочитане або почуте.
8. price — ціна однієї позиції в гривнях, якщо її видно на чеку чи в замовленні; інакше 0. Не вигадуй ціну.
9. store і total заповнюй лише з чека або замовлення; інакше порожній рядок і 0.

Список продуктів сім'ї (номер | назва | одиниця):
${list || "(порожній)"}`;
}

type ModelRow = Record<string, unknown>;

function matchedProduct(row: ModelRow, products: readonly CatalogProduct[]): CatalogProduct | null {
  const number = Number(row.product_number);
  if (!Number.isInteger(number) || number < 1 || number > products.length) return null;
  return products[number - 1] ?? null;
}

function readItem(row: ModelRow, products: readonly CatalogProduct[]): ScanItem | null {
  const quantity = Number(row.quantity);
  if (!(quantity > 0) || !Number.isFinite(quantity)) return null;
  const matched = matchedProduct(row, products);
  const name = String(row.name ?? "").trim().slice(0, 80);
  if (!matched && !name) return null;
  const price = Number(row.price);
  return {
    raw: String(row.raw ?? "").trim().slice(0, 120),
    productId: matched ? matched.id : null,
    name: matched ? matched.name : name,
    category: cleanCategory(row.category),
    unit: matched ? cleanUnit(matched.unit) : cleanUnit(row.unit),
    quantity: roundScanQty(quantity),
    uncertain: Boolean(row.uncertain),
    price: Number.isFinite(price) && price > 0 ? roundScanQty(price) : null,
  };
}

/** Приводить сиру відповідь моделі до ScanResult. Невірні позиції відкидає. */
export function normalizeScanResult(
  parsed: unknown,
  products: readonly CatalogProduct[],
  meta: { model: string; costUsd: number | null },
): ScanResult {
  const record = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const rows = Array.isArray(record.items) ? record.items.slice(0, 100) : [];
  const items: ScanItem[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = readItem(row as ModelRow, products);
    if (item) items.push(item);
  }
  const sourceRaw = String(record.source ?? "");
  const total = Number(record.total);
  return {
    source: SOURCES.has(sourceRaw as ScanSource) ? (sourceRaw as ScanSource) : "none",
    store: String(record.store ?? "").trim().slice(0, 80),
    total: Number.isFinite(total) && total > 0 ? roundScanQty(total) : 0,
    items,
    costUsd: meta.costUsd,
    model: meta.model,
  };
}

function userText(input: RecognizeInput): string {
  const materials = `${input.images.length} зображень${input.audioBase64 ? ", аудіозапис" : ", аудіо немає"}`;
  const lines = [`Матеріали: ${materials}.`];
  if (input.text.trim()) lines.push(`Текст повідомлення: ${input.text.trim()}`);
  if (input.note.trim()) lines.push(`Примітка користувача: ${input.note.trim()}`);
  lines.push("Розпізнай продукти за правилами.");
  return lines.join("\n");
}

type OpenRouterPayload = {
  error?: { message?: string };
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  usage?: { cost?: number };
};

function readModelText(payload: OpenRouterPayload): string {
  const text = payload.choices?.[0]?.message?.content;
  if (text) return text;
  throw new RecognizeError(502, "Модель повернула порожню відповідь");
}

function parseModelJson(text: string, finishReason: string | undefined): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new RecognizeError(502, finishReason === "length" ? "Відповідь обрізано — забагато позицій, спробуйте частинами" : "Модель повернула некоректні дані");
  }
}

export async function recognize(input: RecognizeInput): Promise<ScanResult> {
  if (!input.apiKey) throw new RecognizeError(503, "Не задано OPENROUTER_API_KEY — розпізнавання недоступне");
  const images = input.images.slice(0, SCAN_LIMITS.maxImages);
  const text = input.text.trim();
  const note = input.note.trim();
  if (images.length === 0 && !input.audioBase64 && !text && !note) {
    throw new RecognizeError(400, "Додайте фото, відео, голос або текст");
  }

  const model = input.model || process.env.OPENROUTER_MODEL || "google/gemini-3.8-flash";
  const content: unknown[] = [];
  if (input.audioBase64) content.push({ type: "input_audio", input_audio: { data: input.audioBase64, format: "wav" } });
  for (const url of images) content.push({ type: "image_url", image_url: { url } });
  content.push({ type: "text", text: userText({ ...input, images, text, note }) });

  const call = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await call("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Cook & Eat",
      },
      body: JSON.stringify({
        model,
        max_tokens: 8000,
        reasoning: { effort: "low" },
        usage: { include: true },
        response_format: { type: "json_schema", json_schema: { name: "scan_result", strict: true, schema: SCHEMA } },
        messages: [
          { role: "system", content: buildScanPrompt(input.mode, input.products) },
          { role: "user", content },
        ],
      }),
      signal: AbortSignal.timeout(55_000),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new RecognizeError(504, timedOut ? "Модель відповідає надто довго — спробуйте менше фото" : "Не вдалося зв'язатися з OpenRouter");
  }

  const payload = (await response.json().catch(() => null)) as OpenRouterPayload | null;
  if (!response.ok || !payload || payload.error) {
    const reason = payload?.error?.message ?? `HTTP ${response.status}`;
    throw new RecognizeError(502, `OpenRouter (${model}): ${reason}`);
  }
  const raw = readModelText(payload);
  const parsed = parseModelJson(raw, payload.choices?.[0]?.finish_reason);
  const cost = payload.usage?.cost;
  return normalizeScanResult(parsed, input.products, {
    model,
    costUsd: typeof cost === "number" ? cost : null,
  });
}
