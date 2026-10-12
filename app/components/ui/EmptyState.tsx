import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

interface Props {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-12 px-6 ${className ?? ""}`}>
      {icon && (
        <span className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--color-brand)]/10 to-[var(--color-brand-alt)]/10 text-[var(--color-brand)] mb-4">
          <Icon name={icon} size={28} strokeWidth={1.5} />
        </span>
      )}
      <h3 className="text-[var(--text-h3)] font-semibold text-[var(--foreground)] mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-[var(--foreground-tertiary)] max-w-xs">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
