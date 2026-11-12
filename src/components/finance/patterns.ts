import type React from "react";

const SEGMENT_COLORS = [
  "var(--color-finance)",
  "var(--color-menu)",
  "var(--color-shops)",
  "var(--color-pantry)",
  "var(--color-family)",
  "var(--color-recipes)",
  "var(--color-finance-ink)",
] as const;

/** Сегменти різняться і кольором модуля, і візерунком — не лише відтінком. */
export function segmentStyle(index: number): React.CSSProperties {
  const color = SEGMENT_COLORS[index % SEGMENT_COLORS.length];
  const pattern = index % 4;
  if (pattern === 1) {
    return {
      backgroundColor: color,
      backgroundImage: "repeating-linear-gradient(135deg, transparent 0 3px, rgba(255,255,255,.55) 3px 6px)",
    };
  }
  if (pattern === 2) {
    return {
      backgroundColor: color,
      backgroundImage: "radial-gradient(circle, rgba(255,255,255,.75) 1.1px, transparent 1.3px)",
      backgroundSize: "7px 7px",
    };
  }
  if (pattern === 3) {
    return {
      backgroundColor: color,
      backgroundImage: "repeating-linear-gradient(0deg, transparent 0 3px, rgba(255,255,255,.55) 3px 5px)",
    };
  }
  return { backgroundColor: color };
}

export function pastBarStyle(): React.CSSProperties {
  return {
    backgroundColor: "var(--color-finance-tint)",
    backgroundImage:
      "repeating-linear-gradient(90deg, var(--color-finance) 0 3px, transparent 3px 8px)",
  };
}

export function currentBarStyle(): React.CSSProperties {
  return { backgroundColor: "var(--color-finance)" };
}
