'use client';

import { useState } from 'react';
import type { ScenarioTemplate, ScenarioQuestion } from '@/lib/scenarios';

interface Props {
  scenario: ScenarioTemplate;
  onClose: () => void;
  onCustomize: (prefix: string) => void;
}

export function ScenarioModal({ scenario, onClose, onCustomize }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showQuestions, setShowQuestions] = useState(false);

  const questions = scenario.questions || [];
  const allAnswered = questions.length === 0 || questions.every((q) => answers[q.id]);

  const handleAnswer = (questionId: string, option: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: option }));
  };

  const handleCustomize = () => {
    if (!allAnswered) {
      setShowQuestions(true);
      return;
    }

    // Build detailed context with answers
    let context = `场景ID：${scenario.id}
场景：${scenario.name}
${scenario.description}\n`;

    if (questions.length > 0) {
      context += `\n【我的具体情况】\n`;
      questions.forEach((q) => {
        context += `· ${q.question} → ${answers[q.id] || '（未选择）'}\n`;
      });
    }

    context += `\n请根据以上具体场景和我的选择，生成专属的话术反击、心态调整、证据收集建议和法律参考。话术要贴合我选择的场景细节，越具体越好。`;

    onCustomize(context);
    onClose();
  };

  const selectedAnswersCount = questions.filter((q) => answers[q.id]).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full sm:max-w-2xl max-h-[85vh] bg-[--card-bg] rounded-t-2xl sm:rounded-2xl shadow-2xl animate-slide-up sm:animate-scale-in overflow-hidden flex flex-col border border-[var(--card-border)] bg-white dark:bg-neutral-900">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--card-border)] flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[--foreground]">{scenario.name}</h2>
            <p className="text-sm text-[--foreground-tertiary]">{scenario.description}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[--background-secondary] text-[--foreground-tertiary] hover:bg-[--apple-gray-light] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Scripts */}
          <div>
            <h3 className="text-base font-semibold text-[--foreground] mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#007AFF]/10 text-[#007AFF] text-sm flex items-center justify-center">1</span>
              话术模板
            </h3>
            <div className="space-y-3">
              {scenario.scripts.map((script, index) => (
                <div key={index} className="bg-[--background-secondary] rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-[#007AFF] bg-[#007AFF]/10 px-2 py-0.5 rounded">
                      {index === 0 ? '温和版' : '犀利版'}
                    </span>
                  </div>
                  <p className="text-[15px] text-[--foreground] leading-relaxed mb-2">
                    &ldquo;{script.mild}&rdquo;
                  </p>
                  {index === 0 && script.sharp && (
                    <>
                      <p className="text-[15px] text-[--foreground] leading-relaxed mb-2">
                        &ldquo;{script.sharp}&rdquo;
                      </p>
                      <div className="mt-3 pt-3 border-t border-[var(--card-border)]">
                        <p className="text-sm text-[--foreground-tertiary]">
                          <span className="font-medium text-[#34C759]">💡 效果：</span>
                          {script.effect}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Follow-up Questions */}
          {questions.length > 0 && (
            <div>
              <h3 className="text-base font-semibold text-[--foreground] mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#FF9500]/10 text-[#FF9500] text-sm flex items-center justify-center">2</span>
                补充具体情况（可选）
                {showQuestions && (
                  <span className="text-xs text-[--foreground-tertiary] font-normal">
                    · 已选 {selectedAnswersCount}/{questions.length}
                  </span>
                )}
              </h3>
              <div className="space-y-4">
                {questions.map((q) => (
                  <div key={q.id} className="bg-[--background-secondary] rounded-xl p-4">
                    <p className="text-sm font-medium text-[--foreground] mb-3">{q.question}</p>
                    <div className="flex flex-wrap gap-2">
                      {q.options.map((option) => (
                        <button
                          key={option}
                          onClick={() => handleAnswer(q.id, option)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                            answers[q.id] === option
                              ? 'bg-[#FF9500] text-white'
                              : 'bg-[--background-tertiary] text-[--foreground-secondary] hover:bg-[#FF9500]/20'
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mindset */}
          <div>
            <h3 className="text-base font-semibold text-[--foreground] mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#34C759]/10 text-[#34C759] text-sm flex items-center justify-center">
                {questions.length > 0 ? '3' : '2'}
              </span>
              心态调整
            </h3>
            <div className="bg-[#34C759]/5 border border-[#34C759]/20 rounded-xl p-4">
              <p className="text-[15px] text-[--foreground] leading-relaxed">
                {scenario.mindset}
              </p>
            </div>
          </div>

          {/* Evidence */}
          <div>
            <h3 className="text-base font-semibold text-[--foreground] mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#AF52DE]/10 text-[#AF52DE] text-sm flex items-center justify-center">
                {questions.length > 0 ? '4' : '3'}
              </span>
              证据收集
            </h3>
            <div className="bg-[--background-secondary] rounded-xl p-4">
              <ul className="space-y-2">
                {scenario.evidence.map((item, index) => (
                  <li key={index} className="flex items-start gap-2 text-[15px] text-[--foreground]">
                    <span className="text-[#FF9500] mt-1">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Law Ref */}
          <div>
            <h3 className="text-base font-semibold text-[--foreground] mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#5856D6]/10 text-[#5856D6] text-sm flex items-center justify-center">
                {questions.length > 0 ? '5' : '4'}
              </span>
              法律参考
            </h3>
            <div className="bg-[#5856D6]/5 border border-[#5856D6]/20 rounded-xl p-4">
              <p className="text-[15px] text-[--foreground] leading-relaxed">
                {scenario.lawRef}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--card-border)] space-y-2">
          <button
            onClick={() => {
              if (!allAnswered) {
                if (!showQuestions) {
                  // Show the questions section first
                  setShowQuestions(true);
                } else {
                  // Questions are visible, user wants to skip and go to chat
                  const prefix = `场景ID：${scenario.id}\n场景：${scenario.name}\n${scenario.description}\n\n请根据我的具体情况，生成专属的话术和应对建议：\n\n我的具体情况：`;
                  onCustomize(prefix);
                  onClose();
                }
              } else {
                handleCustomize();
              }
            }}
            className={`w-full py-3.5 rounded-xl text-sm font-medium active:scale-[0.98] transition-all ${
              allAnswered
                ? 'bg-[#007AFF] text-white'
                : showQuestions
                ? 'bg-[#FF9500] text-white'
                : 'bg-[--background-tertiary] text-[--foreground-tertiary]'
            }`}
          >
            {allAnswered
              ? '📝 生成专属话术（更贴合你的情况）'
              : showQuestions
              ? '📝 跳过并生成话术'
              : `继续补充 ${selectedAnswersCount}/${questions.length}`}
          </button>
          <button
            onClick={() => {
              const prefix = `场景ID：${scenario.id}\n场景：${scenario.name}\n${scenario.description}\n\n请根据我的具体情况，生成专属的话术和应对建议：\n\n我的具体情况：`;
              onCustomize(prefix);
              onClose();
            }}
            className="w-full py-2 text-xs text-[--foreground-tertiary] hover:text-[#FF9500] transition-colors"
          >
            跳过，直接输入
          </button>
          <p className="text-xs text-[--foreground-tertiary] text-center">
            定制生成将消耗 1 次对话次数
          </p>
        </div>
      </div>
    </div>
  );
}
