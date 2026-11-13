// Імпорт чернетки рецепта з веб-сторінки через OpenRouter.

import { MEAL_TYPES } from "../seed-data.ts";
import { cleanUnit, productKey, roundScanQty } from "../scan/products.ts";

export type CatalogProduct = { id: string; name: string; unit: string };

const PAGE_BYTES_LIMIT = Math.floor(1.5 * 1024 * 1024);
const MAX_PAGE_TEXT = 24_000;
const UNITS = ["г", "мл", "шт"] as const;

export type UnmatchedItem = {
  raw: string;
  name: string;
  quantity: number;
  unit: string;
  optional: boolean;
};

export type RecipeDraft = {
  title: string;
  description: string;
  instructions: string;
  base_servings: number;
  cook_minutes: number | null;
  meal_types: string[];
  ingredients: { product_id: string; quantity: number; optional: boolean }[];
  unmatched: UnmatchedItem[];
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "description", "instructions", "base_servings", "cook_minutes", "meal_types", "items"],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    instructions: { type: "string" },
    base_servings: { type: "number" },
    cook_minutes: { type: "number" },
    meal_types: {
      type: "array",
      items: { type: "string", enum: [...MEAL_TYPES] },
    },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["raw", "product_number", "name", "quantity", "unit", "optional"],
        properties: {
          raw: { type: "string" },
          product_number: { type: "integer" },
          name: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string", enum: [...UNITS] },
          optional: { type: "boolean" },
        },
      },
    },
  },
} as const;

export class ImportRecipeError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ImportRecipeError";
    this.status = status;
  }
}

function ipv4Private(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function hostBlocked(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1" || host.endsWith(".localhost")) return true;
  if (hostname.toLowerCase() === "[::1]") return true;
  return ipv4Private(host);
}

function portAllowed(url: URL): boolean {
  if (!url.port) return true;
  if (url.protocol === "http:" && url.port === "80") return true;
  if (url.protocol === "https:" && url.port === "443") return true;
  return false;
}

/** Дозволені лише публічні http(s) URL без нестандартних портів. */
export function checkRecipeUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Вкажіть адресу сторінки з рецептом" };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "Некоректна адреса" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Підтримуються лише адреси http або https" };
  }
  if (hostBlocked(url.hostname)) {
    return { ok: false, error: "Локальні й приватні адреси заборонені" };
  }
  if (!portAllowed(url)) {
    return { ok: false, error: "Дозволені лише стандартні порти (80 і 443)" };
  }
  return { ok: true, url };
}

