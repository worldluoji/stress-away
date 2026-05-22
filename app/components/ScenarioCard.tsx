'use client';

import type { ScenarioTemplate } from '@/lib/scenarios';

interface Props {
  scenario: ScenarioTemplate;
  onClick: () => void;
}

export function ScenarioCard({ scenario, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 bg-[--card-bg] rounded-xl border border-[var(--card-border)] hover:border-[#007AFF]/30 hover:shadow-md transition-all active:scale-[0.98] group"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#007AFF] to-[#5856D6] flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[--foreground] mb-1 group-hover:text-[#007AFF] transition-colors">
            {scenario.name}
          </h3>
          <p className="text-sm text-[--foreground-tertiary] line-clamp-2">
            {scenario.description}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {scenario.keywords.slice(0, 3).map((keyword) => (
              <span
                key={keyword}
                className="text-xs px-2 py-0.5 rounded-full bg-[--background-secondary] text-[--foreground-tertiary]"
              >
                {keyword}
              </span>
            ))}
          </div>
        </div>
        <svg className="w-5 h-5 text-[--foreground-tertiary] group-hover:text-[#007AFF] transition-colors shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}
