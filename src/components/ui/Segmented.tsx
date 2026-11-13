import React from "react";
import { type ModuleName, MODULE_THEMES } from "./tokens";

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string = string> {
  options: Array<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  module?: ModuleName;
  className?: string;
  name?: string;
}

/**
 * Сегментований перемикач з aria-pressed.
 * Елементи мають висоту не менше 44 px і видимий фокус.
 */
export function Segmented<T extends string = string>({
  options,
  value,
  onChange,
  module,
  className = "",
  name,
}: SegmentedProps<T>) {
  const theme = module ? MODULE_THEMES[module] : undefined;

  return (
    <div
      role="group"
      aria-label={name}
      className={`inline-flex items-center gap-1 p-1 bg-soft rounded-12 border border-line ${className}`}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="button"
            aria-pressed={selected}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            style={
              selected && theme
                ? {
                    color: theme.ink,
                  }
                : undefined
            }
            className={`min-h-[44px] px-4 py-2 rounded-[10px] text-[14px] font-semibold transition-all duration-150 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40 ${
              selected
                ? "bg-surface text-ink border border-line"
                : "text-ink-2 hover:text-ink hover:bg-ground/60"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default Segmented;
