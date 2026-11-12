// Тексти екрана «Фінанси». Числа рахує src/lib/finance.ts.

import { addDays } from "@/lib/dates";
import {
  amountOf,
  barPercent,
  chartScale,
  chartWeekStarts,
  categoryTotals,
  defaultReceiptDate,
  financePath,
  flattenLines,
  formatShare,
  formatUah,
  historyMonthStarts,
  monthEnd,
  monthStart,
  monthTitle,
  periodBounds,
  periodTitle,
  priceChanges,
  priceMonth,
  receiptNote,
  receiptPath,
  shiftAnchor,
  shortDate,
  shortMonth,
  sourceLabel,
  storeLabel,
  storeTotals,
  summarizePeriod,
  toDatedAmounts,
  totalsByMonth,
  totalsByWeek,
  ukCount,
  weekTick,
  type DatedAmount,
  type DatedLine,
  type FinanceReceipt,
  type ForecastState,
  type PeriodKind,
  type PeriodSummary,
} from "@/lib/finance";

export type FinanceBar = {
  key: string;
  label: string;
  amount: string;
  percent: number;
  current: boolean;
};

export type FinanceMeter = { name: string; amount: string; percent: number };

export type FinanceSegment = {
  name: string;
  amount: string;
  share: string;
  percent: number;
  index: number;
};

export type FinanceReceiptRow = {
  id: string;
  href: string;
  date: string;
  store: string;
  note: string;
  amount: string;
};

export type FinancePrice = { id: string; name: string; text: string; up: boolean };

export type FinanceModel = {
  kind: PeriodKind;
  anchor: string;
  title: string;
  eyebrow: string;
  prevHref: string;
  nextHref: string;
  prevLabel: string;
  nextLabel: string;
  periods: { kind: PeriodKind; label: string; href: string; active: boolean }[];
  emptyHousehold: boolean;
  spentCaption: string;
  spentLabel: string;
  paceCaption: string | null;
  paceBar: number | null;
  paceEmpty: string;
  mobileBudget: string | null;
  mobileLeft: string | null;
  mobilePerDay: string | null;
  remaining: { amount: string; hint: string } | null;
  remainingEmpty: string | null;
  forecast: { amount: string; hint: string; tone: "over" | "under" | "even" } | null;
  forecastEmpty: string | null;
  average: { amount: string; hint: string } | null;
  averageEmpty: string | null;
  months: FinanceBar[];
  monthCaption: string;
  monthBudgetPercent: number | null;
  weeks: FinanceBar[];
  weekNote: string | null;
  categories: FinanceMeter[];
  categoryEmpty: string;
  stores: FinanceSegment[];
  storeEmpty: string;
  receipts: FinanceReceiptRow[];
  listEmpty: string;
  prices: FinancePrice[];
  priceMore: number;
  priceTitle: string;
  priceEmpty: string;
  defaultDate: string;
};

const PERIOD_LINKS: ReadonlyArray<readonly [PeriodKind, string]> = [
  ["week", "Тиждень"],
  ["month", "Місяць"],
  ["year", "Рік"],
];

const SHIFT_LABELS: ReadonlyArray<readonly [PeriodKind, string, string]> = [
  ["week", "Попередній тиждень", "Наступний тиждень"],
  ["month", "Попередній місяць", "Наступний місяць"],
  ["year", "Попередній рік", "Наступний рік"],
];

const FORECAST_EMPTY: Record<Exclude<ForecastState["status"], "value">, string> = {
  "no-budget": "Без місячного бюджету прогноз не показуємо",
  "no-receipts": "Немає витрат цього місяця — прогноз не рахуємо",
  "too-early": "Прогноз з’явиться з 3-го дня місяця",
  outside: "Прогноз показуємо лише для поточного місяця",
};

const PACE_TAIL: Record<PeriodKind, string> = {
  week: "тижневої частки · минуло",
  month: "бюджету · минуло",
  year: "річного бюджету · минуло",
};

const PACE_SPAN: Record<PeriodKind, string> = {
  week: "тижня",
  month: "місяця",
  year: "року",
};

const COUNT_WHERE: Record<PeriodKind, string> = {
  week: "за тиждень",
  month: "за місяць",
  year: "за рік",
};

