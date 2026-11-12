// Чисті розрахунки книги витрат. Сторінка їх лише показує — Огляд може імпортувати цей модуль напряму.
// Дати — рядки YYYY-MM-DD. Суми в гривнях, округлення до копійки.

import { addDays, weekStart } from "./dates.ts";

/**
 * Лінійний прогноз на місяць показуємо не раніше ніж з цього дня місяця (включно).
 * Сьогодні входить у рахунок: 3 листопада означає, що минуло 3 дні.
 * Перший і другий день дають надто різкий екстрапольований місяць, тому число ховаємо.
 * Приклад: 7 460 ₴ за 12 днів листопада (30 днів) → 18 650 ₴.
 */
export const FORECAST_MIN_ELAPSED_DAYS = 3;

export const OTHER_CATEGORY = "Інше";
export const UNNAMED_STORE = "Без магазину";

export const PERIOD_KINDS = ["week", "month", "year"] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

const PERIOD_SET = new Set<string>(PERIOD_KINDS);

export type DateRange = { start: string; end: string };

export type FinanceLine = {
  id: string;
  productId: string | null;
  productName: string | null;
  category: string | null;
  rawName: string;
  quantity: number | null;
  unit: string | null;
  price: number | null;
};

export type FinanceReceipt = {
  id: string;
  purchasedAt: string;
  storeName: string | null;
  total: number | null;
  inputSource: string;
  scanInputType: string | null;
  items: readonly FinanceLine[];
};

export type DatedAmount = {
  id: string;
  purchasedAt: string;
  amount: number;
  storeName: string | null;
};

export type DatedLine = FinanceLine & { purchasedAt: string };

export type Pace = { spentShare: number; elapsedShare: number };

export type ForecastStatus = "value" | "no-budget" | "no-receipts" | "too-early" | "outside";

export type ForecastState = { status: "value"; amount: number } | { status: Exclude<ForecastStatus, "value"> };

export type PeriodSummary = {
  spent: number;
  receiptCount: number;
  average: number | null;
  basis: number | null;
  remaining: number | null;
  perDay: number | null;
  pace: Pace | null;
  elapsed: number;
  span: number;
  forecast: ForecastState;
};

const MONTH_SHORT = ["Січ", "Лют", "Бер", "Кві", "Тра", "Чер", "Лип", "Сер", "Вер", "Жов", "Лис", "Гру"] as const;

const SOURCE_LABELS: ReadonlyArray<readonly [string, string]> = [
  ["manual", "вручну"],
  ["receipt", "фото чека"],
  ["voice", "голосове"],
  ["video", "відео"],
  ["screenshot", "скріншот"],
  ["text", "текст"],
  ["scan", "скан"],
];

const SOURCE_MAP = new Map(SOURCE_LABELS);

