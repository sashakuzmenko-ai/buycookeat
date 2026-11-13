// Імпорт чернетки рецепта з веб-сторінки через OpenRouter.

import { productByListNumber } from "../catalog/product-number.ts";
import { checkPublicHttpUrl, fetchPublicHttpResponse, PublicFetchError } from "../http/public-url.ts";
import { readLimited } from "../http/read-limited.ts";
import { openRouterJsonChat } from "../openrouter/json-chat.ts";
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

/** Дозволені лише публічні https URL без нестандартних портів. */
export function checkRecipeUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  return checkPublicHttpUrl(raw);
}

function stripTaggedBlocks(html: string, tag: string): string {
  const lower = html.toLowerCase();
  const endTag = `</${tag}>`;
  let result = "";
  let cursor = 0;
  while (cursor < html.length) {
    const openIdx = lower.indexOf(`<${tag}`, cursor);
    if (openIdx < 0) {
      result += html.slice(cursor);
      break;
    }
    result += html.slice(cursor, openIdx);
    const closeIdx = lower.indexOf(endTag, openIdx);
    if (closeIdx < 0) break;
    cursor = closeIdx + endTag.length;
  }
  return result;
}

function asTrimmedString(value: unknown, max: number): string {
  if (typeof value === "string") return value.trim().slice(0, max);
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value).trim().slice(0, max);
  }
  return "";
}

export function htmlToPlainText(html: string): string {
  let text = stripTaggedBlocks(html, "script");
  text = stripTaggedBlocks(text, "style");
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
export async function fetchRecipePage(url: URL, fetchImpl?: typeof fetch): Promise<string> {
  let response: Response;
  try {
    response = await fetchPublicHttpResponse(url, fetchImpl, {
      headers: { Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8", "User-Agent": "CookAndEat/1.0 (+recipe-import)" },
      signal: AbortSignal.timeout(25_000),
    });
  } catch (error) {
    if (error instanceof PublicFetchError) throw new ImportRecipeError(error.status, error.message);
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

function readDraftItem(
  row: ModelRow,
  products: readonly CatalogProduct[],
  byName: ReadonlyMap<string, string>,
): { ingredient: RecipeDraft["ingredients"][number] | null; unmatched: UnmatchedItem | null } {
  const quantity = Number(row.quantity);
  if (quantity <= 0 || !Number.isFinite(quantity)) return { ingredient: null, unmatched: null };
  const raw = asTrimmedString(row.raw, 120);
  const optional = Boolean(row.optional);
  const unit = cleanUnit(row.unit);
  const qty = roundScanQty(quantity);
  const matched = productByListNumber(row.product_number, products);
  const name = asTrimmedString(row.name, 80);
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
    title: asTrimmedString(record.title, 120) || "Рецепт без назви",
    description: asTrimmedString(record.description, 2000),
    instructions: asTrimmedString(record.instructions, 8000),
    base_servings,
    cook_minutes,
    meal_types,
    ingredients,
    unmatched,
  };
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
  const call = input.fetchImpl;
  const pageText = await fetchRecipePage(input.url, call);
  const model = input.model || process.env.OPENROUTER_MODEL || "google/gemini-3.8-flash";
  const { parsed } = await openRouterJsonChat(
    {
      apiKey: input.apiKey,
      model,
      schemaName: "recipe_draft",
      schema: SCHEMA as unknown as Record<string, unknown>,
      system: buildRecipePrompt(input.products),
      user: `URL: ${input.url.toString()}\n\nТекст сторінки:\n${pageText}`,
      maxTokens: 6000,
      fetchImpl: call ?? fetch,
    },
    (status, message) => new ImportRecipeError(status, message),
  );
  return normalizeRecipeDraft(parsed, input.products);
}
