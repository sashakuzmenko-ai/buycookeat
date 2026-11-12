import React, { forwardRef, useId } from "react";
import { type ModuleName, MODULE_THEMES } from "./tokens";

export interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  module?: ModuleName;
  wrapperClassName?: string;
}

/**
 * Текстове поле: висота 44 px, радіус 12, завжди з видимим <label>.
 * Підтримує фокус у кольорах модуля та вивід помилок.
 */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  {
    label,
    hint,
    error,
    id: explicitId,
    module,
    wrapperClassName = "",
    className = "",
    disabled,
    required,
    style,
    ...props
  },
  ref
) {
  const generatedId = useId();
  const id = explicitId ?? generatedId;
  const theme = module ? MODULE_THEMES[module] : undefined;

  return (
    <div className={`flex flex-col gap-1.5 w-full ${wrapperClassName}`}>
      <label htmlFor={id} className="text-[13px] font-semibold text-ink-2">
        {label}
        {required && <span className="ml-1 text-recipes">*</span>}
      </label>
      <input
        ref={ref}
        id={id}
        disabled={disabled}
        required={required}
        style={
          theme && !error
            ? {
                outlineColor: theme.color,
                ...style,
              }
            : style
        }
        className={`h-11 min-h-[44px] w-full rounded-12 border bg-surface px-3.5 text-[15px] text-ink font-sans transition-all duration-150 outline-none placeholder:text-ink-2/60 disabled:cursor-not-allowed disabled:bg-ground disabled:opacity-60 ${
          error
            ? "border-recipes focus:border-recipes focus:ring-2 focus:ring-recipes-tint"
            : "border-line-strong focus:border-brand focus:ring-2 focus:ring-menu-tint"
        } ${className}`}
        {...props}
      />
      {error ? (
        <span className="text-[13px] font-medium text-recipes">{error}</span>
      ) : hint ? (
        <span className="text-[13px] text-ink-2">{hint}</span>
      ) : null}
    </div>
  );
});

export default Field;
