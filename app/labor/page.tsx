"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import type { CompInput } from "@/lib/compensation";
import { SOCIAL_WAGE_DATA_AS_OF } from "@/lib/social-wage";
import { CompensationForm } from "@/app/components/CompensationForm";
import { ReportPanel } from "@/app/components/ReportPanel";
import { SubscriptionActivate } from "@/app/components/SubscriptionActivate";
import dynamic from "next/dynamic";
const LoginModal = dynamic(() => import("@/app/components/LoginModal").then(m => ({ default: m.LoginModal })), { ssr: false });
import { useAuth } from "@/app/components/LoginModal";
import { Icon } from "@/app/components/ui/Icon";
import { Modal } from "@/app/components/ui/Modal";
import { Section } from "@/app/components/ui/Section";

export default function LaborPage() {
  const [comp, setComp] = useState<CompInput | null>(null);
  const [showActivate, setShowActivate] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [activateKey, setActivateKey] = useState(0);
  const { user, uid } = useAuth();

  const handleCompChange = useCallback((c: CompInput) => setComp(c), []);

  return (
    <div className="flex flex-col min-h-screen bg-[--background]">
      <header className="sticky top-0 z-20 bg-[--glass-bg] backdrop-blur-xl border-b border-[var(--card-border)]">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center gap-3">
          <Link
            href="/"
            aria-label="返回"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-[--background-secondary] text-[--foreground-tertiary] hover:bg-[--apple-gray-light] hover:text-[--foreground] transition-all active:scale-95"
          >
            <Icon name="arrow-left" size={18} />
          </Link>
          <div className="flex flex-col">
            <h1 className="text-[--text-h2] font-semibold text-[--foreground] tracking-tight leading-tight">劳动维权助手</h1>
            <p className="text-xs text-[--foreground-tertiary]">裁员赔偿 · 欠薪仲裁 · 免费估算</p>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-4 py-6 space-y-8">
          <div className="hero-glow text-center pt-2 pb-4">
            <h2 className="text-[--text-h1] font-bold text-[--foreground] mb-2 tracking-tight">
              被裁员？先算算你该拿多少钱
            </h2>
            <p className="text-sm text-[--foreground-tertiary]">
              依据《劳动合同法》第40/47/87条即时估算，免费、无需登录
            </p>
          </div>

          <Section
            step={1}
            title="估算你的法定赔偿"
            description="填写工资与日期，实时看到可主张金额"
          >
            <CompensationForm onChangeComp={handleCompChange} />
          </Section>

          <div className="flex items-center gap-3 py-2">
            <div className="flex-1 h-px bg-[var(--card-border)]" />
            <span className="text-xs text-[--foreground-tertiary]">下一步</span>
            <div className="flex-1 h-px bg-[var(--card-border)]" />
          </div>

          <Section
            step={2}
            title="生成维权方案报告"
            description="赔偿核对 + 证据清单 + 仲裁申请书草稿（消耗 1 次报告额度）"
            icon="file-text"
          >
            <ReportPanel
              comp={comp}
              uid={uid}
              onRequireActivate={() => { setActivateKey(k => k + 1); setShowActivate(true); }}
              onRequireLogin={() => setShowLogin(true)}
            />
          </Section>

          <footer className="text-center text-xs text-[--foreground-tertiary] pb-4">
            赔偿封顶参照 {SOCIAL_WAGE_DATA_AS_OF} 前后公布的各地社平工资，金额与实际权益以劳动仲裁委员会/法院认定为准。
            {user ? "" : " 维权报告需登录并绑定激活码。"}
          </footer>
        </div>
      </main>

      <Modal
        open={showActivate}
        onClose={() => setShowActivate(false)}
        title="激活订阅"
        size="md"
        hideCloseButton
      >
        <SubscriptionActivate key={activateKey} onActivated={() => setShowActivate(false)} />
      </Modal>

      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} onSuccess={() => setShowLogin(false)} />
    </div>
  );
}
