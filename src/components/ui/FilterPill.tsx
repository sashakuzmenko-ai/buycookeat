import React from "react";
import { type ModuleName, MODULE_THEMES } from "./tokens";

export interface FilterPillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  module?: ModuleName;
  count?: number;
}

/**
 * Фільтр-пігулка з aria-pressed.
 * Радіус 999, розмір 13 px, вага 600, мінімальна висота 44 px, видимий фокус.
 */
export function FilterPill({
  active = false,
  module = "menu",
  count,
  children,
  className = "",
  style,
  onClick,
  type = "button",
  disabled,
  ...props
}: FilterPillProps) {
  const theme = MODULE_THEMES[module];

  return (
    <button
      type={type}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      style={
        active
          ? {
              backgroundColor: theme.tint,
              color: theme.ink,
              borderColor: "transparent",
              ...style,
            }
          : style
      }
      className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-full text-[13px] font-semibold border transition-all duration-150 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? "border-transparent"
          : "border-line bg-surface text-ink-2 hover:bg-soft hover:text-ink"
      } ${className}`}
      {...props}
    >
      <span>{children}</span>
      {count !== undefined && (
        <span
          className={`text-[11px] font-mono font-medium px-2 py-0.5 rounded-full ${
            active ? "bg-surface/80 text-ink" : "bg-soft text-ink-2"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export default FilterPill;