const moneyWhole = new Intl.NumberFormat("uk-UA", {
  style: "currency",
  currency: "UAH",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const moneyCents = new Intl.NumberFormat("uk-UA", {
  style: "currency",
  currency: "UAH",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const monthLong = new Intl.DateTimeFormat("uk-UA", { month: "long", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", timeZone: "UTC" });
const dayOnly = new Intl.DateTimeFormat("uk-UA", { day: "numeric", timeZone: "UTC" });

function roundMoney(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

function utc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function isPeriodKind(value: string): value is PeriodKind {
  return PERIOD_SET.has(value);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 2000 || year > 2100) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Гроші з поля форми: «1 284,50» або «1284.50». Від’ємні й зайві знаки після коми відхиляємо. */
export function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".").replace(/\.$/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return roundMoney(Number(cleaned));
}

export function coerceNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** null, порожнє і 0 означають, що місячний бюджет не задано: від нього не рахуємо темп. */
export function readBudget(value: unknown): number | null {
  const parsed = coerceNumber(value);
  if (parsed === null || parsed <= 0) return null;
  return roundMoney(parsed);
}

export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Завжди перше число цільового місяця. */
export function addMonths(iso: string, delta: number): string {
  const date = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1 + delta, 1));
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-01`;
}

export function monthEnd(iso: string): string {
  return addDays(addMonths(monthStart(iso), 1), -1);
}

export function daysInMonth(iso: string): number {
  return Number(monthEnd(iso).slice(8, 10));
}

export function yearStart(iso: string): string {
  return `${iso.slice(0, 4)}-01-01`;
}

export function yearEnd(iso: string): string {
  return `${iso.slice(0, 4)}-12-31`;
}

export function daysInYear(iso: string): number {
  const year = Number(iso.slice(0, 4));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return leap ? 366 : 365;
}

export function daysInclusive(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

export function inRange(iso: string, range: DateRange): boolean {
  return iso >= range.start && iso <= range.end;
}

export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/** Скільки днів діапазону вже минуло, включно з сьогодні, якщо сьогодні всередині. */
export function elapsedInRange(start: string, end: string, today: string): number {
  if (today < start) return 0;
  if (today > end) return daysInclusive(start, end);
  return daysInclusive(start, today);
}

export function parsePeriod(range: string | undefined, at: string | undefined, today: string): { kind: PeriodKind; anchor: string } {
  const kind: PeriodKind = range && isPeriodKind(range) ? range : "month";
  const day = at && isIsoDate(at) ? at : today;
  if (kind === "week") return { kind, anchor: weekStart(day) };
  if (kind === "year") return { kind, anchor: yearStart(day) };
  return { kind, anchor: monthStart(day) };
}

export function periodBounds(kind: PeriodKind, anchor: string): DateRange {
  if (kind === "week") {
    const start = weekStart(anchor);
    return { start, end: addDays(start, 6) };
  }
  if (kind === "year") return { start: yearStart(anchor), end: yearEnd(anchor) };
  return { start: monthStart(anchor), end: monthEnd(anchor) };
}

export function shiftAnchor(kind: PeriodKind, anchor: string, delta: number): string {
  if (kind === "week") return addDays(weekStart(anchor), delta * 7);
  if (kind === "year") return addMonths(yearStart(anchor), delta * 12);
  return addMonths(monthStart(anchor), delta);
}

export function financePath(kind: PeriodKind, anchor: string): string {
  return `/finance?range=${kind}&at=${anchor}`;
}

export function receiptPath(id: string, kind: PeriodKind, anchor: string): string {
  return `/finance/${id}?range=${kind}&at=${anchor}`;
}

export function defaultReceiptDate(period: DateRange, today: string): string {
  if (inRange(today, period)) return today;
  if (today > period.end) return period.end;
  return period.start;
}

export function recentMonthStarts(endMonth: string, count: number): string[] {
  const end = monthStart(endMonth);
  const starts: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) starts.push(addMonths(end, -i));
  return starts;
}

export function historyMonthStarts(kind: PeriodKind, anchor: string): string[] {
  if (kind === "year") return recentMonthStarts(`${anchor.slice(0, 4)}-12-01`, 12);
  return recentMonthStarts(monthStart(anchor), 6);
}

export function weekStartsOverlapping(range: DateRange): string[] {
  const starts: string[] = [];
  let cursor = weekStart(range.start);
  while (cursor <= range.end) {
    starts.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return starts;
}

export function chartWeekStarts(kind: PeriodKind, anchor: string, today: string): string[] {
  if (kind === "week") {
    const end = weekStart(anchor);
    return Array.from({ length: 5 }, (_, index) => addDays(end, (index - 4) * 7));
  }
  if (kind === "month") return weekStartsOverlapping(periodBounds("month", anchor));
  const year = periodBounds("year", anchor);
  const endDay = today < year.start ? year.start : today > year.end ? year.end : today;
  const last = weekStart(endDay);
  return Array.from({ length: 6 }, (_, index) => addDays(last, (index - 5) * 7)).filter((start) => {
    const end = addDays(start, 6);
    return end >= year.start && start <= year.end;
  });
}

/** Місяць, за який порівнюємо ціни: поточний, якщо він у періоді, інакше місяць краю періоду. */
export function priceMonth(period: DateRange, today: string): string {
  if (today < period.start) return monthStart(period.start);
  if (today > period.end) return monthStart(period.end);
  return monthStart(today);
}

/** Вікно вибірки: історія графіка, тижні, місяць цін і поточний місяць, якщо він перетинає період. */
export function loadWindow(kind: PeriodKind, anchor: string, today: string): DateRange {
  const period = periodBounds(kind, anchor);
  let start = period.start;
  let end = period.end;
  const widen = (range: DateRange) => {
    if (range.start < start) start = range.start;
    if (range.end > end) end = range.end;
  };
  for (const month of historyMonthStarts(kind, anchor)) widen({ start: month, end: monthEnd(month) });
  for (const week of chartWeekStarts(kind, anchor, today)) widen({ start: week, end: addDays(week, 6) });
  const prices = priceMonth(period, today);
  widen({ start: prices, end: monthEnd(prices) });
  const current = monthStart(today);
  if (rangesOverlap(period, { start: current, end: monthEnd(current) })) widen({ start: current, end: monthEnd(current) });
  return { start, end };
}

export function amountOf(receipt: { total: number | null; items: readonly { price: number | null }[] }): number {
  if (receipt.total !== null && Number.isFinite(receipt.total)) return roundMoney(receipt.total);
  let sum = 0;
  for (const item of receipt.items) {
    if (item.price !== null && Number.isFinite(item.price)) sum += item.price;
  }
  return roundMoney(sum);
}

export function toDatedAmounts(receipts: readonly FinanceReceipt[]): DatedAmount[] {
  return receipts.map((receipt) => ({
    id: receipt.id,
    purchasedAt: receipt.purchasedAt,
    amount: amountOf(receipt),
    storeName: receipt.storeName,
  }));
}

export function flattenLines(receipts: readonly FinanceReceipt[]): DatedLine[] {
  const lines: DatedLine[] = [];
  for (const receipt of receipts) {
    for (const item of receipt.items) lines.push({ ...item, purchasedAt: receipt.purchasedAt });
  }
  return lines;
}

export function sumBetween(rows: readonly { purchasedAt: string; amount: number }[], range: DateRange): number {
  let sum = 0;
  for (const row of rows) {
    if (inRange(row.purchasedAt, range)) sum += row.amount;
  }
  return roundMoney(sum);
}

export function countBetween(rows: readonly { purchasedAt: string }[], range: DateRange): number {
  let count = 0;
  for (const row of rows) {
    if (inRange(row.purchasedAt, range)) count += 1;
  }
  return count;
}

export function averageReceipt(rows: readonly { purchasedAt: string; amount: number }[], range: DateRange): number | null {
  const count = countBetween(rows, range);
  if (count === 0) return null;
  return roundMoney(sumBetween(rows, range) / count);
}

export function budgetRemaining(spent: number, budget: number | null): number | null {
  if (budget === null || !Number.isFinite(budget)) return null;
  return roundMoney(budget - spent);
}

/**
 * Частка витраченого бюджету проти частки минулого часу.
 * null, якщо бюджет не задано або витрат немає — відсотки тоді не показуємо.
 */
export function pace(spent: number, budget: number | null, elapsed: number, span: number): Pace | null {
  if (budget === null || !(budget > 0) || !(spent > 0) || !(span > 0)) return null;
  return {
    spentShare: spent / budget,
    elapsedShare: Math.min(1, Math.max(0, elapsed / span)),
  };
}

/** Лінійний прогноз. null до FORECAST_MIN_ELAPSED_DAYS і коли витрат немає. */
export function monthForecast(spent: number, elapsedDays: number, days: number): number | null {
  if (!(spent > 0) || elapsedDays < FORECAST_MIN_ELAPSED_DAYS || !(days > 0)) return null;
  return roundMoney((spent / elapsedDays) * days);
}

export function forecastState(rows: readonly { purchasedAt: string; amount: number }[], period: DateRange, today: string, budget: number | null): ForecastState {
  const current = monthStart(today);
  const month = { start: current, end: monthEnd(current) };
  if (!rangesOverlap(period, month)) return { status: "outside" };
  if (budget === null || !(budget > 0)) return { status: "no-budget" };
  const spent = sumBetween(rows, month);
  const elapsed = elapsedInRange(month.start, month.end, today);
  const amount = monthForecast(spent, elapsed, daysInMonth(current));
  if (amount === null) return spent > 0 ? { status: "too-early" } : { status: "no-receipts" };
  return { status: "value", amount };
}

/**
 * Підсумок вибраного періоду.
 * `rows` мають покривати і період, і весь поточний місяць, якщо він перетинається з періодом:
 * прогноз ділить витрати місяця на календарні дні, а не на витрати одного тижня.
 * Тижнева частка бюджету = місячний бюджет × 7 / днів місяця, у якому починається тиждень.
 * Річна база = місячний бюджет × 12.
 */
export function summarizePeriod(kind: PeriodKind, anchor: string, today: string, budget: number | null, rows: readonly DatedAmount[]): PeriodSummary {
  const period = periodBounds(kind, anchor);
  const spent = sumBetween(rows, period);
  const receiptCount = countBetween(rows, period);
  const average = receiptCount === 0 ? null : roundMoney(spent / receiptCount);
  const basis = basisFor(kind, anchor, budget);
  const remaining = budgetRemaining(spent, basis);
  const elapsed = elapsedInRange(period.start, period.end, today);
  const span = daysInclusive(period.start, period.end);
  const daysLeft = kind === "month" ? Math.max(0, span - elapsed) : 0;
  const perDay = kind === "month" && remaining !== null && remaining > 0 && daysLeft > 0 ? roundMoney(remaining / daysLeft) : null;
  return {
    spent,
    receiptCount,
    average,
    basis,
    remaining,
    perDay,
    pace: pace(spent, basis, elapsed, span),
    elapsed,
    span,
    forecast: forecastState(rows, period, today, budget),
  };
}

function basisFor(kind: PeriodKind, anchor: string, budget: number | null): number | null {
  if (budget === null) return null;
  if (kind === "week") return roundMoney((budget * 7) / daysInMonth(anchor));
  if (kind === "year") return roundMoney(budget * 12);
  return budget;
}

export function totalsByMonth(rows: readonly { purchasedAt: string; amount: number }[], monthStarts: readonly string[]): number[] {
  const totals = monthStarts.map(() => 0);
  for (const row of rows) {
    const index = monthStarts.indexOf(monthStart(row.purchasedAt));
    if (index >= 0) totals[index] += row.amount;
  }
  return totals.map(roundMoney);
}

export function totalsByWeek(rows: readonly { purchasedAt: string; amount: number }[], weekStarts: readonly string[]): number[] {
  const totals = weekStarts.map(() => 0);
  for (const row of rows) {
    const index = weekStarts.indexOf(weekStart(row.purchasedAt));
    if (index >= 0) totals[index] += row.amount;
  }
  return totals.map(roundMoney);
}

export function categoryLabel(category: string | null, hasProduct: boolean): string {
  if (!hasProduct) return OTHER_CATEGORY;
  const trimmed = (category ?? "").trim();
  if (!trimmed || trimmed.toLocaleLowerCase("uk-UA") === "інше") return OTHER_CATEGORY;
  return trimmed.charAt(0).toLocaleUpperCase("uk-UA") + trimmed.slice(1);
}

export function categoryTotals(lines: readonly DatedLine[], range: DateRange): { name: string; total: number }[] {
  const totals = new Map<string, number>();
  for (const line of lines) {
    if (!inRange(line.purchasedAt, range) || line.price === null || !(line.price > 0)) continue;
    const name = categoryLabel(line.category, line.productId !== null);
    totals.set(name, (totals.get(name) ?? 0) + line.price);
  }
  return [...totals.entries()]
    .map(([name, total]) => ({ name, total: roundMoney(total) }))
    .filter((row) => row.total !== 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "uk"));
}

export function storeLabel(name: string | null): string {
  const trimmed = (name ?? "").trim();
  return trimmed || UNNAMED_STORE;
}

export function storeTotals(rows: readonly { purchasedAt: string; amount: number; storeName: string | null }[], range: DateRange): { name: string; total: number; share: number }[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!inRange(row.purchasedAt, range) || row.amount === 0) continue;
    const name = storeLabel(row.storeName);
    totals.set(name, (totals.get(name) ?? 0) + row.amount);
  }
  const list = [...totals.entries()]
    .map(([name, total]) => ({ name, total: roundMoney(total) }))
    .filter((row) => row.total !== 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "uk"));
  const sum = list.reduce((acc, row) => acc + row.total, 0);
  return list.map((row) => ({ ...row, share: sum > 0 ? row.total / sum : 0 }));
}

export type PriceChange = { productId: string; name: string; change: number };

type PricePoint = { at: string; unit: string; price: number; index: number };

/** Зміна ціни за одиницю між першою і останньою покупкою. Лише продукти з двома покупками в одній одиниці. */
export function priceChanges(lines: readonly DatedLine[], range: DateRange): PriceChange[] {
  const groups = new Map<string, { name: string; points: PricePoint[] }>();
  lines.forEach((line, index) => {
    const point = pricePoint(line, range, index);
    if (!point || !line.productId) return;
    const name = (line.productName ?? "").trim() || line.rawName.trim() || "Продукт";
    const group = groups.get(line.productId) ?? { name, points: [] };
    group.points.push(point);
    groups.set(line.productId, group);
  });

  const changes: PriceChange[] = [];
  for (const [productId, group] of groups) {
    const change = changeOf(group.points);
    if (change === null) continue;
    changes.push({ productId, name: group.name, change });
  }
  return changes.sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || a.name.localeCompare(b.name, "uk"));
}

function pricePoint(line: DatedLine, range: DateRange, index: number): PricePoint | null {
  if (!line.productId || !inRange(line.purchasedAt, range)) return null;
  if (line.price === null || line.quantity === null || !(line.quantity > 0) || !(line.price >= 0)) return null;
  const unitPrice = line.price / line.quantity;
  if (!Number.isFinite(unitPrice) || !(unitPrice > 0)) return null;
  return { at: line.purchasedAt, unit: line.unit ?? "", price: unitPrice, index };
}

function changeOf(points: readonly PricePoint[]): number | null {
  const ordered = points.slice().sort((a, b) => a.at.localeCompare(b.at) || a.index - b.index);
  const sameUnit = ordered.filter((point) => point.unit === ordered[0]?.unit);
  if (sameUnit.length < 2) return null;
  const first = sameUnit[0];
  const last = sameUnit[sameUnit.length - 1];
  if (!(first.price > 0)) return null;
  const change = (last.price - first.price) / first.price;
  if (Math.round(change * 100) === 0) return null;
  return change;
}

export function chartScale(values: readonly number[], budget: number | null): number {
  return Math.max(0, ...values, budget ?? 0);
}

export function barPercent(value: number, scale: number): number {
  if (!(value > 0) || !(scale > 0)) return 0;
  return Math.min(100, (value / scale) * 100);
}

export function formatUah(value: number): string {
  const rounded = roundMoney(value);
  const abs = Math.abs(rounded);
  const cents = Math.round(abs * 100) % 100;
  const text = (cents === 0 ? moneyWhole : moneyCents).format(abs);
  return rounded < 0 ? `−${text}` : text;
}

export function formatShare(ratio: number): string {
  return `${Math.round(ratio * 100).toLocaleString("uk-UA")}%`;
}

export function ukCount(count: number, forms: readonly [string, string, string]): string {
  const abs = Math.abs(Math.trunc(count));
  const n10 = abs % 10;
  const n100 = abs % 100;
  let word: string = forms[2];
  if (n10 === 1 && n100 !== 11) word = forms[0];
  else if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) word = forms[1];
  return `${count.toLocaleString("uk-UA")} ${word}`;
}

export function sourceLabel(inputSource: string, scanInputType: string | null): string {
  if (scanInputType && SOURCE_MAP.has(scanInputType)) return SOURCE_MAP.get(scanInputType) ?? "скан";
  return SOURCE_MAP.get(inputSource) ?? "інше джерело";
}

export function receiptNote(itemCount: number, source: string): string {
  return `${ukCount(itemCount, ["позиція", "позиції", "позицій"])} · ${source}`;
}

export function shortDate(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

export function shortMonth(iso: string): string {
  return MONTH_SHORT[Number(iso.slice(5, 7)) - 1] ?? "";
}

export function capitalizeUk(value: string): string {
  if (!value) return value;
  return value.charAt(0).toLocaleUpperCase("uk-UA") + value.slice(1);
}

export function monthTitle(iso: string): string {
  const name = capitalizeUk(monthLong.format(utc(monthStart(iso))));
  return `${name} ${iso.slice(0, 4)}`;
}

export function weekTitle(start: string): string {
  const monday = weekStart(start);
  const end = addDays(monday, 6);
  if (monday.slice(0, 7) === end.slice(0, 7)) {
    return `${dayOnly.format(utc(monday))}–${dayMonth.format(utc(end))} ${end.slice(0, 4)}`;
  }
  if (monday.slice(0, 4) === end.slice(0, 4)) {
    return `${dayMonth.format(utc(monday))} – ${dayMonth.format(utc(end))} ${end.slice(0, 4)}`;
  }
  return `${dayMonth.format(utc(monday))} ${monday.slice(0, 4)} – ${dayMonth.format(utc(end))} ${end.slice(0, 4)}`;
}

export function weekTick(start: string): string {
  const end = addDays(start, 6);
  const startDay = Number(start.slice(8, 10));
  const endDay = Number(end.slice(8, 10));
  const startMonth = start.slice(5, 7);
  const endMonth = end.slice(5, 7);
  if (startMonth === endMonth) return `${startDay}–${endDay}.${endMonth}`;
  return `${startDay}.${startMonth}–${endDay}.${endMonth}`;
}

export function periodTitle(kind: PeriodKind, anchor: string): string {
  if (kind === "year") return anchor.slice(0, 4);
  if (kind === "week") return weekTitle(anchor);
  return monthTitle(anchor);
}

export function formatQuantity(quantity: number | null, unit: string | null): string {
  if (quantity === null) return "—";
  const text = quantity.toLocaleString("uk-UA", { maximumFractionDigits: 2 });
  return unit ? `${text} ${unit}` : text;
}
