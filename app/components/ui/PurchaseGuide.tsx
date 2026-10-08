'use client';

// 与订阅发放模型绑定：管理员线下收款后在后台加次数，微信号是唯一购买入口
const WECHAT_ID = 'jmst_cute';

export function PurchaseGuide() {
  return (
    <div className="space-y-4 px-5 pb-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-1">如何获得报告次数</h2>
        <p className="text-sm text-[var(--foreground-tertiary)]">
          维权报告次数由管理员发放，购买后永久有效
        </p>
      </div>

      <div className="bg-[var(--background-secondary)] rounded-xl p-4 text-center">
        <p className="text-sm text-[var(--foreground-secondary)]">添加微信，说明需要维权报告次数</p>
        <p className="mt-2 font-mono text-lg tracking-wider text-[#007AFF]">{WECHAT_ID}</p>
      </div>

      <p className="text-xs text-[var(--foreground-tertiary)] text-center leading-relaxed">
        每日免费对话额度不受影响；次数到账后回到本页重新生成即可。
      </p>
    </div>
  );
}
