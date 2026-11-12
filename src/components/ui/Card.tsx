import React from "react";
import { type ModuleName, MODULE_THEMES } from "./tokens";

export type CardVariant = "default" | "dark" | "soft" | "tint";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  module?: ModuleName;
  variant?: CardVariant;
}

/**
 * Картка дизайн-системи:
 * Радіус 18 px (на мобільному 20–22 px), без тіней (поділ через border-line і тон тла).
 * Підтримує варіанти default (surface), dark (ink), soft, та tint (у кольорі модуля).
 */
export function Card({
  module,
  variant = "default",
  children,
  className = "",
  style,
  ...props
}: CardProps) {
  const theme = module ? MODULE_THEMES[module] : undefined;

  let variantStyle: React.CSSProperties = {};
  let variantClasses = "";

  if (variant === "dark") {
    variantClasses = "bg-ink text-white border-transparent";
  } else if (variant === "soft") {
    variantClasses = "bg-soft text-ink border-line";
  } else if (variant === "tint" && theme) {
    variantStyle = {
      backgroundColor: theme.tint,
      color: theme.ink,
      borderColor: "transparent",
    };
  } else {
    variantClasses = "bg-surface text-ink border-line";
  }

  return (
    <div
      style={{ ...variantStyle, ...style }}
      className={`rounded-18 md:rounded-18 rounded-[20px] border p-5 md:p-6 transition-colors ${variantClasses} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export default Card;
