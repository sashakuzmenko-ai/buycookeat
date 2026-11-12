import { useId, type ReactNode } from "react";
import Link from "next/link";
import { Button, Card, StatusChip } from "@/components/ui";
import { addDays, formatDate, formatWeekday } from "@/lib/dates";
import {
  MENU_SLOTS,
  dayMarkFromSlots,
  positionCountLabel,
  type DayMark,
  type DishStatus,
  type MenuSlot,
  type MenuSummary,
} from "@/lib/menu";
import { MEAL_LABELS } from "@/lib/seed-data";
import { addPlanEntry, autoFillWeek, clearWeek, removePlanEntry, setCooked } from "@/app/(app)/actions";
import { replacePlanEntry } from "@/app/(app)/menu/actions";

export type RecipeChoice = {
  readonly id: string;
  readonly title: string;
  readonly mealTypes: readonly string[];
};

export type MenuEntryView = {
  readonly id: string;
  readonly planDate: string;
  readonly mealType: string;
  readonly title: string;
  readonly minutes: number | null;
  readonly cookedAt: string | null;
  readonly recipeId: string | null;
  readonly status: DishStatus;
  readonly missingNames: readonly string[];
};

export type TomorrowInfo =
  | { readonly inWeek: false }
  | {
      readonly inWeek: true;
      readonly titles: readonly string[];
      readonly missing: number;
      readonly allCooked: boolean;
    };

type HiddenPair = readonly [string, string];

export type MenuScreenProps = {
  readonly week: string;
  readonly days: readonly string[];
  readonly today: string;
  readonly selected: string;
  readonly portionsLabel: string;
  readonly recipes: readonly RecipeChoice[];
  readonly entries: readonly MenuEntryView[];
  readonly summary: MenuSummary;
  readonly canClear: boolean;
  readonly tomorrow: TomorrowInfo;
  readonly loadError: string | null;
  readonly notice: ReactNode;
};

const ADD_LABEL: Record<MenuSlot, string> = {
  breakfast: "+ Додати сніданок",
  lunch: "+ Додати обід",
  dinner: "+ Додати вечерю",
};

const DAY_MARK: Record<DayMark, { readonly symbol: string; readonly label: string }> = {
  done: { symbol: "✓", label: "усе приготовано" },
  planned: { symbol: "•", label: "є план" },
  open: { symbol: "○", label: "є порожній слот" },
};

const navTextClass =
  "inline-flex min-h-11 cursor-pointer list-none items-center justify-center rounded-12 border border-line-strong bg-surface px-4 text-[15px] font-semibold text-ink no-underline hover:bg-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden";
const navIconClass =
  "inline-flex size-11 items-center justify-center rounded-12 border border-line-strong bg-surface text-base font-semibold text-ink no-underline hover:bg-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2";
const buyLinkClass =
  "inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-12 bg-ink px-4 text-sm font-semibold no-underline hover:bg-ink-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2";
const primaryLinkClass =
  "inline-flex min-h-11 items-center justify-center rounded-12 bg-brand px-4 text-sm font-semibold text-white no-underline hover:bg-menu-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";
const secondarySummaryClass =
  "inline-flex min-h-11 cursor-pointer list-none items-center justify-center rounded-12 border border-line-strong bg-surface px-4 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2";
const cardSummaryClass =
  "flex min-h-11 w-full cursor-pointer list-none items-center justify-center rounded-12 border border-line-strong bg-surface px-1.5 text-center text-[13px] font-semibold whitespace-normal text-ink [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2";
const cardButtonClass = "w-full !px-1.5 !text-[13px] whitespace-normal text-center";
const dashedSummaryClass =
  "flex min-h-[148px] w-full cursor-pointer list-none items-center justify-center rounded-18 border border-dashed border-line-strong bg-transparent px-3 text-center text-sm font-semibold text-brand [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";
const mobileDashedClass =
  "flex min-h-20 w-full cursor-pointer list-none items-center justify-center rounded-[20px] border border-dashed border-line-strong bg-transparent px-3 text-center text-sm font-semibold text-brand [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";

const shortWeekdayFmt = new Intl.DateTimeFormat("uk-UA", { weekday: "short", timeZone: "UTC" });
const dayMonthFmt = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short", timeZone: "UTC" });
const monthInDateFmt = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", timeZone: "UTC" });
const clockFmt = new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" });

function utcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function weekdayShort(iso: string): string {
  const raw = shortWeekdayFmt.format(utcDate(iso)).replace(".", "");
  return raw.charAt(0).toLocaleUpperCase("uk-UA") + raw.slice(1);
}

function shortDayMonth(iso: string): string {
  return dayMonthFmt.format(utcDate(iso));
}

function monthInDate(iso: string): string {
  return monthInDateFmt.formatToParts(utcDate(iso)).find((part) => part.type === "month")?.value ?? "";
}

function weekRangeLabel(start: string, end: string): string {
  const startDay = Number(start.slice(8, 10));
  const endDay = Number(end.slice(8, 10));
  if (start.slice(0, 7) === end.slice(0, 7)) return `${startDay}–${endDay} ${monthInDate(end)}`;
  return `${startDay} ${monthInDate(start)} – ${endDay} ${monthInDate(end)}`;
}

function coverageSentence(summary: MenuSummary, percent: number, compact: boolean): string {
  if (summary.plannedCount === 0) return "У меню ще немає страв";
  return compact ? `Склад покриває ${percent}% тижня` : `Склад покриває меню на ${percent}%`;
}

function shownCoverage(summary: MenuSummary): number {
  if (summary.plannedCount === 0) return 0;
  return summary.coveragePercent ?? 100;
}

function groupRecipes(recipes: readonly RecipeChoice[], meal: string): { matched: RecipeChoice[]; others: RecipeChoice[] } {
  const matched: RecipeChoice[] = [];
  const others: RecipeChoice[] = [];
  for (const recipe of recipes) {
    if (recipe.mealTypes.includes(meal)) matched.push(recipe);
    else others.push(recipe);
  }
  return { matched, others };
}

function entriesOn(entries: readonly MenuEntryView[], date: string, slot: string): MenuEntryView[] {
  return entries.filter((entry) => entry.planDate === date && entry.mealType === slot);
}

function markOf(entries: readonly MenuEntryView[], date: string): DayMark {
  const slots = MENU_SLOTS.map((slot) => {
    const items = entriesOn(entries, date, slot);
    const filled = items.length > 0;
    return { filled, cooked: filled && items.every((item) => Boolean(item.cookedAt)) };
  });
  return dayMarkFromSlots(slots);
}

function missingPhrase(names: readonly string[]): string {
  if (names.length === 0) return "";
  const shown = names.slice(0, 3).join(", ");
  return names.length > 3 ? `немає: ${shown}…` : `немає: ${shown}`;
}

function mealMeta(entry: MenuEntryView): string {
  const parts: string[] = [];
  if (entry.minutes != null) parts.push(`${entry.minutes} хв`);
  if (entry.cookedAt) parts.push(`продукти списано о ${clockFmt.format(new Date(entry.cookedAt))}`);
  else {
    const phrase = missingPhrase(entry.missingNames);
    if (phrase) parts.push(phrase);
  }
  return parts.join(" · ");
}

function WeekNav({ week }: { readonly week: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Link href={`/menu?week=${addDays(week, -7)}`} aria-label="Попередній тиждень" className={navIconClass}>
        ←
      </Link>
      <Link href="/menu" className={navTextClass}>
        Цей тиждень
      </Link>
      <Link href={`/menu?week=${addDays(week, 7)}`} aria-label="Наступний тиждень" className={navIconClass}>
        →
      </Link>
    </div>
  );
}

function WeekActions({ week, canClear }: { readonly week: string; readonly canClear: boolean }) {
  return (
    <>
      <form action={autoFillWeek}>
        <input type="hidden" name="week" value={week} />
        <Button type="submit" module="menu">
          Заповнити порожнє
        </Button>
      </form>
      {canClear ? (
        <form action={clearWeek}>
          <input type="hidden" name="week" value={week} />
          <Button type="submit" variant="secondary">
            Очистити тиждень
          </Button>
        </form>
      ) : null}
    </>
  );
}

