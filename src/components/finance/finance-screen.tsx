import Link from "next/link";
import { Card } from "@/components/ui";
import { AddReceiptForm } from "./add-receipt-form";
import type { FinanceBar, FinanceMeter, FinanceModel, FinancePrice, FinanceReceiptRow, FinanceSegment } from "./model";
import { currentBarStyle, pastBarStyle, segmentStyle } from "./patterns";

const TONE_CLASS = {
  over: "text-shops-ink",
  under: "text-menu-ink",
  even: "text-ink-2",
} as const;

const periodLinkClass =
  "inline-flex min-h-[44px] items-center justify-center rounded-full px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finance focus-visible:ring-offset-2";

export function FinanceScreen({
  model,
  storeNames,
  formOpen,
}: {
  readonly model: FinanceModel;
  readonly storeNames: readonly string[];
  readonly formOpen: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <MobileHeader model={model} />
      <DesktopHeader model={model} />
      <div className="flex flex-col gap-3 lg:hidden">
        <PeriodSwitch model={model} />
        {model.emptyHousehold ? null : <MobileFacts model={model} />}
      </div>
      {model.emptyHousehold ? (
        <Card>
          <p className="text-[15px] text-ink-2">
            Чеків ще немає. Додайте перший вручну — або він з’явиться тут після підтвердженого скана.
          </p>
        </Card>
      ) : (
        <>
          <MetricGrid model={model} />
          <div className="flex min-w-0 flex-col gap-6 lg:flex-row lg:items-start">
            <div className="flex min-w-0 flex-col gap-6 lg:min-w-[480px] lg:flex-[2]">
              <div className="hidden lg:block">
                <MonthChart model={model} />
              </div>
              <div className="lg:hidden">
                <WeekChart model={model} />
              </div>
              <ReceiptList rows={model.receipts} empty={model.listEmpty} />
            </div>
            <div className="hidden min-w-0 flex-col gap-6 lg:flex lg:min-w-[280px] lg:flex-1">
              <CategoryCard model={model} />
              <StoreCard model={model} />
              <PriceCard model={model} />
            </div>
          </div>
        </>
      )}
      <AddReceiptForm
        kind={model.kind}
        anchor={model.anchor}
        defaultDate={model.defaultDate}
        storeNames={storeNames}
        open={formOpen}
      />
    </div>
  );
}

