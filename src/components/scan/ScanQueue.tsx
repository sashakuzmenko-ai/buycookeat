"use client";

import type { InboxScan } from "@/lib/scan/inbox";
import { formatScanWhen, queueNote, queueTitle, statusLabel } from "@/lib/scan/present";
import type { ScanStatus } from "@/lib/db-types";

const CHIP: readonly (readonly [ScanStatus, string])[] = [
  ["pending", "bg-lime text-ink"],
  ["confirmed", "bg-scan text-white"],
  ["rejected", "bg-scan text-ink-muted-on-dark"],
];

function chipClass(status: ScanStatus): string {
  return CHIP.find(([id]) => id === status)?.[1] ?? "bg-scan text-white";
}

export function ScanQueue({
  scans,
  selectedId,
  now,
  onSelect,
}: {
  scans: readonly InboxScan[];
  selectedId: string | null;
  now: Date;
  onSelect: (id: string) => void;
}) {
  if (scans.length === 0) {
    return (
      <p className="rounded-18 bg-ink-raised px-4 py-5 text-sm text-ink-muted-on-dark">
        Черга порожня. Додайте фото, голос, відео, скріншот або текст — розпізнане з’явиться тут і чекатиме перевірки.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {scans.map((scan) => {
        const selected = scan.id === selectedId;
        const shell = selected ? "border-lime bg-ground text-ink" : "border-ink-raised bg-ink-raised text-white";
        const sub = selected ? "text-ink-2" : "text-ink-muted-on-dark";
        const store = scan.storeName?.trim() || null;
        return (
          <li key={scan.id}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(scan.id)}
              className={`flex w-full cursor-pointer items-center gap-3.5 rounded-18 border px-4 py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime ${shell}`}
            >
              <span className={`w-12 shrink-0 font-mono text-xs ${sub}`}>{formatScanWhen(scan.createdAt, now)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{queueTitle(scan.inputType, store, scan.channel)}</span>
                <span className={`block truncate text-[13px] ${sub}`}>
                  {queueNote(scan.items.length, scan.total, scan.channel)}
                </span>
              </span>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${chipClass(scan.status)}`}>
                {statusLabel(scan.status)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
