"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { computeCompensation, type CompInput } from "@/lib/compensation";
import { getDeviceId, copyTextToClipboard } from "@/lib/utils";
import { apiFetch } from "@/lib/request-api";
import { trackEvent } from "@/lib/analytics-client";
import { Select } from "./ui/Select";
import { Textarea } from "./ui/Textarea";
import { Button } from "./ui/Button";
import { Spinner } from "./ui/Spinner";
import { ErrorBanner } from "./ui/ErrorBanner";
import { EmptyState } from "./ui/EmptyState";
import { Modal } from "./ui/Modal";
import { QuotaGuide } from "./ui/QuotaGuide";
import { Card } from "./ui/Card";
import { Icon } from "./ui/Icon";
import { markdownToDocxBlob, triggerDocxDownload } from "@/lib/report-docx";
import { remarkPlugins, markdownComponents, disallowedElements, extractToc, headingId } from "./markdown";

const MAX_NARRATIVE_LENGTH = 600;

const INTAKE_QUESTIONS: { id: string; question: string; options: string[] }[] = [
  {
    id: "目前的情况",
    question: "目前的情况是？",
    options: ["公司通知裁员", "被暗示主动离职", "绩效不合格待优化", "协商解除中", "已被辞退"],
  },
  {
    id: "公司方案",
    question: "公司目前给出的方案是？",
    options: ["还没谈，不知道", "N+1赔偿", "低于N+1", "要求主动离职无赔偿"],
  },
];

interface Props {
  comp: CompInput | null;
  uid: string | null;
  onRequireLogin: () => void;
  onUsageChanged?: () => void;
}

