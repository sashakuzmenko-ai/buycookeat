import React from "react";
import { type ModuleName, MODULE_THEMES } from "./tokens";

export interface MoneyRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  amount: React.ReactNode;
  icon?: React.ReactNode;
  module?: ModuleName;
  onClick?: () => void;
}

/**
 * Рядок суми: іконка на тоні модуля, назва, підпис, сума моноширинним шрифтом праворуч.
 * Якщо onClick передано — інтерактивний рядок з min 44 px і видимим фокусом.
 */
export function MoneyRow({
  title,
  subtitle,
  amount,
  icon,
  module = "finance",
  onClick,
  className = "",
  ...props
}: MoneyRowProps) {
  const theme = MODULE_THEMES[module];

  const content = (
    <>
      {icon && (
        <div
          style={{
            backgroundColor: theme.tint,
            color: theme.color,
          }}
          className="w-10 h-10 rounded-12 flex items-center justify-center shrink-0 [&>svg]:w-5 [&>svg]:h-5"
        >
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold text-ink truncate leading-snug">
          {title}
        </div>
        {subtitle && (
          <div className="text-[13px] text-ink-2 truncate leading-normal">
            {subtitle}
          </div>
        )}
      </div>
      <div className="font-mono font-semibold text-[15px] text-ink shrink-0 ml-3">
        {amount}
      </div>
    </>
  );

  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        className={`flex items-center gap-3 min-h-[44px] py-2 px-1 cursor-pointer select-none rounded-12 hover:bg-soft transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 ${className}`}
        {...props}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-3 min-h-[44px] py-2 ${className}`}
      {...props}
    >
      {content}
    </div>
  );
}

export default MoneyRow;
