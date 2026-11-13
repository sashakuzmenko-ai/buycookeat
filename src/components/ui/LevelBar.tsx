import React from "react";
import { type ModuleName, MODULE_THEMES, BASE_COLORS } from "./tokens";

export type LevelState = "normal" | "low" | "expiring";

export interface LevelBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  state?: LevelState;
  stateLabel?: string;
  name?: React.ReactNode;
  amount?: React.ReactNode;
  module?: ModuleName;
  note?: React.ReactNode;
  hideStateLabel?: boolean;
}

const STATE_CONFIG: Record<LevelState, { color: string; defaultLabel: string; noteColor: string }> = {
  normal: { color: "", defaultLabel: "норма", noteColor: BASE_COLORS.ink2 },
  low: { color: MODULE_THEMES.shops.color, defaultLabel: "мало", noteColor: MODULE_THEMES.shops.ink },
  expiring: { color: MODULE_THEMES.recipes.color, defaultLabel: "термін", noteColor: MODULE_THEMES.recipes.ink },
};

/**
 * Шкала залишку: доріжка 8 px track, заповнення кольором модуля;
 * «мало» — MODULE_THEMES.shops.color, «термін» — MODULE_THEMES.recipes.color.
 * Обов'язковий текстовий підпис стану (норма / мало / термін).
 */
export function LevelBar({
  value,
  max = 100,
  state = "normal",
  stateLabel,
  name,
  amount,
  module = "pantry",
  note,
  hideStateLabel = false,
  className = "",
  ...props
}: LevelBarProps) {
  const percentage = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  const theme = MODULE_THEMES[module];

  const stateCfg = STATE_CONFIG[state];
  const barColor = state === "normal" ? theme.color : stateCfg.color;
  const showLabel = !hideStateLabel && stateLabel !== "";
  const resolvedStateLabel = stateLabel ?? stateCfg.defaultLabel;

  return (
    <div className={`flex flex-col gap-1.5 w-full ${className}`} {...props}>
      <div className="flex justify-between items-baseline text-sm leading-normal">
        <div className="font-semibold text-ink flex items-center gap-1.5 flex-wrap">
          {name && <span>{name}</span>}
          {showLabel && (
            <>
              {name && <span className="text-ink-2 font-normal">·</span>}
              <span style={{ color: barColor }} className="text-[13px] font-medium">
                {resolvedStateLabel}
              </span>
            </>
          )}
        </div>
        {amount && (
          <span className="font-mono text-sm text-ink-2 font-medium shrink-0 ml-2">
            {amount}
          </span>
        )}
      </div>

      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={
          typeof name === "string"
            ? `${name} (${resolvedStateLabel})`
            : `Рівень залишку: ${resolvedStateLabel}`
        }
        className="h-2 w-full rounded-full bg-track overflow-hidden"
      >
        <div
          style={{
            width: `${percentage}%`,
            backgroundColor: barColor,
          }}
          className="h-full rounded-full transition-all duration-300"
        />
      </div>

      {note && (
        <div
          style={{ color: stateCfg.noteColor }}
          className="text-xs font-semibold leading-tight mt-0.5"
        >
          {note}
        </div>
      )}
    </div>
  );
}

export default LevelBar;
