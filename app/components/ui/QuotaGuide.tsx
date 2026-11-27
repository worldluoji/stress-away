'use client';

// 演示项目的额度说明：额度由部署者自行配置，不涉及任何收款渠道。
export function QuotaGuide() {
  return (
    <div className="space-y-4 px-5 pb-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-1">关于报告额度</h2>
        <p className="text-sm text-[var(--foreground-tertiary)]">
          这是开源演示项目，报告次数由部署者配置，不收取任何费用
        </p>
      </div>

      <div className="bg-[var(--background-secondary)] rounded-xl p-4 text-sm text-[var(--foreground-secondary)] leading-relaxed space-y-2">
        <p>本地运行时，可在 <code className="font-mono text-[var(--color-brand)]">/admin</code> 为演示账号发放次数；没有 MySQL 时报告仍可生成，但历史记录暂不可用。</p>
        <p>部署与初始化步骤见项目 README。</p>
      </div>

      <p className="text-xs text-[var(--foreground-tertiary)] text-center leading-relaxed">
        报告内容由 AI 生成，仅供学习参考，不构成法律意见，请以劳动仲裁机构/法院认定为准。
      </p>
    </div>
  );
}