export function buildFinanceModel(input: {
  kind: PeriodKind;
  anchor: string;
  today: string;
  budget: number | null;
  receipts: readonly FinanceReceipt[];
  householdCount: number;
}): FinanceModel {
  const { kind, anchor, today, budget, receipts } = input;
  const rows = toDatedAmounts(receipts);
  const lines = flattenLines(receipts);
  const summary = summarizePeriod(kind, anchor, today, budget, rows);
  const period = periodBounds(kind, anchor);
  const months = monthBars(kind, anchor, today, budget, rows);
  const priceStart = priceMonth(period, today);
  const changes = priceChanges(lines, { start: priceStart, end: monthEnd(priceStart) });
  const shift = SHIFT_LABELS.find(([value]) => value === kind) ?? SHIFT_LABELS[1];
  const categories = categoryMeters(lines, period);

  return {
    kind,
    anchor,
    title: periodTitle(kind, anchor),
    eyebrow: eyebrow(kind, anchor),
    prevHref: financePath(kind, shiftAnchor(kind, anchor, -1)),
    nextHref: financePath(kind, shiftAnchor(kind, anchor, 1)),
    prevLabel: shift[1],
    nextLabel: shift[2],
    periods: PERIOD_LINKS.map(([value, label]) => ({
      kind: value,
      label,
      href: financePath(value, anchor),
      active: value === kind,
    })),
    emptyHousehold: input.householdCount === 0,
    spentCaption: spentCaption(kind, summary, today, anchor),
    spentLabel: formatUah(summary.spent),
    paceCaption: paceCaption(kind, summary),
    paceBar: summary.pace ? Math.min(100, summary.pace.spentShare * 100) : null,
    paceEmpty: paceEmpty(summary, budget),
    mobileBudget: summary.basis === null ? null : `з ${formatUah(summary.basis)}`,
    mobileLeft: summary.remaining === null ? null : `Залишок ${formatUah(summary.remaining)}`,
    mobilePerDay: summary.perDay === null ? null : `${formatUah(summary.perDay)} на день`,
    remaining: remainingTile(kind, summary),
    remainingEmpty: summary.basis === null ? "Місячний бюджет сім’ї ще не задано" : null,
    forecast: forecastTile(summary.forecast, budget),
    forecastEmpty: summary.forecast.status === "value" ? null : FORECAST_EMPTY[summary.forecast.status],
    average: averageTile(kind, summary),
    averageEmpty: summary.average === null ? "Немає чеків за цей період" : null,
    months: months.bars,
    monthCaption: months.caption,
    monthBudgetPercent: months.budgetPercent,
    weeks: weekBars(kind, anchor, today, rows),
    weekNote: summary.forecast.status === "value" ? `прогноз ≈ ${formatUah(summary.forecast.amount)}` : null,
    categories,
    categoryEmpty: categoryEmpty(summary.receiptCount, categories.length),
    stores: storeSegments(rows, period),
    storeEmpty: summary.receiptCount === 0 ? "За цей період чеків немає" : "Немає сум по магазинах",
    receipts: receiptRows(receipts, period, kind, anchor),
    listEmpty: "За цей період чеків немає",
    prices: changes.slice(0, 8).map(priceRow),
    priceMore: Math.max(0, changes.length - 8),
    priceTitle: `Ціни за ${monthTitle(priceStart).replace(/ \d{4}$/, "").toLocaleLowerCase("uk-UA")}`,
    priceEmpty: "Немає продуктів із двома покупками за цей місяць",
    defaultDate: defaultReceiptDate(period, today),
  };
}

function eyebrow(kind: PeriodKind, anchor: string): string {
  if (kind === "year") return `Фінанси · ${anchor.slice(0, 4)}`;
  if (kind === "week") return "Фінанси · тиждень";
  return `Фінанси · ${monthTitle(anchor).replace(/ \d{4}$/, "").toLocaleLowerCase("uk-UA")}`;
}

function spentCaption(kind: PeriodKind, summary: PeriodSummary, today: string, anchor: string): string {
  if (kind === "week") return "Витрачено за тиждень";
  if (kind === "year") return "Витрачено за рік";
  const period = periodBounds("month", anchor);
  if (today < period.start || today > period.end) return "Витрачено за місяць";
  return `Витрачено за ${ukCount(summary.elapsed, ["день", "дні", "днів"])}`;
}

function paceEmpty(summary: PeriodSummary, budget: number | null): string {
  if (budget === null) return "Без місячного бюджету частку не рахуємо";
  if (!(summary.spent > 0)) return "Відсоток не показуємо — витрат за період немає";
  return "Відсоток бюджету не показуємо";
}

function paceCaption(kind: PeriodKind, summary: PeriodSummary): string | null {
  if (!summary.pace) return null;
  return `${formatShare(summary.pace.spentShare)} ${PACE_TAIL[kind]} ${formatShare(summary.pace.elapsedShare)} ${PACE_SPAN[kind]}`;
}

function remainingTile(kind: PeriodKind, summary: PeriodSummary): { amount: string; hint: string } | null {
  if (summary.remaining === null || summary.basis === null) return null;
  return { amount: formatUah(summary.remaining), hint: remainingHint(kind, summary) };
}

function remainingHint(kind: PeriodKind, summary: PeriodSummary): string {
  const basis = formatUah(summary.basis ?? 0);
  if (summary.remaining !== null && summary.remaining < 0) {
    return `на ${formatUah(Math.abs(summary.remaining))} більше за бюджет`;
  }
  if (kind === "week") return `з ${basis} на цей тиждень`;
  if (kind === "year") return `з ${basis} на рік`;
  if (summary.perDay !== null) return `з ${basis} · ${formatUah(summary.perDay)} на день до кінця місяця`;
  if (summary.remaining === 0) return `з ${basis} · бюджет вичерпано`;
  return `з ${basis}`;
}

