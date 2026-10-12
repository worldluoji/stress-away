"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { CompInput } from "@/lib/compensation";
import { CompensationForm } from "@/app/components/CompensationForm";
import { ReportPanel } from "@/app/components/ReportPanel";
import { LaborHistoryPanel } from "@/app/components/LaborHistoryPanel";
import dynamic from "next/dynamic";
const LoginModal = dynamic(() => import("@/app/components/LoginModal").then(m => ({ default: m.LoginModal })), { ssr: false });
import { useAuth } from "@/app/components/LoginModal";
import { Icon } from "@/app/components/ui/Icon";
import { Section } from "@/app/components/ui/Section";
import { Badge } from "@/app/components/ui/Badge";
import { apiFetch } from "@/lib/request-api";
import { getDeviceId } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics-client";
import type { UsageStatus } from "@/lib/subscription";
import type { LaborReport } from "@/lib/labor-reports";

export default function LaborPage() {
  const [comp, setComp] = useState<CompInput | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [usage, setUsage] = useState<UsageStatus | null>(null);
  const [deviceId, setDeviceId] = useState<string>("");
  const [history, setHistory] = useState<LaborReport[]>([]);
  const [historyDegraded, setHistoryDegraded] = useState(false);
  const { user, uid } = useAuth();

  const calculatorTracked = useRef(false);
  const handleCompChange = useCallback((c: CompInput) => {
    setComp(c);
    // 免费钩子被使用：首次拿到有效估算结果时上报一次
    if (!calculatorTracked.current) {
      calculatorTracked.current = true;
      trackEvent("calculator", { meta: { city: c.city } });
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const id = await getDeviceId();
      setDeviceId(id);
    };
    init();
  }, []);

  const fetchUsage = useCallback(async () => {
    if (!deviceId) return;
    try {
      const headers: Record<string, string> = { "x-device-id": deviceId };
      const res = await apiFetch("/api/usage", { headers });
      if (res.ok) {
        const data = await res.json();
        setUsage(data);
      }
    } catch {
      /* ignore */
    }
  }, [uid, deviceId]);

  useEffect(() => {
    if (!deviceId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUsage();
  }, [fetchUsage, deviceId]);

  const fetchHistory = useCallback(async () => {
    if (!uid) return;
    try {
      const headers: Record<string, string> = { "x-device-id": deviceId };
      const res = await apiFetch("/api/labor-reports", { headers });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.reports ?? []);
        setHistoryDegraded(!!data.degraded);
      }
    } catch {
      /* ignore */
    }
  }, [uid, deviceId]);

  const handleDeleteReport = useCallback(async (id: string) => {
    if (!uid) return;
    try {
      await apiFetch(`/api/labor-reports/${id}`, {
        method: "DELETE",
        headers: { "x-device-id": deviceId },
      });
      setHistory((prev) => prev.filter((r) => r.id !== id));
    } catch {
      /* ignore */
    }
  }, [uid, deviceId]);

  return (
    <div className="flex flex-col min-h-screen bg-[var(--background)]">
      <header className="sticky top-0 z-20 bg-[var(--glass-bg)] backdrop-blur-xl border-b border-[var(--card-border)]">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center gap-3">
          <Link
            href="/"
            aria-label="返回"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-[var(--background-secondary)] text-[var(--foreground-tertiary)] hover:bg-[var(--apple-gray-light)] hover:text-[var(--foreground)] transition-all active:scale-95"
          >
            <Icon name="arrow-left" size={18} />
          </Link>
          <div className="flex flex-col flex-1">
            <h1 className="text-[var(--text-h2)] font-semibold text-[var(--foreground)] tracking-tight leading-tight">劳动维权助手</h1>
            <p className="text-xs text-[var(--foreground-tertiary)]">裁员赔偿 · 欠薪仲裁 · 免费估算</p>
          </div>
          {uid && (
            <button
              onClick={() => { setShowHistory(true); fetchHistory(); }}
              aria-label="报告历史"
              className="w-9 h-9 flex items-center justify-center rounded-full bg-[var(--background-secondary)] text-[var(--foreground-tertiary)] hover:bg-[var(--apple-gray-light)] hover:text-[var(--foreground)] transition-all active:scale-95"
            >
              <Icon name="clock" size={18} />
            </button>
          )}
          {usage && deviceId && (
            <Badge tone={usage.isPaid ? "success" : "neutral"}>
              {usage.isPaid ? (
                <>
                  <Icon name="check" size={11} strokeWidth={2.4} />
                  {usage.remaining} 份报告
                </>
              ) : (
                <>报告次数由管理员发放</>
              )}
            </Badge>
          )}
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-4 py-6 space-y-8">
          <div className="hero-glow text-center pt-2 pb-4">
            <h2 className="text-[var(--text-h1)] font-bold text-[var(--foreground)] mb-2 tracking-tight">
              被裁员？先算算你该拿多少钱
            </h2>
            <p className="text-sm text-[var(--foreground-tertiary)]">
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
            <span className="text-xs text-[var(--foreground-tertiary)]">下一步</span>
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
              onRequireLogin={() => setShowLogin(true)}
              onUsageChanged={() => { fetchUsage(); fetchHistory(); }}
            />
          </Section>

          <footer className="text-center text-xs text-[var(--foreground-tertiary)] pb-4">
            各地封顶基数见计算器结果页「数据来源」，实际权益以劳动仲裁委员会/法院认定为准。
            {user ? "" : " 维权报告次数由管理员发放，需登录使用。"}
          </footer>
        </div>
      </main>

      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} onSuccess={() => setShowLogin(false)} />

      {showHistory && (
        <LaborHistoryPanel
          reports={history}
          degraded={historyDegraded}
          onDelete={handleDeleteReport}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}
