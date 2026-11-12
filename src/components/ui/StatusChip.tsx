import React from "react";
import { type ModuleName, MODULE_THEMES } from "./tokens";

export type StatusType = "cooked" | "ready" | "missing" | "expiring";

export interface StatusChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  status?: StatusType;
  module?: ModuleName;
  count?: number;
  date?: string;
  label?: string;
}

const STATUS_DEFAULTS: Record<
  StatusType,
  {
    module: ModuleName;
    getDefaultLabel: (props: { count?: number; date?: string }) => string;
  }
> = {
  cooked: {
    module: "menu",
    getDefaultLabel: () => "Приготовано",
  },
  ready: {
    module: "pantry",
    getDefaultLabel: () => "Усе є",
  },
  missing: {
    module: "shops",
    getDefaultLabel: ({ count }) => (count !== undefined ? `Бракує ${count}` : "Бракує"),
  },
  expiring: {
    module: "recipes",
    getDefaultLabel: ({ date }) => (date ? `Термін до ${date}` : "Термін спливає"),
  },
};

export function StatusChip({
  status,
  module,
  count,
  date,
  label,
  children,
  className = "",
  style,
  ...props
}: StatusChipProps) {
  const resolvedModule: ModuleName = module ?? (status ? STATUS_DEFAULTS[status].module : "menu");
  const theme = MODULE_THEMES[resolvedModule];

  const content =
    children ?? label ?? (status ? STATUS_DEFAULTS[status].getDefaultLabel({ count, date }) : "");

  return (
    <span
      style={{
        backgroundColor: theme.tint,
        color: theme.ink,
        ...style,
      }}
      className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-[13px] font-semibold leading-tight whitespace-nowrap select-none ${className}`}
      {...props}
    >
      {content}
    </span>
  );
}

export default StatusChip;