function forecastTile(state: ForecastState, budget: number | null): FinanceModel["forecast"] {
  if (state.status !== "value" || budget === null) return null;
  const delta = Math.round((state.amount - budget) * 100) / 100;
  if (Math.abs(delta) < 0.5) return { amount: formatUah(state.amount), hint: "у межах бюджету", tone: "even" };
  if (delta > 0) return { amount: formatUah(state.amount), hint: `на ${formatUah(delta)} більше за бюджет`, tone: "over" };
  return { amount: formatUah(state.amount), hint: `на ${formatUah(Math.abs(delta))} менше за бюджет`, tone: "under" };
}

function averageTile(kind: PeriodKind, summary: PeriodSummary): { amount: string; hint: string } | null {
  if (summary.average === null) return null;
  return {
    amount: formatUah(summary.average),
    hint: `${ukCount(summary.receiptCount, ["чек", "чеки", "чеків"])} ${COUNT_WHERE[kind]}`,
  };
}

function monthBars(kind: PeriodKind, anchor: string, today: string, budget: number | null, rows: readonly DatedAmount[]) {
  const starts = historyMonthStarts(kind, anchor);
  const totals = totalsByMonth(rows, starts);
  const scale = chartScale(totals, budget);
  const currentKey = monthStart(today);
  const bars: FinanceBar[] = starts.map((start, index) => {
    const current = start === currentKey && today >= start && today <= monthEnd(start);
    return {
      key: start,
      label: current ? `${shortMonth(start)} · триває` : shortMonth(start),
      amount: formatUah(totals[index] ?? 0),
      percent: barPercent(totals[index] ?? 0, scale),
      current,
    };
  });
  const hasSpend = totals.some((value) => value > 0);
  return {
    bars: hasSpend || budget !== null ? bars : [],
    caption: budget !== null ? `Пунктир — бюджет ${formatUah(budget)}` : "Лінії бюджету немає — місячний бюджет не задано",
    budgetPercent: budget !== null && scale > 0 ? barPercent(budget, scale) : null,
  };
}

function weekBars(kind: PeriodKind, anchor: string, today: string, rows: readonly DatedAmount[]): FinanceBar[] {
  const starts = chartWeekStarts(kind, anchor, today);
  const totals = totalsByWeek(rows, starts);
  if (!totals.some((value) => value > 0)) return [];
  const scale = chartScale(totals, null);
  return starts.map((start, index) => ({
    key: start,
    label: weekTick(start),
    amount: formatUah(totals[index] ?? 0),
    percent: barPercent(totals[index] ?? 0, scale),
    current: today >= start && today <= addDays(start, 6),
  }));
}

function categoryMeters(lines: readonly DatedLine[], period: ReturnType<typeof periodBounds>): FinanceMeter[] {
  const rows = categoryTotals(lines, period);
  const max = rows.reduce((peak, row) => Math.max(peak, row.total), 0);
  return rows.map((row) => ({
    name: row.name,
    amount: formatUah(row.total),
    percent: barPercent(row.total, max),
  }));
}

function storeSegments(rows: readonly DatedAmount[], period: ReturnType<typeof periodBounds>): FinanceSegment[] {
  return storeTotals(rows, period).map((row, index) => ({
    name: row.name,
    amount: formatUah(row.total),
    share: formatShare(row.share),
    percent: row.share * 100,
    index,
  }));
}

function receiptRows(
  receipts: readonly FinanceReceipt[],
  period: ReturnType<typeof periodBounds>,
  kind: PeriodKind,
  anchor: string,
): FinanceReceiptRow[] {
  return receipts
    .filter((receipt) => receipt.purchasedAt >= period.start && receipt.purchasedAt <= period.end)
    .slice()
    .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt) || b.id.localeCompare(a.id))
    .map((receipt) => ({
      id: receipt.id,
      href: receiptPath(receipt.id, kind, anchor),
      date: shortDate(receipt.purchasedAt),
      store: storeLabel(receipt.storeName),
      note: receiptNote(receipt.items.length, sourceLabel(receipt.inputSource, receipt.scanInputType)),
      amount: formatUah(amountOf(receipt)),
    }));
}

function priceRow(change: { productId: string; name: string; change: number }): FinancePrice {
  const percent = Math.abs(Math.round(change.change * 100)).toLocaleString("uk-UA");
  const up = change.change > 0;
  return { id: change.productId, name: change.name, text: up ? `дорожче на ${percent}%` : `дешевше на ${percent}%`, up };
}

function categoryEmpty(receiptCount: number, categoryCount: number): string {
  if (categoryCount > 0) return "";
  if (receiptCount === 0) return "За цей період чеків немає";
  return "У чеках цього періоду немає цін за позиціями";
}
