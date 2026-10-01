"use client";

import type { ScenarioTemplate } from "@/lib/scenarios";
import { Icon } from "./ui/Icon";

interface Props {
  scenario: ScenarioTemplate;
  onClick: () => void;
}

export function ScenarioCard({ scenario, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="group relative w-full text-left p-4 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] hover:border-[var(--color-brand)]/40 transition-all duration-[var(--dur-base)] ease-[var(--ease-out)] active:scale-[0.98] hover:-translate-y-0.5 hover:shadow-[var(--shadow-moderate)] overflow-hidden"
    >
      <span
        aria-hidden="true"
        className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-8 rounded-r-full bg-[var(--color-brand)] scale-y-0 group-hover:scale-y-100 transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)]"
      />
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--color-brand)] to-[var(--color-brand-alt)] flex items-center justify-center shrink-0 shadow-sm">
          <Icon name="message-circle" size={18} strokeWidth={2} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[var(--foreground)] mb-1 group-hover:text-[var(--color-brand)] transition-colors">
            {scenario.name}
          </h3>
          <p className="text-sm text-[var(--foreground-tertiary)] line-clamp-2">
            {scenario.description}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {scenario.keywords.slice(0, 3).map((keyword) => (
              <span
                key={keyword}
                className="text-xs px-2 py-0.5 rounded-full bg-[var(--background-secondary)] text-[var(--foreground-tertiary)]"
              >
                {keyword}
              </span>
            ))}
          </div>
        </div>
        <Icon
          name="chevron-right"
          size={18}
          className="text-[var(--foreground-tertiary)] group-hover:text-[var(--color-brand)] group-hover:translate-x-0.5 transition-all shrink-0 mt-1"
        />
      </div>
    </button>
  );
}
