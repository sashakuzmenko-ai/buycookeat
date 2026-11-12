import React, { forwardRef } from "react";
import { type ModuleName, MODULE_THEMES } from "./tokens";

export type ButtonVariant = "primary" | "secondary" | "scan";
export type ButtonSize = "default" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  module?: ModuleName;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    module,
    size = "default",
    className = "",
    style,
    children,
    type = "button",
    disabled,
    ...props
  },
  ref
) {
  const theme = module ? MODULE_THEMES[module] : undefined;

  let baseStyle: React.CSSProperties = {};
  let variantClasses = "";

  if (variant === "primary") {
    if (theme && theme.color !== "#1E6B45") {
      baseStyle = {
        backgroundColor: theme.color,
        color: "#FFFFFF",
      };
      variantClasses =
        "text-white hover:opacity-90 active:opacity-95 focus-visible:ring-2 focus-visible:ring-offset-2";
    } else {
      variantClasses =
        "bg-brand text-white hover:bg-menu-ink active:opacity-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";
    }
  } else if (variant === "secondary") {
    variantClasses =
      "border border-line-strong bg-surface text-ink hover:bg-soft active:bg-track focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2";
  } else if (variant === "scan") {
    variantClasses =
      "bg-ink text-lime hover:bg-ink-raised active:opacity-95 focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2";
  }

  const sizeClasses =
    size === "lg"
      ? "min-h-[48px] md:min-h-[52px] px-5 py-3 text-base"
      : "min-h-[44px] px-4.5 py-2.5 text-[15px]";

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      style={{ ...baseStyle, ...style }}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-12 font-sans font-semibold tracking-normal transition-all duration-150 outline-none select-none disabled:cursor-not-allowed disabled:opacity-50 ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});

export default Button;
