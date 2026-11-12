"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { confirmScan, rejectScan, saveScanMode } from "@/app/(app)/scan/actions";
import type { InboxScan } from "@/lib/scan/inbox";
import {
  channelLabel,
  countStockItems,
  countUncertain,
  financeEffectLabel,
  financeMonthLabel,
  formatScanDay,
  formatScanWhen,
  formatUah,
  inputPhrase,
  shoppingEffectLabel,
  stockEffectLabel,
  uncertainHint,
} from "@/lib/scan/present";
import { pluralizePositions } from "@/lib/pantry";
import type { ScanMode } from "@/lib/scan-types";
import { ClarifyDialog } from "./ClarifyDialog";
import { EffectList, type ScanEffect } from "./EffectList";
import { ModeSwitch } from "./ModeSwitch";
import { ReceiptRows } from "./ReceiptRows";
import type { ScanProduct } from "./types";

export function ScanReview({
  scan,
  products,
  zones,
  now,
}: {
  scan: InboxScan;
  products: readonly ScanProduct[];
  zones: Readonly<Record<string, string>>;
  now: Date;
}) {
  return <ReviewBody key={scan.id} scan={scan} products={products} zones={zones} now={now} />;
}

function ReviewBody({
  scan,
  products,
  zones,
  now,
}: {
  scan: InboxScan;
  products: readonly ScanProduct[];
  zones: Readonly<Record<string, string>>;
  now: Date;
}) {
  const [mode, setMode] = useState<ScanMode>(scan.mode);
  const [clarifyIndex, setClarifyIndex] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [action, setAction] = useState<"confirm" | "reject" | null>(null);
  const [busy, startTransition] = useTransition();
  const open = scan.status === "pending";
  const stockCount = countStockItems(scan.items);
  const hint = uncertainHint(countUncertain(scan.items));
  const store = scan.storeName?.trim() || "Без магазину";
  const total = scan.total !== null && scan.total > 0 ? formatUah(scan.total) : "—";
  const effects = effectRows(mode, stockCount, scan.total, scan.createdAt);
  const clarifyItem = clarifyIndex !== null ? scan.items[clarifyIndex] : undefined;

  function changeMode(next: ScanMode) {
    if (!open || next === mode) return;
    const previous = mode;
    setMode(next);
    setError("");
    startTransition(async () => {
      const result = await saveScanMode(scan.id, next);
      if (result.error) {
        setMode(previous);
        setError(result.error);
      }
    });
  }

  function run(next: "confirm" | "reject", task: () => Promise<{ error: string | null }>) {
    setError("");
    setAction(next);
    startTransition(async () => {
      const result = await task();
      setAction(null);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3 lg:hidden">
        <Link
          href="/scan"
          aria-label="Назад до черги"
          className="flex size-11 items-center justify-center rounded-18 bg-ink-raised text-lg text-white no-underline"
        >
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-bold">Перевірка скану</h1>
          <p className="truncate text-[13px] text-ink-muted-on-dark">
            {channelLabel(scan.channel)} · {inputPhrase(scan.inputType)} · {formatScanWhen(scan.createdAt, now)}
          </p>
        </div>
      </div>

      {open && (
        <div className="lg:hidden">
          <ModeSwitch value={mode} onChange={changeMode} tone="dark" disabled={busy} className="w-full" />
        </div>
      )}

      <article className="flex flex-col gap-4 rounded-22 bg-ground p-4 text-ink lg:p-6">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-dashed border-ink-2/40 pb-4">
          <div>
            <h2 className="font-display text-lg font-bold lg:text-[22px]">{store}</h2>
            <p className="font-mono text-xs text-ink-2 lg:text-[13px]">
              {formatScanDay(scan.createdAt)} · {inputPhrase(scan.inputType)} · {channelLabel(scan.channel)} · {pluralizePositions(scan.items.length)}
            </p>
          </div>
          <p className="font-mono text-xl font-semibold lg:text-[26px]">{total}</p>
        </header>

        {open && (
          <div className="hidden self-start lg:block">
            <ModeSwitch value={mode} onChange={changeMode} tone="paper" disabled={busy} />
          </div>
        )}

        <ReceiptRows items={scan.items} pending={open} zones={zones} onClarify={setClarifyIndex} />

        <div className="hidden flex-wrap items-center justify-between gap-3 lg:flex">
          <EffectList effects={effects} layout="chips" />
          {open && (
            <ReviewActions
              busy={busy}
              action={action}
              count={stockCount}
              onReject={() => run("reject", () => rejectScan(scan.id))}
              onConfirm={() => run("confirm", () => confirmScan(scan.id))}
            />
          )}
        </div>
        {!open && <p className="text-sm font-semibold text-ink-2">{scan.status === "confirmed" ? "Записано" : "Відхилено. Склад не змінювався."}</p>}
        {error && (
          <p role="alert" className="rounded-12 bg-recipes-tint px-3 py-2 text-sm text-recipes-ink">
            {error}
          </p>
        )}
        {hint && <p className="hidden text-xs text-ink-2 lg:block">{hint}</p>}
      </article>

      <div className="flex flex-col gap-2 lg:hidden">
        <EffectList effects={effects} layout="cards" />
        {open && (
          <ReviewActions
            busy={busy}
            action={action}
            count={stockCount}
            wide
            onReject={() => run("reject", () => rejectScan(scan.id))}
            onConfirm={() => run("confirm", () => confirmScan(scan.id))}
          />
        )}
        {hint && open && <p className="text-center text-xs text-ink-muted-on-dark">{hint}</p>}
      </div>

      {clarifyItem && clarifyIndex !== null && (
        <ClarifyDialog scanId={scan.id} index={clarifyIndex} item={clarifyItem} products={products} onClose={() => setClarifyIndex(null)} />
      )}
    </div>
  );
}

function effectRows(mode: ScanMode, count: number, total: number | null, createdAt: string): ScanEffect[] {
        return [
    { key: "pantry", title: "Склад", mobileTitle: "Склад", value: stockEffectLabel(mode, count), tone: "pantry" },
    { key: "finance", title: "Фінанси", mobileTitle: financeMonthLabel(createdAt), value: financeEffectLabel(mode, total), tone: "finance" },
    { key: "shops", title: "Покупки", mobileTitle: "Покупки", value: shoppingEffectLabel(mode, count), tone: "shops" },
  ];
}

function ReviewActions({
  busy,
  action,
  count,
  wide = false,
  onReject,
  onConfirm,
}: {
  busy: boolean;
  action: "confirm" | "reject" | null;
  count: number;
  wide?: boolean;
  onReject: () => void;
  onConfirm: () => void;
}) {
  const confirmFace = wide
    ? "min-h-[52px] w-full rounded-18 bg-lime text-base text-ink"
    : "min-h-12 rounded-12 bg-ink px-5 text-[15px] text-lime";
  const rejectFace = wide
    ? "min-h-11 w-full rounded-12 text-sm"
    : "min-h-12 rounded-12 px-4 text-[15px]";
  const confirm = (
    <button
      type="button"
      onClick={onConfirm}
      disabled={busy || count === 0}
      className={`inline-flex cursor-pointer items-center justify-center font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime disabled:opacity-50 ${confirmFace}`}
    >
      {action === "confirm" ? "Записую…" : `Підтвердити ${pluralizePositions(count)}`}
    </button>
  );
  const reject = (
    <button
      type="button"
      onClick={onReject}
      disabled={busy}
      className={`inline-flex cursor-pointer items-center justify-center border border-line-strong bg-surface font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50 ${rejectFace}`}
    >
      {action === "reject" ? "Відхиляю…" : "Відхилити"}
    </button>
  );
  return <div className={`flex gap-2.5 ${wide ? "flex-col" : ""}`}>{wide ? <>{confirm}{reject}</> : <>{reject}{confirm}</>}</div>;
}