export function ReportPanel({ comp, uid, onRequireLogin, onUsageChanged }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [narrative, setNarrative] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState("");
  const [rawReply, setRawReply] = useState("");
  const [warning, setWarning] = useState("");
  const [gate, setGate] = useState<"none" | "login" | "purchase">("none");
  const [showGuide, setShowGuide] = useState(false);
  const [error, setError] = useState("");
  const [copyState, setCopyState] = useState<"copied" | "failed" | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<{ paidRemaining: number } | null>(null);
  const toc = report ? extractToc(report) : [];

  async function postReport(confirmPaid: boolean): Promise<Response> {
    const deviceId = await getDeviceId();
    return apiFetch("/api/report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-device-id": deviceId,
      },
      body: JSON.stringify({ comp, intakeAnswers: answers, narrative, confirmPaid }),
    });
  }

  async function handleSubmit() {
    if (!comp) {
      setError("请先填写上方的赔偿计算信息");
      return;
    }
    if (narrative.trim().length === 0) {
      setError("请简要描述事件经过（这是AI分析的关键输入）");
      return;
    }
    if (!uid) {
      setGate("login");
      trackEvent("login_gate");
      return;
    }
    setGate("none");
    setError("");
    setWarning("");
    setReport("");
    setRawReply("");
    setLoading(true);
    try {
      // 探测：不带 confirmPaid，若后端要求确认则弹自绘 Modal（探测不计限流）
      const r1 = await postReport(false);
      if (r1.status === 402) {
        const data = await r1.json();
        setPendingConfirm({ paidRemaining: data.paidRemaining });
        trackEvent("paywall_view");
        return;
      }
      await handleResult(r1);
    } catch {
      setError("网络错误，请稍后再试");
    } finally {
      setLoading(false);
    }
  }

  async function handleResult(res: Response) {
    const data = await res.json();
    if (!res.ok) {
      if (data.error === "settle_failed" && data.reply) {
        setReport(data.reply);
        setRawReply(data.reply);
        setWarning(data.message || "额度扣除异常，请刷新后核对");
        onUsageChanged?.();
        return;
      }
      handleErrorResponse(res, data);
      return;
    }
    setReport(data.reply);
    setRawReply(data.reply);
    setWarning(data.warning || "");
    onUsageChanged?.();
  }

  async function runGeneration() {
    setPendingConfirm(null);
    trackEvent("paywall_confirm");
    setLoading(true);
    try {
      // confirmPaid=true 真实生成；后端 finalRemaining 防御 race
      await handleResult(await postReport(true));
    } catch {
      setError("网络错误，请稍后再试");
    } finally {
      setLoading(false);
    }
  }

  function handleCancelConfirm() {
    if (pendingConfirm) trackEvent("paywall_cancel");
    setPendingConfirm(null);
  }

  function handleErrorResponse(res: Response, data: { error?: string; message?: string }) {
    if (res.status === 403 && data.error === "login_required") setGate("login");
    else if (res.status === 403 && data.error === "paid_only") setGate("purchase");
    else if (res.status === 403 && data.error === "no_quota") setGate("purchase");
    setError(data.message || "生成失败，请稍后再试");
  }

  async function handleCopy() {
    const ok = await copyTextToClipboard(rawReply);
    setCopyState(ok ? "copied" : "failed");
    setTimeout(() => setCopyState(null), 2000);
  }

  async function handleDownload() {
    setDownloading(true);
    setError("");
    try {
      const blob = await markdownToDocxBlob(rawReply, { uid: uid ?? undefined });
      triggerDocxDownload(blob, `维权方案报告_${new Date().toISOString().slice(0, 10)}`);
      trackEvent("report_download");
    } catch (err) {
      console.error("[report] docx download failed:", err);
      setError("Word 生成失败，请稍后重试");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Modal open={pendingConfirm !== null} onClose={handleCancelConfirm} title="确认生成报告" size="sm">
        <div className="px-5 pt-6 pb-5">
          <h3 className="text-base font-semibold text-[var(--foreground)] mb-4">确认生成维权报告</h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-xl bg-[var(--background-secondary)] px-4 py-3">
              <span className="text-[var(--foreground-secondary)]">剩余演示额度</span>
              <span className="font-semibold text-[var(--foreground)]">
                {pendingConfirm?.paidRemaining} 次 → 本次后 {Math.max((pendingConfirm?.paidRemaining ?? 1) - 1, 0)} 次
              </span>
            </div>
            {comp && (
              <div className="flex items-center justify-between rounded-xl bg-[var(--background-secondary)] px-4 py-3">
                <span className="text-[var(--foreground-secondary)]">估算可主张金额</span>
                <span className="font-semibold text-[var(--color-brand)]">
                  ¥{computeCompensation(comp).total.toLocaleString("zh-CN")}
                </span>
              </div>
            )}
            <p className="text-xs text-[var(--foreground-tertiary)] leading-relaxed">
              报告包含：赔偿明细核对 · 证据清单 · 仲裁流程时间线 · 仲裁申请书草稿 · 谈判策略（AI 生成，仅供参考，提交前请律师复核）
            </p>
            <p className="text-xs text-[var(--foreground-tertiary)]">每日 10 次免费对话不受影响；报告仅供学习参考，不构成法律意见。</p>
          </div>
          <div className="flex gap-2 mt-5">
            <Button variant="ghost" size="lg" fullWidth onClick={handleCancelConfirm}>
              取消
            </Button>
            <Button variant="primary" size="lg" fullWidth onClick={runGeneration}>
              确认生成（消耗 1 次额度）
            </Button>
          </div>
        </div>
      </Modal>
      <div>
        <h3 className="text-base font-semibold text-[var(--foreground)] mb-1">生成完整维权方案报告</h3>
        <p className="text-xs text-[var(--foreground-tertiary)]">
          赔偿明细核对 + 证据清单 + 仲裁流程时间线 + 仲裁申请书草稿 + 谈判策略（消耗 1 次演示额度；AI 生成，仅供参考）
        </p>
      </div>

      <div className="space-y-3">
        {INTAKE_QUESTIONS.map((q) => (
          <Select
            key={q.id}
            name={q.id}
            label={q.question}
            value={answers[q.id] || ""}
            onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
            options={q.options.map((o) => ({ value: o, label: o }))}
            placeholder="请选择"
          />
        ))}
        <Textarea
          name="narrative"
          label="事件经过"
          value={narrative}
          onChange={(e) => setNarrative(e.target.value.slice(0, MAX_NARRATIVE_LENGTH))}
          rows={4}
          maxLengthIndicator={MAX_NARRATIVE_LENGTH}
          placeholder="例如：公司以架构调整为由口头通知我月底走人，只给N不给+1，没给书面文件，周末还让我无偿oncall…"
        />
      </div>

      {error && (
        <ErrorBanner
          message={error}
          onAction={gate === "purchase" ? () => setShowGuide(true) : gate === "login" ? onRequireLogin : undefined}
          actionLabel={gate === "login" ? "去登录" : "额度说明"}
        />
      )}

      <Modal open={showGuide} onClose={() => setShowGuide(false)} title="关于报告额度" size="md">
        <QuotaGuide />
      </Modal>

      {loading ? (
        <div className="relative w-full py-4 rounded-2xl bg-[var(--card-bg)] border border-[var(--color-brand)]/30 text-center overflow-hidden shadow-[var(--shadow-subtle)]">
          <div className="absolute top-0 left-0 right-0 h-0.5 overflow-hidden">
            <div className="absolute top-0 left-0 h-full w-1/3 bg-gradient-to-r from-transparent via-[var(--color-brand)] to-[var(--color-brand-alt)] animate-progress" />
          </div>
          <span className="inline-flex items-center justify-center gap-2 text-[15px] font-medium text-[var(--foreground)]">
            <Spinner size={16} />
            AI 正在生成维权策略…
          </span>
          <p className="text-xs text-[var(--foreground-tertiary)] mt-1">约需 1~2 分钟，请勿关闭页面</p>
        </div>
      ) : (
        <Button
          onClick={handleSubmit}
          variant="primary"
          size="lg"
          fullWidth
        >
          生成维权方案报告
        </Button>
      )}

      {report && (
        <Card padding="md" className="text-[15px] leading-relaxed text-[var(--foreground)] animate-fade-in">
          {warning && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/30 text-xs text-[var(--foreground-secondary)] flex items-start gap-2">
              <Icon name="alert-circle" size={14} className="shrink-0 mt-0.5 text-[var(--color-warning)]" />
              <span>{warning}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 mb-3">
            <h4 className="text-sm font-semibold text-[var(--foreground-secondary)]">维权方案报告</h4>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                leftIcon={<Icon name="copy" size={14} />}
                onClick={handleCopy}
              >
                {copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制全文"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                leftIcon={<Icon name="download" size={14} />}
                onClick={handleDownload}
                disabled={downloading}
              >
                {downloading ? "生成中…" : "下载 Word"}
              </Button>
            </div>
          </div>
          {toc.length > 1 && (
            <nav aria-label="报告目录" className="flex gap-1.5 overflow-x-auto pb-3">
              {toc.map((t) => (
                <button
                  key={t}
                  onClick={() =>
                    document.getElementById(headingId(t))?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                  className="shrink-0 px-2.5 py-1 rounded-full text-xs bg-[var(--background-secondary)] text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors"
                >
                  {t}
                </button>
              ))}
            </nav>
          )}
          <ReactMarkdown
            remarkPlugins={remarkPlugins}
            disallowedElements={disallowedElements}
            components={markdownComponents}
          >
            {report}
          </ReactMarkdown>
        </Card>
      )}

      {!report && !loading && !comp && (
        <EmptyState
          icon="file-text"
          title="先完成上方估算"
          description="填写工资、入职日期和离职情形后，可生成维权方案参考稿（AI 生成，仅供参考）"
        />
      )}
    </div>
  );
}
