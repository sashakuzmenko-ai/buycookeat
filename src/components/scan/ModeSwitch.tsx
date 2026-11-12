"use client";

import type { ScanMode } from "@/lib/scan-types";

const MODES: readonly (readonly [ScanMode, string])[] = [
  ["add", "Купили — додати"],
  ["set", "Інвентаризація"],
];

const FACES: readonly (readonly [boolean, "dark" | "paper", string])[] = [
  [true, "dark", "bg-lime text-ink"],
  [true, "paper", "bg-ink text-lime"],
  [false, "dark", "bg-transparent text-white"],
  [false, "paper", "bg-transparent text-ink"],
];

function buttonFace(selected: boolean, tone: "dark" | "paper"): string {
  return FACES.find(([on, surface]) => on === selected && surface === tone)?.[2] ?? "text-ink";
}

export function ModeSwitch({
  value,
  onChange,
  tone,
  disabled,
  className = "",
}: {
  value: ScanMode;
  onChange: (mode: ScanMode) => void;
  tone: "dark" | "paper";
  disabled?: boolean;
  className?: string;
}) {
  const track = tone === "dark" ? "bg-ink-raised" : "bg-track";
  return (
    <div role="group" aria-label="Що зробити з позиціями" className={`flex rounded-18 p-1 ${track} ${className}`}>
      {MODES.map(([id, label]) => {
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(id)}
            className={`min-h-11 flex-1 cursor-pointer rounded-[10px] px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime disabled:opacity-50 lg:flex-none ${buttonFace(selected, tone)}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
