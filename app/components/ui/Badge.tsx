import type { ReactNode } from "react";

type Tone = "brand" | "success" | "warning" | "danger" | "neutral" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  brand: "bg-[--color-brand]/10 text-[--color-brand]",
  success: "bg-[--color-success]/10 text-[--color-success]",
  warning: "bg-[--color-warning]/10 text-[--color-warning]",
  danger: "bg-[--color-danger]/10 text-[--color-danger]",
  info: "bg-[--color-info]/10 text-[--color-info]",
  neutral: "bg-[--background-secondary] text-[--foreground-tertiary]",
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
