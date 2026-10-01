import type { HTMLAttributes, ReactNode } from "react";

type Variant = "default" | "glass" | "elevated" | "outline";

const VARIANT_CLASSES: Record<Variant, string> = {
  default: "bg-[var(--card-bg)] border border-[var(--card-border)]",
  glass: "bg-[var(--glass-bg)] backdrop-blur-xl border border-[var(--card-border)]",
  elevated: "bg-[var(--card-bg)] shadow-[var(--shadow-prominent)]",
  outline: "bg-transparent border border-[var(--card-border)]",
};

interface Props extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  padding?: "none" | "sm" | "md" | "lg";
  children: ReactNode;
}

const PADDING = {
  none: "",
  sm: "p-3",
  md: "p-5",
  lg: "p-6",
};

export function Card({
  variant = "default",
  padding = "md",
  className,
  children,
  ...rest
}: Props) {
  return (
    <div
      className={`rounded-2xl transition-all ${VARIANT_CLASSES[variant]} ${PADDING[padding]} ${className ?? ""}`}
      {...rest}
    >
      {children}
    </div>
  );
}
