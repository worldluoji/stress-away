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
          <Link href="/"
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[--background-secondary] text-[--foreground-tertiary] hover:bg-[--apple-gray-light] transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold text-[--foreground] tracking-tight">劳动维权助手</h1>
            <p className="text-xs text-[--foreground-tertiary]">裁员赔偿 · 欠薪仲裁 · 免费估算</p>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-4 py-6 space-y-8">
          <div className="text-center">
            <h2 className="text-xl font-bold text-[--foreground] mb-2">
              被裁员？先算算你该拿多少钱
            </h2>
            <p className="text-sm text-[--foreground-tertiary]">
              依据《劳动合同法》第40/47/87条即时估算，免费、无需登录
            </p>
          </div>

          <section>
            <CompensationForm onChangeComp={handleCompChange} />
          </section>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[var(--card-border)]" />
            <span className="text-xs text-[--foreground-tertiary]">下一步</span>
            <div className="flex-1 h-px bg-[var(--card-border)]" />
          </div>

          <section className="rounded-2xl border border-[var(--card-border)] p-5">
            <ReportPanel
              comp={comp}
              uid={uid}
              onRequireActivate={() => { setActivateKey(k => k + 1); setShowActivate(true); }}
              onRequireLogin={() => setShowLogin(true)}
            />
          </section>

          <footer className="text-center text-xs text-[--foreground-tertiary] pb-4">
            赔偿封顶参照 {SOCIAL_WAGE_DATA_AS_OF} 前后公布的各地社平工资，金额与实际权益以劳动仲裁委员会/法院认定为准。
            {user ? "" : " 维权报告需登录并绑定激活码。"}
          </footer>
        </div>
      </main>

      {showActivate && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={(e) => e.target === e.currentTarget && setShowActivate(false)}
        >
          <div className="w-full sm:max-w-md bg-[--card-bg] rounded-t-2xl sm:rounded-2xl shadow-2xl animate-slide-up sm:animate-scale-in overflow-hidden border border-[var(--card-border)] bg-white dark:bg-neutral-900">
            <div className="pt-4 sm:pt-5 relative">
              <button
                onClick={() => setShowActivate(false)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-[--background-secondary] text-[--foreground-tertiary] hover:bg-[--apple-gray-light] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <SubscriptionActivate key={activateKey} onActivated={() => setShowActivate(false)} />
            </div>
          </div>
        </div>
      )}

      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} onSuccess={() => setShowLogin(false)} />
    </div>
  );
}