function MenuHeader({
  week,
  range,
  selectedName,
  canClear,
}: {
  readonly week: string;
  readonly range: string;
  readonly selectedName: string;
  readonly canClear: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-semibold text-brand">
          <span className="lg:hidden">Меню · {range}</span>
          <span className="hidden lg:inline">Меню</span>
        </p>
        <h1 className="h1">
          <span className="lg:hidden">{selectedName}</span>
          <span className="hidden lg:inline">{range}</span>
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <details className="lg:hidden">
          <summary className={navTextClass}>Тиждень</summary>
          <div className="mt-2">
            <WeekNav week={week} />
          </div>
        </details>
        <div className="hidden items-center gap-2.5 lg:flex">
          <WeekNav week={week} />
          <WeekActions week={week} canClear={canClear} />
        </div>
      </div>
    </div>
  );
}

function CoverageMeter({
  percent,
  sentence,
  thick,
}: {
  readonly percent: number;
  readonly sentence: string;
  readonly thick: boolean;
}) {
  const labelId = useId();
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <p id={labelId} className="text-[13px] font-semibold">
        {sentence}
      </p>
      <div
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className={`w-full overflow-hidden rounded-full bg-surface ${thick ? "h-2.5" : "h-2"}`}
      >
        <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[13px]">{label}</div>
      <div className="font-display text-xl font-bold" style={{ color: "var(--color-ink)" }}>
        {value}
      </div>
    </div>
  );
}

function MenuSummaryBar({
  week,
  summary,
  portionsLabel,
}: {
  readonly week: string;
  readonly summary: MenuSummary;
  readonly portionsLabel: string;
}) {
  const percent = shownCoverage(summary);
  const href = `/shopping?week=${week}`;
  const cooked = `${summary.cookedCount} з ${summary.plannedCount}`;
  return (
    <Card module="menu" variant="tint" className="flex flex-col gap-3">
      <div className="flex items-center gap-3 lg:hidden">
        <CoverageMeter percent={percent} sentence={coverageSentence(summary, percent, true)} thick={false} />
        <Link href={href} className={`${buyLinkClass} px-3 text-[13px]`} style={{ color: "var(--color-surface)" }}>
          Докупити {summary.toBuyCount}
        </Link>
      </div>
      <p className="text-[13px] lg:hidden">
        Приготовано {cooked}
        {" · "}
        Порцій на прийом {portionsLabel}
      </p>
      <div className="hidden flex-wrap items-center gap-x-10 gap-y-4 lg:flex">
        <CoverageMeter percent={percent} sentence={coverageSentence(summary, percent, false)} thick />
        <Stat label="Приготовано" value={cooked} />
        <Stat label="Порцій на прийом" value={portionsLabel} />
        <Stat label="Докупити" value={positionCountLabel(summary.toBuyCount)} />
        <Link href={href} className={buyLinkClass} style={{ color: "var(--color-surface)" }}>
          Список покупок
        </Link>
      </div>
    </Card>
  );
}

function DishStatusChip({ status }: { readonly status: DishStatus }) {
  const fit = "max-w-full !whitespace-normal text-center";
  if (status.kind === "cooked") return <StatusChip status="cooked" className={fit} />;
  if (status.kind === "missing") return <StatusChip status="missing" count={status.missingCount} className={fit} />;
  return <StatusChip status="ready" className={fit} />;
}

function DishTitle({
  entry,
  cooked,
  strong,
  className,
}: {
  readonly entry: MenuEntryView;
  readonly cooked: boolean;
  readonly strong: boolean;
  readonly className: string;
}) {
  const cls = `${className} leading-snug break-words ${strong ? "font-bold" : "font-semibold"} ${cooked ? "text-ink-2" : "text-ink"}`;
  if (!entry.recipeId) return <div className={cls}>{entry.title}</div>;
  return (
    <Link href={`/recipes/${entry.recipeId}`} className={`${cls} no-underline hover:underline`}>
      {entry.title}
    </Link>
  );
}

function CookToggle({
  id,
  week,
  cooked,
  title,
  wide,
}: {
  readonly id: string;
  readonly week: string;
  readonly cooked: boolean;
  readonly title: string;
  readonly wide: boolean;
}) {
  return (
    <form action={setCooked} className={wide ? "w-full" : undefined}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="week" value={week} />
      <input type="hidden" name="cooked" value={cooked ? "false" : "true"} />
      <Button
        type="submit"
        variant="secondary"
        className={wide ? cardButtonClass : undefined}
        aria-pressed={cooked}
        aria-label={cooked ? `Скасувати приготування: ${title}` : `Позначити приготованим: ${title}`}
      >
        {cooked ? "Скасувати" : "Готово"}
      </Button>
    </form>
  );
}

