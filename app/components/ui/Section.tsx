import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

interface Props {
  step?: number;
  title: string;
  description?: string;
  icon?: IconName;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Section({ step, title, description, icon, action, children, className }: Props) {
  return (
    <section className={className}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {step !== undefined && (
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-[var(--color-brand)] to-[var(--color-brand-alt)] text-white text-sm font-semibold shrink-0 shadow-sm ring-1 ring-inset ring-white/20">
              {step}
            </span>
          )}
          {icon && (
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--background-secondary)] text-[var(--foreground-secondary)] shrink-0">
              <Icon name={icon} size={16} />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-[var(--text-h3)] font-semibold text-[var(--foreground)] leading-tight">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-sm text-[var(--foreground-tertiary)]">{description}</p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      {children}
    </section>
  );
}
