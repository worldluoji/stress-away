import { forwardRef, type InputHTMLAttributes } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, hint, error, className, id, ...rest },
  ref
) {
  const inputId = id ?? rest.name;
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
      <input
        ref={ref}
        id={inputId}
        className={`w-full rounded-xl bg-[--background-secondary] border px-4 py-3 text-[15px] text-[--foreground] placeholder:text-[--foreground-tertiary] transition-all
          focus:outline-none focus:ring-2 focus:ring-[--color-brand]/30 focus:border-[--color-brand]/40
          disabled:opacity-50
          ${error ? "border-[--color-danger]/50" : "border-[var(--card-border)]"}
          ${className ?? ""}`}
        {...rest}
      />
      {error ? (
        <p className="text-xs text-[--color-danger]">{error}</p>
      ) : hint ? (
        <p className="text-xs text-[--foreground-tertiary]">{hint}</p>
      ) : null}
    </div>
  );
});
