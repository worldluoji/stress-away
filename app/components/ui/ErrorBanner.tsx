import { Icon } from "./Icon";

interface Props {
  message: string;
  onRetry?: () => void;
  onAction?: () => void;
  actionLabel?: string;
  variant?: "inline" | "banner";
  tone?: "error" | "warning";
}

export function ErrorBanner({
  message,
  onRetry,
  onAction,
  actionLabel = "额度说明",
  variant = "inline",
  tone = "error",
}: Props) {
  const action = onRetry || onAction;
  return (
    <div
      role="alert"
      className={`flex items-center justify-between gap-3 rounded-xl text-sm ${
        tone === "warning"
          ? "bg-[var(--color-warning)]/10 text-[var(--color-warning)]"
          : "bg-[var(--color-danger)]/10 text-[var(--color-danger)]"
      } ${
        variant === "banner" ? "px-4 py-3" : "px-4 py-2.5"
      } animate-fade-in`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <Icon name="alert-circle" size={16} className="shrink-0" />
        <span className="truncate">{message}</span>
      </span>
      {action && (
        <button
          onClick={onRetry ?? onAction}
          className="shrink-0 px-3 py-1 rounded-full bg-[var(--color-brand)] text-white text-xs font-medium hover:bg-[var(--color-brand)]/90 transition-colors active:scale-95"
        >
          {onRetry ? "重试" : actionLabel}
        </button>
      )}
    </div>
  );
}
