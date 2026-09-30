import { forwardRef, type TextareaHTMLAttributes } from "react";

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  maxLengthIndicator?: number;
}

export const Textarea = forwardRef<HTMLTextAreaElement, Props>(function Textarea(
  { label, hint, error, maxLengthIndicator, value, className, id, ...rest },
  ref
) {
  const inputId = id ?? rest.name;
  const length = typeof value === "string" ? value.length : 0;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-medium text-[--foreground-secondary]"
        >
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={inputId}
        value={value}
        className={`w-full rounded-xl bg-[--background-secondary] border px-4 py-3 text-[15px] text-[--foreground] placeholder:text-[--foreground-tertiary] transition-all resize-none
          focus:outline-none focus:ring-2 focus:ring-[--color-brand]/30 focus:border-[--color-brand]/40
          disabled:opacity-50
          ${error ? "border-[--color-danger]/50" : "border-[var(--card-border)]"}
          ${className ?? ""}`}
        {...rest}
      />
      <div className="flex justify-between text-xs text-[--foreground-tertiary]">
        <span>{error ? <span className="text-[--color-danger]">{error}</span> : hint}</span>
        {maxLengthIndicator !== undefined && (
          <span>{length}/{maxLengthIndicator}</span>
        )}
      </div>
    </div>
  );
});
