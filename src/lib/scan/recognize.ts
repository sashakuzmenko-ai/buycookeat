// Розпізнавання продуктів через OpenRouter.
// Не знає про HTTP-запит, чергу й канал: на вході медіа або текст і довідник сім'ї.

import { productByListNumber } from "../catalog/product-number.ts";
import { openRouterJsonChat } from "../openrouter/json-chat.ts";
import { PRODUCT_CATEGORIES } from "../seed-data.ts";
import { SCAN_LIMITS, type ScanItem, type ScanMode, type ScanResult, type ScanSource } from "../scan-types.ts";
import { cleanCategory, cleanUnit, normalizePackageFields, parseExpiryDate, roundScanQty } from "./products.ts";

export type CatalogProduct = { id: string; name: string; unit: string };

export type RecognizeInput = {
  mode: ScanMode;
  images: string[];
  audioBase64: string | null;
  audioFormat?: "wav" | "mp3" | "ogg" | "aac" | "flac";
  videos?: readonly string[];
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
        required: [
          "raw",
          "product_number",
          "name",
          "category",
          "unit",
          "quantity",
          "uncertain",
          "price",
          "label",
          "brand",
          "package_amount",
          "package_unit",
          "expires_at",
        ],
        properties: {
          raw: { type: "string", description: "Як позицію названо на чеку, у замовленні або в тексті" },
          product_number: { type: "integer", description: "Номер продукту зі списку або 0, якщо такого немає" },
          name: { type: "string", description: "Коротка назва виду продукту українською для довідника" },
          category: { type: "string", enum: [...PRODUCT_CATEGORIES] },
          unit: { type: "string", enum: [...UNITS] },
          quantity: { type: "number" },
          uncertain: { type: "boolean" },
          price: { type: "number", description: "Ціна позиції в гривнях або 0, якщо її не видно" },
          label: {
            type: "string",
            description: "Повна назва товару з етикетки або чека, як є, до 120 символів; інакше порожній рядок",
          },
          brand: { type: "string", description: "Виробник або бренд з етикетки; інакше порожній рядок" },
          package_amount: { type: "number", description: "Вага або обсяг однієї упаковки; 0, якщо не видно" },
          package_unit: {
            type: "string",
            enum: ["г", "мл", ""],
            description: "Одиниця фасування упаковки: г, мл або порожній рядок",
          },
          expires_at: {
            type: "string",
            description: "Дата «вжити до» у форматі YYYY-MM-DD або порожній рядок",
          },
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
4. Зістав позицію з продуктом зі списку лише якщо це той самий ВИД виробу. Бренд, жирність, сорт і фасування не важать для збігу («Молоко Яготинське 2,6% 900г» → продукт «Молоко»). Але різні види не зливай: солодка й несолодка булочка, різні види хліба чи випічки — різні продукти, бо терміни придатності й списання різні. Якщо в списку є продукт того самого виду — вкажи product_number і unit із списку. Якщо немає — product_number = 0, у name коротка назва з видом («Булочка солодка», «Булочка здобна несолодка»), не загальна («Хліб», «Випічка»), обери category та unit.
5. label — перепиши назву з етикетки або чека як є (з брендом і видом), до 120 символів; якщо не видно — порожній рядок. brand — виробник лише якщо видно. package_amount і package_unit — вага або обсяг однієї упаковки з етикетки (200 г, 0,9 л → 900 мл); не вигадуй, інакше 0 і порожній package_unit. expires_at — дата «вжити до» YYYY-MM-DD; якщо є дата виготовлення і строк придатності — порахуй «вжити до» сам; якщо дати не видно — порожній рядок. Нічого не вигадуй: невидиме лишай порожнім.
6. Об'єднуй в одну позицію із сумарною кількістю лише рядки того самого продукту з однаковою назвою з етикетки (label) і однаковим терміном (expires_at). Різні продукти ніколи не об'єднуй, навіть коли label і expires_at порожні. Різні назви або різні терміни — окремі позиції, навіть якщо вид виробу той самий. Повторювані кадри одного відео не дублюй.
7. quantity — завжди в одиниці продукту: г, мл або шт. Перераховуй: 1,5 кг → 1500; 0,9 л → 900; «дві пачки по 400 г» → 800; десяток яєць → 10.
8. Якщо кількість не видно або її не назвали — оціни за звичайним фасуванням і постав uncertain = true. Так само познач нечітко прочитане або почуте.
9. price — ціна однієї позиції в гривнях, якщо її видно на чеку чи в замовленні; інакше 0. Не вигадуй ціну.
10. store і total заповнюй лише з чека або замовлення; інакше порожній рядок і 0.

Список продуктів сім'ї (номер | назва | одиниця):
${list || "(порожній)"}`;
}

type ModelRow = Record<string, unknown>;

function readItem(row: ModelRow, products: readonly CatalogProduct[]): ScanItem | null {
  const quantity = Number(row.quantity);
  if (!(quantity > 0) || !Number.isFinite(quantity)) return null;
  const matched = productByListNumber(row.product_number, products);
  const name = String(row.name ?? "").trim().slice(0, 80);
  if (!matched && !name) return null;
  const price = Number(row.price);
  const { packageAmount, packageUnit } = normalizePackageFields(row.package_amount, row.package_unit);
  return {
    raw: String(row.raw ?? "").trim().slice(0, 120),
    productId: matched ? matched.id : null,
    name: matched ? matched.name : name,
    category: cleanCategory(row.category),
    unit: matched ? cleanUnit(matched.unit) : cleanUnit(row.unit),
    quantity: roundScanQty(quantity),
    uncertain: Boolean(row.uncertain),
    price: Number.isFinite(price) && price > 0 ? roundScanQty(price) : null,
    label: String(row.label ?? "").trim().slice(0, 120),
    brand: String(row.brand ?? "").trim().slice(0, 80),
    packageAmount,
    packageUnit,
    expiresAt: parseExpiryDate(row.expires_at),
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
  const videoNote = input.videos?.length ? `, ${input.videos.length} відео` : "";
  const materials = `${input.images.length} зображень${input.audioBase64 ? ", аудіозапис" : ", аудіо немає"}${videoNote}`;
  const lines = [`Матеріали: ${materials}.`];
  if (input.text.trim()) lines.push(`Текст повідомлення: ${input.text.trim()}`);
  if (input.note.trim()) lines.push(`Примітка користувача: ${input.note.trim()}`);
  lines.push("Розпізнай продукти за правилами.");
  return lines.join("\n");
}

export async function recognize(input: RecognizeInput): Promise<ScanResult> {
  if (!input.apiKey) throw new RecognizeError(503, "Не задано OPENROUTER_API_KEY — розпізнавання недоступне");
  const images = input.images.slice(0, SCAN_LIMITS.maxImages);
  const videos = (input.videos ?? []).slice(0, 1);
  const text = input.text.trim();
  const note = input.note.trim();
  if (images.length === 0 && videos.length === 0 && !input.audioBase64 && !text && !note) {
    throw new RecognizeError(400, "Додайте фото, відео, голос або текст");
  }

  const model = input.model || process.env.OPENROUTER_MODEL || "google/gemini-3.8-flash";
  const content: unknown[] = [];
  if (input.audioBase64) {
    content.push({ type: "input_audio", input_audio: { data: input.audioBase64, format: input.audioFormat ?? "wav" } });
  }
  for (const url of videos) content.push({ type: "video_url", video_url: { url } });
  for (const url of images) content.push({ type: "image_url", image_url: { url } });
  content.push({ type: "text", text: userText({ ...input, images, text, note }) });

  const { parsed, costUsd } = await openRouterJsonChat(
    {
      apiKey: input.apiKey,
      model,
      schemaName: "scan_result",
      schema: SCHEMA as unknown as Record<string, unknown>,
      system: buildScanPrompt(input.mode, input.products),
      user: content,
      maxTokens: 8000,
      fetchImpl: input.fetchImpl,
      trimmedJsonMessage: "Відповідь обрізано — забагато позицій, спробуйте частинами",
    },
    (status, message) => {
      if (status === 504 && message === "Модель відповідає надто довго") {
        return new RecognizeError(status, "Модель відповідає надто довго — спробуйте менше фото");
      }
      return new RecognizeError(status, message);
    },
  );
  return normalizeScanResult(parsed, input.products, { model, costUsd });
}
