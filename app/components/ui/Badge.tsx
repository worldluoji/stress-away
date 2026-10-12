import type { ReactNode } from "react";

type Tone = "brand" | "success" | "warning" | "danger" | "neutral" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  brand: "bg-[var(--color-brand)]/10 text-[var(--color-brand)]",
  success: "bg-[var(--color-success)]/10 text-[var(--color-success)]",
  warning: "bg-[var(--color-warning)]/10 text-[var(--color-warning)]",
  danger: "bg-[var(--color-danger)]/10 text-[var(--color-danger)]",
  info: "bg-[var(--color-info)]/10 text-[var(--color-info)]",
  neutral: "bg-[var(--background-secondary)] text-[var(--foreground-tertiary)]",
};

interface Props {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = "neutral", children, className }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium tracking-wide ${TONE_CLASSES[tone]} ${className ?? ""}`}
    >
      {children}
    </span>
  );
}
