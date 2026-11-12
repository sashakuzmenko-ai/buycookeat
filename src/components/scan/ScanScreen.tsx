"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CaptureKind } from "@/lib/scan/capture";
import type { InboxScan } from "@/lib/scan/inbox";
import { SCAN_INPUTS } from "@/lib/scan/present";
import type { ScanMode } from "@/lib/scan-types";
import { CapturePanel, type CaptureHandle } from "./CapturePanel";
import { ScanQueue } from "./ScanQueue";
import { ScanReview } from "./ScanReview";
import type { ScanProduct } from "./types";

export function ScanScreen({
  scans,
  products,
  zones,
  telegramLinked,
  aiEnabled,
  selectedId,
  initialMode,
  nowIso,
  loadError,
}: {
  scans: readonly InboxScan[];
  products: readonly ScanProduct[];
  zones: Readonly<Record<string, string>>;
  telegramLinked: boolean;
  aiEnabled: boolean;
  selectedId: string | null;
  initialMode: ScanMode;
  nowIso: string;
  loadError: string | null;
}) {
  const router = useRouter();
  const captureRef = useRef<CaptureHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const selected = scans.find((scan) => scan.id === selectedId) ?? null;
  const autoKind: CaptureKind | null = initialMode === "set" && !selectedId ? "voice" : null;
  const [captureOpen, setCaptureOpen] = useState(autoKind !== null);
  const reviewing = Boolean(selected);
  const panelClass = panelVisibility(reviewing, captureOpen);

  return (
    <div className="relative flex flex-col gap-6">
      <input
        ref={fileRef}
        type="file"
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onChange={(event) => captureRef.current?.addFiles(event.target.files)}
      />
      <header className={`flex-wrap items-end justify-between gap-4 ${reviewing ? "hidden lg:flex" : "flex"}`}>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold text-lime">Скан</p>
          <h1 className="font-display text-[22px] leading-tight font-bold lg:text-[28px]">Вхідні</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex h-11 items-center gap-2 rounded-full bg-ink-raised px-4 text-sm font-semibold">
            <span aria-hidden className={`size-2 rounded-full ${telegramLinked ? "bg-lime" : "bg-ink-2"}`} />
            {telegramLinked ? "Telegram-бот підключено" : "Telegram не підключено"}
          </span>
          <button
            type="button"
            onClick={() => captureRef.current?.begin("file")}
            className="inline-flex h-11 cursor-pointer items-center rounded-12 bg-lime px-4 font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
          >
            Завантажити файл
          </button>
        </div>
      </header>

      {!aiEnabled && (
        <p className={`rounded-12 bg-shops-tint px-3 py-2 text-sm text-shops-ink ${reviewing ? "hidden lg:block" : ""}`}>
          Розпізнавання вимкнене: на сервері не задано ключ OpenRouter.
        </p>
      )}
      {loadError && (
        <p role="alert" className="rounded-12 bg-recipes-tint px-3 py-2 text-sm text-recipes-ink">
          {loadError}
        </p>
      )}

      <div className={`grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5 ${reviewing ? "hidden lg:grid" : ""}`}>
        {SCAN_INPUTS.map(([id, name, note]) => (
          <button
            key={id}
            type="button"
            onClick={() => captureRef.current?.begin(id)}
            className="flex cursor-pointer flex-col gap-1 rounded-18 bg-ink-raised px-4 py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
          >
            <span className="text-sm font-semibold text-lime">{name}</span>
            <span className="text-[13px] leading-snug text-ink-muted-on-dark">{note}</span>
          </button>
        ))}
      </div>

      <div className={panelClass}>
        <CapturePanel
          ref={captureRef}
          aiEnabled={aiEnabled}
          initialMode={initialMode}
          autoKind={autoKind}
          fileRef={fileRef}
          onOpenChange={setCaptureOpen}
        />
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <section aria-label="Черга сканів" className={`w-full flex-col gap-2 lg:min-w-[280px] lg:flex-1 ${reviewing ? "hidden lg:flex" : "flex"}`}>
          <ScanQueue scans={scans} selectedId={selectedId} now={now} onSelect={(id) => router.push(`/scan?id=${id}`)} />
        </section>
        <section className={`w-full lg:min-w-0 lg:flex-[2] ${reviewing ? "block" : "hidden lg:block"}`}>
          {selected ? (
            <ScanReview scan={selected} products={products} zones={zones} now={now} />
          ) : (
            <div className="rounded-22 bg-ground px-6 py-10 text-ink">
              <h2 className="font-display text-xl font-bold">Немає вибраного скану</h2>
              <p className="mt-2 text-sm text-ink-2">Оберіть запис у черзі або додайте фото, голос, відео, скріншот чи текст.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function panelVisibility(reviewing: boolean, open: boolean): string {
  if (!open) return "hidden";
  if (reviewing) return "hidden lg:block";
  return "";
}