async function readLimited(response: Response, max: number): Promise<Uint8Array | "too-large"> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > max) return "too-large";
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength > max ? "too-large" : bytes;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const step = await reader.read();
    if (step.done) break;
    total += step.value.byteLength;
    if (total > max) {
      await reader.cancel();
      return "too-large";
    }
    chunks.push(step.value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export function htmlToPlainText(html: string): string {
  let text = html.replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");
  text = text.replaceAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  text = text.replaceAll(/<[^>]+>/g, " ");
  text = text
    .replaceAll(/&nbsp;/gi, " ")
    .replaceAll(/&amp;/gi, "&")
    .replaceAll(/&lt;/gi, "<")
    .replaceAll(/&gt;/gi, ">")
    .replaceAll(/&quot;/gi, '"')
    .replaceAll(/&#39;/gi, "'");
  return text.replaceAll(/\s+/g, " ").trim();
}

/** Завантажує сторінку, знімає розмітку й обрізає текст для моделі. */
export async function fetchRecipePage(url: URL, fetchImpl: typeof fetch = fetch): Promise<string> {
  let response: Response;
  try {
    response = await fetchImpl(url.toString(), {
      headers: { Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8", "User-Agent": "CookAndEat/1.0 (+recipe-import)" },
      signal: AbortSignal.timeout(25_000),
      redirect: "follow",
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new ImportRecipeError(504, timedOut ? "Сторінка відповідає надто довго" : "Не вдалося завантажити сторінку");
  }
  if (!response.ok) throw new ImportRecipeError(502, `Сторінка повернула помилку (${response.status})`);
  const bytes = await readLimited(response, PAGE_BYTES_LIMIT);
  if (bytes === "too-large") throw new ImportRecipeError(413, "Сторінка завелика для імпорту");
  const html = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const plain = htmlToPlainText(html);
  if (!plain) throw new ImportRecipeError(422, "На сторінці не знайдено тексту рецепта");
  return plain.length > MAX_PAGE_TEXT ? plain.slice(0, MAX_PAGE_TEXT) : plain;
}

function buildRecipePrompt(products: readonly CatalogProduct[]): string {
  const list = products.map((product, index) => `${index + 1} | ${product.name} | ${product.unit}`).join("\n");
  return `Ти допомагаєш українській сім'ї вести кулінарну книгу. На вході — текст веб-сторінки з рецептом. Поверни структурований рецепт українською.

Правила:
1. title — коротка назва страви; description — кілька речень; instructions — покроково, з нового рядка.
2. base_servings — скільки порцій у оригіналі (1–12); cook_minutes — час приготування або 0, якщо невідомо.
3. meal_types — один або кілька з: ${MEAL_TYPES.join(", ")}.
4. Кожен інгредієнт — окрема позиція в items. quantity в г, мл або шт; перераховуй кг/л як у скані.
5. Зістав з продуктом зі списку сім'ї за змістом (product_number). Якщо немає відповідника — product_number = 0 і коротка name.
6. optional = true лише для «за бажанням», гарніру окремо або спеції «за смаком».

Список продуктів сім'ї (номер | назва | одиниця):
${list || "(порожній)"}`;
}

type ModelRow = Record<string, unknown>;

function matchedProduct(row: ModelRow, products: readonly CatalogProduct[]): CatalogProduct | null {
  const number = Number(row.product_number);
  if (!Number.isInteger(number) || number < 1 || number > products.length) return null;
  return products[number - 1] ?? null;
}

function readDraftItem(
  row: ModelRow,
  products: readonly CatalogProduct[],
  byName: ReadonlyMap<string, string>,
): { ingredient: RecipeDraft["ingredients"][number] | null; unmatched: UnmatchedItem | null } {
  const quantity = Number(row.quantity);
  if (!(quantity > 0) || !Number.isFinite(quantity)) return { ingredient: null, unmatched: null };
  const raw = String(row.raw ?? "").trim().slice(0, 120);
  const optional = Boolean(row.optional);
  const unit = cleanUnit(row.unit);
  const qty = roundScanQty(quantity);
  const matched = matchedProduct(row, products);
  const name = String(row.name ?? "").trim().slice(0, 80);
  const productId = matched?.id ?? (name ? byName.get(productKey(name)) : undefined);
  if (productId) {
    return {
      ingredient: { product_id: productId, quantity: qty, optional },
      unmatched: null,
    };
  }
  if (!name) return { ingredient: null, unmatched: null };
  return {
    ingredient: null,
    unmatched: { raw, name, quantity: qty, unit, optional },
  };
}

/** Нормалізує відповідь моделі: зіставлені інгредієнти й окремий список нерозпізнаних. */
export function normalizeRecipeDraft(parsed: unknown, products: readonly CatalogProduct[]): RecipeDraft {
  const record = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const byName = new Map(products.map((p) => [productKey(p.name), p.id]));
  const ingredients: RecipeDraft["ingredients"] = [];
  const unmatched: UnmatchedItem[] = [];
  const rows = Array.isArray(record.items) ? record.items.slice(0, 80) : [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const { ingredient, unmatched: loose } = readDraftItem(row as ModelRow, products, byName);
    if (ingredient) ingredients.push(ingredient);
    else if (loose) unmatched.push(loose);
  }
  const base = Number(record.base_servings);
  const base_servings = Number.isFinite(base) && base > 0 ? Math.min(50, Math.max(0.5, roundScanQty(base))) : 4;
  const cookRaw = Number(record.cook_minutes);
  const cook_minutes = Number.isFinite(cookRaw) && cookRaw > 0 ? Math.round(cookRaw) : null;
  const mealRaw = Array.isArray(record.meal_types) ? record.meal_types.map(String) : [];
  const meal_types = mealRaw.filter((m): m is (typeof MEAL_TYPES)[number] => (MEAL_TYPES as readonly string[]).includes(m));
  return {
    title: String(record.title ?? "").trim().slice(0, 120) || "Рецепт без назви",
    description: String(record.description ?? "").trim().slice(0, 2000),
    instructions: String(record.instructions ?? "").trim().slice(0, 8000),
    base_servings,
    cook_minutes,
    meal_types,
    ingredients,
    unmatched,
  };
}

type OpenRouterPayload = {
  error?: { message?: string };
  choices?: { message?: { content?: string }; finish_reason?: string }[];
};

function readModelText(payload: OpenRouterPayload): string {
  const text = payload.choices?.[0]?.message?.content;
  if (text) return text;
  throw new ImportRecipeError(502, "Модель повернула порожню відповідь");
}

function parseModelJson(text: string, finishReason: string | undefined): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ImportRecipeError(
      502,
      finishReason === "length" ? "Відповідь обрізано — сторінка надто велика" : "Модель повернула некоректні дані",
    );
  }
}

export type ImportRecipeDraftInput = {
  url: URL;
  products: readonly CatalogProduct[];
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
};

export async function importRecipeDraft(input: ImportRecipeDraftInput): Promise<RecipeDraft> {
  if (!input.apiKey) throw new ImportRecipeError(503, "Не задано OPENROUTER_API_KEY — імпорт недоступний");
  const call = input.fetchImpl ?? fetch;
  const pageText = await fetchRecipePage(input.url, call);
  const model = input.model || process.env.OPENROUTER_MODEL || "google/gemini-3.8-flash";

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
        max_tokens: 6000,
        reasoning: { effort: "low" },
        response_format: { type: "json_schema", json_schema: { name: "recipe_draft", strict: true, schema: SCHEMA } },
        messages: [
          { role: "system", content: buildRecipePrompt(input.products) },
          {
            role: "user",
            content: `URL: ${input.url.toString()}\n\nТекст сторінки:\n${pageText}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(55_000),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new ImportRecipeError(504, timedOut ? "Модель відповідає надто довго" : "Не вдалося зв'язатися з OpenRouter");
  }

  const payload = (await response.json().catch(() => null)) as OpenRouterPayload | null;
  if (!response.ok || !payload || payload.error) {
    const reason = payload?.error?.message ?? `HTTP ${response.status}`;
    throw new ImportRecipeError(502, `OpenRouter (${model}): ${reason}`);
  }
  const raw = readModelText(payload);
  const parsed = parseModelJson(raw, payload.choices?.[0]?.finish_reason);
  return normalizeRecipeDraft(parsed, input.products);
}
