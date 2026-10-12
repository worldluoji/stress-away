import { Loader2 } from "lucide-react";

interface Props {
  size?: number;
  className?: string;
  label?: string;
}

export function Spinner({ size = 24, className, label }: Props) {
  return (
    <div className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <Loader2
        width={size}
        height={size}
        className="animate-spin text-[var(--color-brand)]"
        aria-hidden="true"
      />
      {label && <span className="text-sm text-[var(--foreground-tertiary)]">{label}</span>}
    </div>
  );
}