function MobileHeader({ model }: { readonly model: FinanceModel }) {
  return (
    <div className="-mx-4 -mt-4 mb-1 flex flex-col gap-3 bg-finance px-5 py-5 text-white sm:-mx-6 sm:-mt-6 lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-white/80">{model.eyebrow}</span>
        <PeriodArrows model={model} onDark />
      </div>
      {model.emptyHousehold ? (
        <p className="font-display text-2xl font-bold">Ще немає чеків</p>
      ) : (
        <>
          <div className="flex items-baseline gap-2.5">
            <p className="font-display text-[34px] leading-none font-bold">{model.spentLabel}</p>
            {model.mobileBudget ? <span className="text-sm text-white/80">{model.mobileBudget}</span> : null}
          </div>
          {model.paceBar !== null && model.paceCaption ? (
            <>
              <PaceBar percent={model.paceBar} label={model.paceCaption} tall />
              <p className="text-[13px] text-white/80">{model.paceCaption}</p>
            </>
          ) : (
            <p className="text-[13px] text-white/80">{model.paceEmpty}</p>
          )}
          {model.mobileLeft || model.mobilePerDay ? (
            <div className="flex justify-between gap-3 text-[13px] text-white/80">
              <span>{model.mobileLeft ?? "Бюджет не задано"}</span>
              {model.mobilePerDay ? <span>{model.mobilePerDay}</span> : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function DesktopHeader({ model }: { readonly model: FinanceModel }) {
  return (
    <div className="hidden flex-wrap items-end justify-between gap-4 lg:flex">
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-semibold text-finance">Фінанси</p>
        <div className="flex items-center gap-2">
          <PeriodArrows model={model} />
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink md:text-[28px]">{model.title}</h1>
        </div>
      </div>
      <PeriodSwitch model={model} />
    </div>
  );
}

function PeriodArrows({ model, onDark = false }: { readonly model: FinanceModel; readonly onDark?: boolean }) {
  const className = onDark
    ? "inline-flex h-11 w-11 items-center justify-center rounded-[14px] bg-white/15 text-base font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
    : "inline-flex h-11 w-11 items-center justify-center rounded-12 border border-line-strong bg-surface text-base font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finance";
  return (
    <div className="flex gap-1.5">
      <Link href={model.prevHref} aria-label={model.prevLabel} className={className}>
        ←
      </Link>
      <Link href={model.nextHref} aria-label={model.nextLabel} className={className}>
        →
      </Link>
    </div>
  );
}

function MobileFacts({ model }: { readonly model: FinanceModel }) {
  return (
    <div className="flex flex-col gap-1 text-[13px] text-ink-2">
      {model.weekNote ? null : <p>{model.forecastEmpty}</p>}
      <p>{model.average ? `Середній чек ${model.average.amount} · ${model.average.hint}` : `Середній чек. ${model.averageEmpty}`}</p>
    </div>
  );
}

function PeriodSwitch({ model }: { readonly model: FinanceModel }) {
  return (
    <div role="group" aria-label="Період" className="flex flex-wrap gap-2">
      {model.periods.map((period) => (
        <Link
          key={period.kind}
          href={period.href}
          aria-current={period.active ? "page" : undefined}
          className={`${periodLinkClass} ${
            period.active ? "bg-finance text-white" : "border border-line-strong bg-surface text-ink"
          }`}
        >
          {period.label}
        </Link>
      ))}
    </div>
  );
}

function MetricGrid({ model }: { readonly model: FinanceModel }) {
  return (
    <div className="hidden gap-4 lg:grid lg:grid-cols-4">
      <article className="flex min-h-[148px] flex-col gap-2.5 rounded-18 bg-finance p-5 text-white">
        <h2 className="text-[13px] font-semibold text-white/80">{model.spentCaption}</h2>
        <p className="font-display text-[28px] leading-none font-bold">{model.spentLabel}</p>
        {model.paceBar !== null && model.paceCaption ? (
          <>
            <PaceBar percent={model.paceBar} label={model.paceCaption} />
            <p className="text-[13px] text-white/80">{model.paceCaption}</p>
          </>
        ) : (
          <p className="mt-auto text-[13px] text-white/80">{model.paceEmpty}</p>
        )}
      </article>
      <Metric
        title="Залишок бюджету"
        value={model.remaining?.amount ?? "—"}
        hint={model.remaining?.hint ?? model.remainingEmpty ?? ""}
        hintClass={model.remaining && model.remaining.amount.startsWith("−") ? "text-shops-ink font-semibold" : "text-ink-2"}
      />
      <Metric
        title="Прогноз на місяць"
        value={model.forecast ? `≈ ${model.forecast.amount}` : "—"}
        hint={model.forecast?.hint ?? model.forecastEmpty ?? ""}
        hintClass={model.forecast ? `${TONE_CLASS[model.forecast.tone]} font-semibold` : "text-ink-2"}
      />
      <Metric
        title="Середній чек"
        value={model.average?.amount ?? "—"}
        hint={model.average?.hint ?? model.averageEmpty ?? ""}
      />
    </div>
  );
}

function Metric({
  title,
  value,
  hint,
  hintClass = "text-ink-2",
}: {
  readonly title: string;
  readonly value: string;
  readonly hint: string;
  readonly hintClass?: string;
}) {
  return (
    <article className="flex min-h-[148px] flex-col gap-2.5 rounded-18 border border-line bg-surface p-5">
      <h2 className="text-[13px] font-semibold text-ink-2">{title}</h2>
      <p className="font-display text-[26px] leading-none font-bold text-ink">{value}</p>
      <p className={`mt-auto text-[13px] ${hintClass}`}>{hint}</p>
    </article>
  );
}

function PaceBar({ percent, label, tall = false }: { readonly percent: number; readonly label: string; readonly tall?: boolean }) {
  return (
    <div
      className={`${tall ? "h-2.5" : "h-2"} overflow-hidden rounded-full bg-white/25`}
      role="img"
      aria-label={label}
    >
      <div className="h-full rounded-full bg-lime" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div>
  );
}

function MonthChart({ model }: { readonly model: FinanceModel }) {
  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-base font-bold text-ink md:text-[18px]">Історія по місяцях</h2>
        <span className="text-[13px] text-ink-2">{model.monthCaption}</span>
      </div>
      {model.months.length === 0 ? (
        <p className="text-[15px] text-ink-2">Немає історії витрат за ці місяці.</p>
      ) : (
        <BarChart bars={model.months} budgetPercent={model.monthBudgetPercent} budgetLabel={model.monthCaption} />
      )}
    </Card>
  );
}

function WeekChart({ model }: { readonly model: FinanceModel }) {
  return (
    <Card className="flex flex-col gap-3 rounded-[20px]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-bold">По тижнях</h2>
        {model.weekNote ? <span className="text-[13px] text-ink-2">{model.weekNote}</span> : null}
      </div>
      {model.weeks.length === 0 ? (
        <p className="text-[15px] text-ink-2">Немає витрат по тижнях.</p>
      ) : (
        <div className="flex items-end gap-2.5 overflow-x-auto">
          {model.weeks.map((bar) => (
            <div key={bar.key} className="flex min-w-20 flex-1 flex-col items-center gap-1">
              <div className="font-mono text-[11px] font-semibold whitespace-nowrap">{bar.amount}</div>
              <div className="flex h-24 w-full items-end">
                <BarFill bar={bar} />
              </div>
              <div className="text-center text-[11px] leading-tight text-ink-2">{bar.label}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function BarChart({
  bars,
  budgetPercent,
  budgetLabel,
}: {
  readonly bars: readonly FinanceBar[];
  readonly budgetPercent: number | null;
  readonly budgetLabel: string;
}) {
  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: Math.max(bars.length * 72, 280) }}>
        <div className="relative h-36">
          {budgetPercent !== null ? (
            <div
              className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-ink-2"
              style={{ bottom: `${budgetPercent}%` }}
              aria-hidden
            />
          ) : null}
          <div className="absolute inset-0 flex items-end gap-2" role="img" aria-label={budgetLabel}>
            {bars.map((bar) => (
              <div key={bar.key} className="flex h-full flex-1 items-end">
                <BarFill bar={bar} />
              </div>
            ))}
          </div>
        </div>
        <div className="mt-1.5 flex gap-2">
          {bars.map((bar) => (
            <div key={bar.key} className="min-w-0 flex-1 text-center">
              <div className="text-xs leading-tight text-ink-2">{bar.label}</div>
              <div className="font-mono text-[13px] leading-tight font-semibold">{bar.amount}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BarFill({ bar }: { readonly bar: FinanceBar }) {
  return (
    <div
      className="mx-auto w-full max-w-20 rounded-t-[10px] rounded-b"
      style={{
        height: bar.percent === 0 ? 0 : `max(${bar.percent}%, 4px)`,
        ...(bar.current ? currentBarStyle() : pastBarStyle()),
      }}
      title={`${bar.label}: ${bar.amount}${bar.current ? ", поточний" : ""}`}
    />
  );
}

function ReceiptList({ rows, empty }: { readonly rows: readonly FinanceReceiptRow[]; readonly empty: string }) {
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="font-display text-base font-bold text-ink md:text-[18px] pb-1">Чеки</h2>
      {rows.length === 0 ? (
        <p className="text-[15px] text-ink-2">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <ul className="min-w-[280px] lg:min-w-[520px]">
            {rows.map((row) => (
              <li key={row.id} className="border-t border-dashed border-line-strong">
                <Link
                  href={row.href}
                  className="flex min-h-[54px] items-center gap-3 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finance lg:grid lg:grid-cols-[72px_minmax(0,1fr)_minmax(0,1fr)_minmax(108px,auto)] lg:gap-3"
                >
                  <span className="w-11 shrink-0 font-mono text-[13px] text-ink-2 lg:w-auto">{row.date}</span>
                  <span className="min-w-0 flex-1 lg:contents">
                    <span className="block truncate text-[15px] font-semibold">{row.store}</span>
                    <span className="block truncate text-xs text-ink-2 lg:text-sm">{row.note}</span>
                  </span>
                  <span className="shrink-0 text-right font-mono text-sm font-semibold">{row.amount}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function CategoryCard({ model }: { readonly model: FinanceModel }) {
  return (
    <Card className="flex flex-col gap-3.5">
      <h2 className="font-display text-base font-bold text-ink md:text-[18px]">На що йдуть гроші</h2>
      {model.categories.length === 0 ? (
        <p className="text-[15px] text-ink-2">{model.categoryEmpty}</p>
      ) : (
        model.categories.map((row) => <CategoryRow key={row.name} row={row} />)
      )}
    </Card>
  );
}

function CategoryRow({ row }: { readonly row: FinanceMeter }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between gap-2 text-sm">
        <span>{row.name}</span>
        <span className="font-mono font-semibold">{row.amount}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-finance-tint" role="img" aria-label={`${row.name}: ${row.amount}`}>
        <div className="h-2 rounded-full bg-finance" style={{ width: `${row.percent}%` }} />
      </div>
    </div>
  );
}

function StoreCard({ model }: { readonly model: FinanceModel }) {
  return (
    <Card className="flex flex-col gap-3.5">
      <h2 className="font-display text-base font-bold text-ink md:text-[18px]">Де купуємо</h2>
      {model.stores.length === 0 ? (
        <p className="text-[15px] text-ink-2">{model.storeEmpty}</p>
      ) : (
        <>
          <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
            {model.stores.map((store) => (
              <div key={store.name} style={{ width: `${store.percent}%`, ...segmentStyle(store.index) }} />
            ))}
          </div>
          <ul>
            {model.stores.map((store) => (
              <StoreRow key={store.name} store={store} />
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function StoreRow({ store }: { readonly store: FinanceSegment }) {
  return (
    <li className="flex min-h-[44px] items-center gap-2.5 text-sm">
      <span aria-hidden className="h-3 w-3 shrink-0 rounded" style={segmentStyle(store.index)} />
      <span className="min-w-0 flex-1 truncate">{store.name}</span>
      <span className="text-ink-2">{store.share}</span>
      <span className="shrink-0 text-right font-mono font-semibold whitespace-nowrap">{store.amount}</span>
    </li>
  );
}

function PriceCard({ model }: { readonly model: FinanceModel }) {
  return (
    <Card module="finance" variant="tint" className="flex flex-col gap-1 border-transparent">
      <h2 className="mb-1 text-base font-bold">{model.priceTitle}</h2>
      {model.prices.length === 0 ? (
        <p className="text-sm">{model.priceEmpty}</p>
      ) : (
        <ul>
          {model.prices.map((price) => (
            <PriceRow key={price.id} price={price} />
          ))}
        </ul>
      )}
      {model.priceMore > 0 ? <p className="text-[13px] text-finance-ink">Ще {model.priceMore}</p> : null}
    </Card>
  );
}

function PriceRow({ price }: { readonly price: FinancePrice }) {
  return (
    <li className="flex min-h-[44px] items-center justify-between gap-3 text-sm">
      <span className="min-w-0 truncate">{price.name}</span>
      <span className={`shrink-0 font-mono font-semibold ${price.up ? "text-recipes-ink" : "text-menu-ink"}`}>
        {price.up ? "▲" : "▼"} {price.text}
      </span>
    </li>
  );
}
