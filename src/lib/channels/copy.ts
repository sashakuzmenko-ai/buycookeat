// Тексти бота за сценарієм MTelegram. Чисті функції, без Telegram API.

import type { ScanInputType } from "../db-types.ts";
import { pluralizePositions } from "../pantry.ts";
import type { ScanItem, ScanMode } from "../scan-types.ts";
import { formatItemQty, formatUah } from "../scan/present.ts";
import type { OutboundButton } from "./types.ts";

export const QUICK_HINTS = ["Що на вечерю?", "Список покупок", "Залишки"] as const;

export const LINK_HELP =
  "Цей чат ще не прив'язаний. У застосунку відкрийте Сім'я, згенеруйте код і надішліть його сюди командою /start код.";

export const NOT_MEMBER_HELP =
  "Прив'язку зупинено: цей акаунт більше не в сім'ї. Згенеруйте новий код у розділі Сім'я.";

export const LINKED_HELLO =
  "Чат прив'язано до сім'ї. Надішліть фото чека, голосове, відео полиці, скріншот замовлення або текст.";

export const TOO_BIG = "Файл завеликий для сервера (ліміт близько 4 МБ). Надішліть фото або коротше відео.";

export const USAGE = "Надішліть фото чека, голосове, відео полиці, скріншот замовлення або текст.";

const MONTHS = [
  "січня",
  "лютого",
  "березня",
  "квітня",
  "травня",
  "червня",
  "липня",
  "серпня",
  "вересня",
  "жовтня",
  "листопада",
  "грудня",
];

function kyivPart(date: Date, type: "day" | "month"): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Kyiv", day: "2-digit", month: "2-digit" }).formatToParts(date);
  return parts.find((part) => part.type === type)?.value ?? "";
}

export function kyivDayMonth(date: Date): string {
  return `${kyivPart(date, "day")}.${kyivPart(date, "month")}`;
}

export function kyivMonthGenitive(date: Date): string {
  const index = Number(kyivPart(date, "month")) - 1;
  return MONTHS[index] ?? "";
}

export function quickAsk(text: string): "dinner" | "shopping" | "stock" | null {
  const norm = text
    .trim()
    .toLowerCase()
    .replace(/[!?.,]+/g, "")
    .replace(/\s+/g, " ");
  if (norm === "що на вечерю" || norm === "вечеря") return "dinner";
  if (norm === "список покупок" || norm === "покупки") return "shopping";
  if (norm === "залишки" || norm === "що закінчується") return "stock";
  return null;
}

export function clipMessage(text: string): string {
  if (text.length <= 4000) return text;
  return `${text.slice(0, 3990)}…`;
}

export function scanFixUrl(origin: string, scanId: string): string | null {
  if (!origin.startsWith("https://")) return null;
  return `${origin.replace(/\/$/, "")}/scan?id=${encodeURIComponent(scanId)}`;
}

const PRESS = /^(ok|shop|got|fix):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function parsePressData(data: string): { action: "ok" | "shop" | "got" | "fix"; scanId: string } | null {
  const match = PRESS.exec(data.trim());
  if (!match) return null;
  const action = match[1].toLowerCase();
  if (action !== "ok" && action !== "shop" && action !== "got" && action !== "fix") return null;
  return { action, scanId: match[2] };
}

export function scanButtons(scanId: string, fixUrl: string | null): OutboundButton[][] {
  const fix: OutboundButton = fixUrl ? { label: "Виправити", url: fixUrl } : { label: "Виправити", data: `fix:${scanId}` };
  return [
    [
      { label: "Записати", data: `ok:${scanId}` },
      fix,
    ],
    [
      { label: "У покупки", data: `shop:${scanId}` },
      { label: "Уже купили", data: `got:${scanId}` },
    ],
  ];
}

function lead(type: ScanInputType, count: number): string {
  const positions = pluralizePositions(count);
  if (type === "voice") return `Почув ${positions}. Куди записати?`;
  if (type === "text") return `Прочитала ${positions}. Куди записати?`;
  if (type === "video") return `Побачила ${positions} на полиці.`;
  return `${positions} розпізнано.`;
}

function effectLine(mode: ScanMode, count: number, total: number | null, when: Date, prefix: string): string {
  const positions = pluralizePositions(count);
  if (mode === "set") return `${prefix}: оновити ${positions} на складі.`;
  if (total !== null && total > 0) {
    return `${prefix}: +${positions} на склад, ${formatUah(total)} у витрати ${kyivMonthGenitive(when)}.`;
  }
  return `${prefix}: +${positions} на склад.`;
}

export function previewEffect(mode: ScanMode, count: number, total: number | null, when: Date): string {
  return effectLine(mode, count, total, when, "Після запису");
}

export function wroteSummary(mode: ScanMode, count: number, total: number | null, when: Date): string {
  return effectLine(mode, count, total, when, "Записала");
}

export function recognitionText(input: {
  inputType: ScanInputType;
  items: readonly ScanItem[];
  store: string;
  total: number;
  mode: ScanMode;
  now: Date;
}): string {
  const lines: string[] = [];
  if (input.store.trim()) lines.push(`${input.store.trim()} · ${kyivDayMonth(input.now)}`);
  if (input.total > 0) lines.push(formatUah(input.total));
  lines.push(lead(input.inputType, input.items.length));
  const sure = input.items.filter((item) => !item.uncertain).slice(0, 12);
  if (sure.length) lines.push(sure.map((item) => `${item.name} · ${formatItemQty(item.quantity, item.unit)}`).join("\n"));
  const unsure = input.items.filter((item) => item.uncertain);
  if (unsure.length) {
    lines.push(`${pluralizePositions(unsure.length)} під питанням:`);
    lines.push(
      unsure
        .slice(0, 8)
        .map((item) => {
          const guess = `${item.name}, ${formatItemQty(item.quantity, item.unit)}?`;
          return item.raw.trim() ? `${item.raw.trim()} → ${guess}` : guess;
        })
        .join("\n"),
    );
  }
  const hidden = input.items.length - sure.length - Math.min(unsure.length, 8);
  if (hidden > 0) lines.push(`і ще ${pluralizePositions(hidden)}`);
  lines.push(previewEffect(input.mode, input.items.length, input.total > 0 ? input.total : null, input.now));
  return clipMessage(lines.join("\n"));
}

export function dinnerText(titles: readonly string[]): string {
  if (titles.length === 0) return "На сьогодні вечері в меню немає.";
  return clipMessage(`Сьогодні на вечерю:\n${titles.slice(0, 12).map((title) => `• ${title}`).join("\n")}`);
}

export function shoppingText(items: readonly { name: string; checked: boolean }[]): string {
  if (items.length === 0) return "Список покупок на цей тиждень порожній.";
  const open = items.filter((item) => !item.checked);
  const shown = (open.length ? open : items).slice(0, 30);
  const head = open.length ? `Список покупок (${open.length}):` : "Усе зі списку вже позначено:";
  const lines = shown.map((item) => `• ${item.name}${item.checked ? " — куплено" : ""}`);
  return clipMessage([head, ...lines].join("\n"));
}

export function stockText(items: readonly { name: string; detail: string }[]): string {
  if (items.length === 0) return "Немає позицій, що закінчуються.";
  const lines = items.slice(0, 30).map((item) => `• ${item.name} — ${item.detail}`);
  return clipMessage(["Закінчуються:", ...lines].join("\n"));
}

export function accessHelp(reason: "unbound" | "not_member" | "other_household"): string {
  if (reason === "not_member") return NOT_MEMBER_HELP;
  return LINK_HELP;
}
