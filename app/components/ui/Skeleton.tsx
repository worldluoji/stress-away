interface Props {
  lines?: number;
  className?: string;
}

export function Skeleton({ lines = 3, className }: Props) {
  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 rounded-full bg-[var(--background-secondary)] animate-pulse"
          style={{ width: `${85 - i * 12}%` }}
        />
      ))}
    </div>
  );
}
