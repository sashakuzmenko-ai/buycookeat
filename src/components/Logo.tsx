import React from "react";

export type LogoVariant = "brand" | "light" | "lime" | "outline" | "round";
export type LogoSize = "sm" | "md" | "default" | "lg" | "xl" | number;

const SIZE_MAP: Record<"sm" | "md" | "default" | "lg" | "xl", number> = {
  sm: 24,
  md: 32,
  default: 48,
  lg: 64,
  xl: 112,
};

export interface LogoProps extends React.SVGAttributes<SVGSVGElement> {
  variant?: LogoVariant;
  theme?: LogoVariant;
  size?: LogoSize;
  title?: string;
}

/**
 * Знак Cook & Eat: літера C, що «з’їдає» крапку.
 * Варіанти:
 * - brand: зелене тло (#1E6B45), біла C, лаймова крапка (#C8F169)
 * - light: біле тло (#FFFFFF), темна C (#14201A), зелена крапка (#1E6B45)
 * - lime: лаймове тло (#C8F169), темна C (#14201A), темна крапка (#14201A)
 * - outline: прозоре тло з контуром (#4A5750), біла C, лаймова крапка (#C8F169)
 * - round: кругле зелене тло (rx=24, #1E6B45), біла C, лаймова крапка (#C8F169)
 */
export function Logo({
  variant,
  theme,
  size = "default",
  title = "Cook & Eat",
  className = "",
  style,
  "aria-hidden": ariaHidden,
  "aria-label": ariaLabel,
  ...props
}: LogoProps) {
  const activeVariant: LogoVariant = variant ?? theme ?? "brand";
  const pixelSize = typeof size === "number" ? size : SIZE_MAP[size] ?? 48;

  let bgNode: React.ReactNode;
  let strokeColor = "#FFFFFF";
  let circleColor = "#C8F169";

  switch (activeVariant) {
    case "light":
      bgNode = <rect width="48" height="48" rx="14" fill="#FFFFFF" />;
      strokeColor = "#14201A";
      circleColor = "#1E6B45";
      break;
    case "lime":
      bgNode = <rect width="48" height="48" rx="14" fill="#C8F169" />;
      strokeColor = "#14201A";
      circleColor = "#14201A";
      break;
    case "outline":
      bgNode = (
        <rect
          x="1"
          y="1"
          width="46"
          height="46"
          rx="13"
          fill="none"
          stroke="#4A5750"
          strokeWidth="2"
        />
      );
      strokeColor = "#FFFFFF";
      circleColor = "#C8F169";
      break;
    case "round":
      bgNode = <rect width="48" height="48" rx="24" fill="#1E6B45" />;
      strokeColor = "#FFFFFF";
      circleColor = "#C8F169";
      break;
    case "brand":
    default:
      bgNode = <rect width="48" height="48" rx="14" fill="#1E6B45" />;
      strokeColor = "#FFFFFF";
      circleColor = "#C8F169";
      break;
  }

  const isDecorative = ariaHidden === true || ariaHidden === "true";

  return (
    <svg
      role={isDecorative ? undefined : "img"}
      aria-hidden={isDecorative ? true : undefined}
      aria-label={!isDecorative ? (ariaLabel ?? title) : undefined}
      width={pixelSize}
      height={pixelSize}
      viewBox="0 0 48 48"
      className={`shrink-0 ${className}`}
      style={style}
      {...props}
    >
      {!isDecorative && title && <title>{title}</title>}
      {bgNode}
      <path
        d="M33.9 14.1A14 14 0 1 0 33.9 33.9"
        fill="none"
        stroke={strokeColor}
        strokeWidth="6"
        strokeLinecap="round"
      />
      <circle cx="35" cy="24" r="4.5" fill={circleColor} />
    </svg>
  );
}

export default Logo;