function RemoveButton({ id, title, wide }: { readonly id: string; readonly title: string; readonly wide: boolean }) {
  return (
    <form action={removePlanEntry} className={wide ? "w-full" : undefined}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="secondary" className={wide ? cardButtonClass : undefined} aria-label={`Прибрати: ${title}`}>
        Прибрати
      </Button>
    </form>
  );
}

function RecipePicker({
  action,
  hidden,
  recipes,
  meal,
  summary,
  summaryClassName,
  submitLabel,
  selectLabel,
  compact = false,
}: {
  readonly action: (formData: FormData) => void | Promise<void>;
  readonly hidden: readonly HiddenPair[];
  readonly recipes: readonly RecipeChoice[];
  readonly meal: string;
  readonly summary: string;
  readonly summaryClassName: string;
  readonly submitLabel: string;
  readonly selectLabel: string;
  readonly compact?: boolean;
}) {
  const selectId = useId();
  const grouped = groupRecipes(recipes, meal);
  return (
    <details className="w-full min-w-0">
      <summary className={summaryClassName}>{summary}</summary>
      {recipes.length === 0 ? (
        <p className="mt-2 text-sm text-ink-2">
          Немає рецептів.{" "}
          <Link href="/recipes/new" className="font-semibold text-brand">
            Додати рецепт
          </Link>
        </p>
      ) : (
        <form action={action} className="mt-2 flex w-full min-w-0 flex-col gap-2">
          {hidden.map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <label htmlFor={selectId} className="label">
            Страва
          </label>
          <select id={selectId} name="recipe_id" required defaultValue="" aria-label={selectLabel} className="input max-w-full">
            <option value="" disabled>
              обрати страву…
            </option>
            {grouped.matched.map((recipe) => (
              <option key={recipe.id} value={recipe.id}>
                {recipe.title}
              </option>
            ))}
            {grouped.others.length > 0 ? (
              <optgroup label="Інші рецепти">
                {grouped.others.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.title}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
          <Button type="submit" module="menu" className={compact ? cardButtonClass : "w-full"}>
            {submitLabel}
          </Button>
        </form>
      )}
    </details>
  );
}

function DishActions({
  entry,
  week,
  selected,
  recipes,
  meal,
  cookLink,
  wide,
}: {
  readonly entry: MenuEntryView;
  readonly week: string;
  readonly selected: string;
  readonly recipes: readonly RecipeChoice[];
  readonly meal: string;
  readonly cookLink: boolean;
  readonly wide: boolean;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <div className={wide ? "flex w-full flex-col gap-2" : "flex flex-wrap gap-2"}>
        {cookLink && entry.recipeId && !entry.cookedAt ? (
          <Link href={`/recipes/${entry.recipeId}`} className={primaryLinkClass}>
            Готувати
          </Link>
        ) : null}
        <CookToggle id={entry.id} week={week} cooked={Boolean(entry.cookedAt)} title={entry.title} wide={wide} />
        <RemoveButton id={entry.id} title={entry.title} wide={wide} />
      </div>
      {entry.cookedAt ? null : (
        <RecipePicker
          action={replacePlanEntry}
          hidden={[
            ["id", entry.id],
            ["week", week],
            ["day", selected],
          ]}
          recipes={recipes}
          meal={meal}
          summary="Замінити"
          summaryClassName={wide ? cardSummaryClass : secondarySummaryClass}
          submitLabel="Замінити"
          selectLabel={`Замінити: ${entry.title}`}
          compact={wide}
        />
      )}
    </div>
  );
}

function DesktopCard({
  entry,
  slot,
  week,
  selected,
  recipes,
}: {
  readonly entry: MenuEntryView;
  readonly slot: MenuSlot;
  readonly week: string;
  readonly selected: string;
  readonly recipes: readonly RecipeChoice[];
}) {
  const cooked = Boolean(entry.cookedAt);
  return (
    <Card variant={cooked ? "soft" : "default"} className="flex min-h-[148px] min-w-0 flex-col gap-1.5" style={{ padding: 12 }}>
      <div className="text-[11px] font-semibold tracking-[0.06em] text-ink-2 uppercase">{MEAL_LABELS[slot]}</div>
      <DishTitle entry={entry} cooked={cooked} strong={false} className="text-[15px]" />
      {entry.minutes != null ? <div className="text-xs text-ink-2">{entry.minutes} хв</div> : null}
      <div className="mt-auto flex flex-col items-start gap-2 pt-2">
        <DishStatusChip status={entry.status} />
        <DishActions entry={entry} week={week} selected={selected} recipes={recipes} meal={slot} cookLink={false} wide />
      </div>
    </Card>
  );
}

function MobileCard({
  entry,
  slot,
  week,
  selected,
  recipes,
}: {
  readonly entry: MenuEntryView;
  readonly slot: MenuSlot;
  readonly week: string;
  readonly selected: string;
  readonly recipes: readonly RecipeChoice[];
}) {
  const cooked = Boolean(entry.cookedAt);
  const meta = mealMeta(entry);
  return (
    <Card variant={cooked ? "soft" : "default"} className="flex min-w-0 flex-col gap-2" style={{ padding: 16 }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-[0.06em] text-ink-2 uppercase">{MEAL_LABELS[slot]}</span>
        <DishStatusChip status={entry.status} />
      </div>
      <DishTitle entry={entry} cooked={cooked} strong className="text-[17px]" />
      {meta ? <p className="text-[13px] text-ink-2">{meta}</p> : null}
      <DishActions entry={entry} week={week} selected={selected} recipes={recipes} meal={slot} cookLink wide={false} />
    </Card>
  );
}

function EmptySlot({
  date,
  slot,
  week,
  recipes,
  mobile,
}: {
  readonly date: string;
  readonly slot: MenuSlot;
  readonly week: string;
  readonly recipes: readonly RecipeChoice[];
  readonly mobile: boolean;
}) {
  return (
    <RecipePicker
      action={addPlanEntry}
      hidden={[
        ["week", week],
        ["date", date],
        ["meal_type", slot],
      ]}
      recipes={recipes}
      meal={slot}
      summary={ADD_LABEL[slot]}
      summaryClassName={mobile ? mobileDashedClass : dashedSummaryClass}
      submitLabel="Додати"
      selectLabel={`${MEAL_LABELS[slot]}, ${formatWeekday(date)}`}
      compact={!mobile}
    />
  );
}

function DayColumn({
  date,
  today,
  week,
  selected,
  entries,
  recipes,
}: {
  readonly date: string;
  readonly today: string;
  readonly week: string;
  readonly selected: string;
  readonly entries: readonly MenuEntryView[];
  readonly recipes: readonly RecipeChoice[];
}) {
  const isToday = date === today;
  return (
    <section
      className="flex min-w-0 flex-col gap-2.5"
      aria-label={`${weekdayShort(date)}, ${formatDate(date)}${isToday ? ", сьогодні" : ""}`}
      aria-current={isToday ? "date" : undefined}
    >
      <div
        className={`flex items-baseline justify-between gap-1 rounded-12 px-2.5 py-2 ${
          isToday ? "bg-ink text-lime" : "border border-line bg-surface text-ink"
        }`}
      >
        <span className="font-display text-sm font-medium">{weekdayShort(date)}</span>
        <span className="truncate text-[13px]">{shortDayMonth(date)}</span>
      </div>
      {MENU_SLOTS.map((slot) => {
        const items = entriesOn(entries, date, slot);
        if (items.length === 0) {
          return <EmptySlot key={slot} date={date} slot={slot} week={week} recipes={recipes} mobile={false} />;
        }
        return items.map((entry) => (
          <DesktopCard key={entry.id} entry={entry} slot={slot} week={week} selected={selected} recipes={recipes} />
        ));
      })}
    </section>
  );
}

function DayStrip({
  days,
  week,
  today,
  selected,
  entries,
}: {
  readonly days: readonly string[];
  readonly week: string;
  readonly today: string;
  readonly selected: string;
  readonly entries: readonly MenuEntryView[];
}) {
  return (
    <div className="flex justify-between gap-1 lg:hidden">
      {days.map((date) => {
        const on = date === selected;
        const mark = DAY_MARK[markOf(entries, date)];
        const isToday = date === today;
        return (
          <Link
            key={date}
            href={`/menu?week=${week}&day=${date}`}
            aria-current={on ? "date" : undefined}
            aria-label={`${formatWeekday(date)}, ${formatDate(date)}, ${mark.label}${isToday ? ", сьогодні" : ""}`}
            className={`flex min-h-[62px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-12 border no-underline ${
              on ? "border-ink bg-ink text-lime" : "border-line bg-surface text-ink"
            }`}
          >
            <span className="text-[11px] font-semibold">{weekdayShort(date)}</span>
            <span className="font-display text-[15px] font-medium">{Number(date.slice(8, 10))}</span>
            <span aria-hidden="true" className="text-[10px] leading-none">
              {mark.symbol}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function TomorrowRow({ tomorrow }: { readonly tomorrow: TomorrowInfo }) {
  if (!tomorrow.inWeek) {
    return <p className="flex min-h-11 items-center text-sm text-ink-2">Завтра починається наступний тиждень</p>;
  }
  if (tomorrow.titles.length === 0) {
    return <p className="flex min-h-11 items-center text-sm text-ink-2">Завтра ще порожньо</p>;
  }
  let mark = "усе є";
  let markClass = "text-pantry-ink";
  if (tomorrow.allCooked) {
    mark = "приготовано";
    markClass = "text-menu-ink";
  } else if (tomorrow.missing > 0) {
    mark = `бракує ${tomorrow.missing}`;
    markClass = "text-shops-ink";
  }
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 text-sm">
      <span className="min-w-0 truncate text-ink-2">Завтра · {tomorrow.titles.join(", ")}</span>
      <span className={`shrink-0 font-semibold ${markClass}`}>{mark}</span>
    </div>
  );
}

function ErrorBanner({ message }: { readonly message: string }) {
  return (
    <div role="alert" className="rounded-12 border border-recipes/30 bg-recipes-tint px-4 py-3 text-sm font-medium text-recipes-ink">
      {message}
    </div>
  );
}

export function MenuScreen({
  week,
  days,
  today,
  selected,
  portionsLabel,
  recipes,
  entries,
  summary,
  canClear,
  tomorrow,
  loadError,
  notice,
}: MenuScreenProps) {
  const start = days[0] ?? week;
  const end = days[days.length - 1] ?? start;
  const range = weekRangeLabel(start, end);
  return (
    <div className="flex min-w-0 flex-col gap-3 overflow-x-hidden lg:gap-6">
      <MenuHeader week={week} range={range} selectedName={formatWeekday(selected)} canClear={canClear} />
      {loadError ? <ErrorBanner message={loadError} /> : null}
      {notice}
      <DayStrip days={days} week={week} today={today} selected={selected} entries={entries} />
      <MenuSummaryBar week={week} summary={summary} portionsLabel={portionsLabel} />
      <div className="flex flex-col gap-3 lg:hidden">
        {MENU_SLOTS.map((slot) => {
          const items = entriesOn(entries, selected, slot);
          if (items.length === 0) {
            return <EmptySlot key={slot} date={selected} slot={slot} week={week} recipes={recipes} mobile />;
          }
          return items.map((entry) => (
            <MobileCard key={entry.id} entry={entry} slot={slot} week={week} selected={selected} recipes={recipes} />
          ));
        })}
        <TomorrowRow tomorrow={tomorrow} />
        <div className="flex flex-wrap gap-2">
          <WeekActions week={week} canClear={canClear} />
        </div>
      </div>
      <div className="hidden min-w-0 lg:block">
        <div className="grid min-w-0 grid-cols-7 gap-2.5">
          {days.map((date) => (
            <DayColumn
              key={date}
              date={date}
              today={today}
              week={week}
              selected={selected}
              entries={entries}
              recipes={recipes}
            />
          ))}
        </div>
        <p className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-2">
          <span>«Приготовано» списує продукти зі складу.</span>
          <span>«Бракує» — скільки продуктів рецепта не вистачає на порції сім&apos;ї.</span>
        </p>
      </div>
    </div>
  );
}
