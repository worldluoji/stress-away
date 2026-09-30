import { forwardRef, type SelectHTMLAttributes } from "react";

interface Option {
  value: string;
  label: string;
}

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: Option[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { label, hint, error, options, placeholder, className, id, ...rest },
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
      <select
        ref={ref}
        id={inputId}
        className={`w-full rounded-xl bg-[--background-secondary] border px-4 py-3 text-[15px] text-[--foreground] transition-all
          focus:outline-none focus:ring-2 focus:ring-[--color-brand]/30 focus:border-[--color-brand]/40
          disabled:opacity-50
          ${error ? "border-[--color-danger]/50" : "border-[var(--card-border)]"}
          ${className ?? ""}`}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error ? (
        <p className="text-xs text-[--color-danger]">{error}</p>
      ) : hint ? (
        <p className="text-xs text-[--foreground-tertiary]">{hint}</p>
      ) : null}
    </div>
  );
});
