"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { CompInput } from "@/lib/compensation";
import { getDeviceId } from "@/lib/utils";
import { apiFetch } from "@/lib/request-api";
import { Select } from "./ui/Select";
import { Textarea } from "./ui/Textarea";
import { Button } from "./ui/Button";
import { Spinner } from "./ui/Spinner";
import { ErrorBanner } from "./ui/ErrorBanner";
import { EmptyState } from "./ui/EmptyState";
import { Card } from "./ui/Card";
import { Icon } from "./ui/Icon";
import { markdownToDocxBlob, triggerDocxDownload } from "@/lib/report-docx";

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

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="font-semibold text-[var(--foreground)] mt-4 mb-2 first:mt-0 text-base">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="font-semibold text-[var(--foreground)] mt-3 mb-1">{children}</h3>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-2 list-disc pl-4 space-y-1">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-2 list-decimal pl-4 space-y-1">{children}</ol>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-[var(--color-brand)]">{children}</strong>
  ),
};

interface Props {
  comp: CompInput | null;
  uid: string | null;
  onRequireActivate: () => void;
  onRequireLogin: () => void;
  onUsageChanged?: () => void;
}

export function ReportPanel({ comp, uid, onRequireActivate, onRequireLogin, onUsageChanged }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [narrative, setNarrative] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState("");
  const [rawReply, setRawReply] = useState("");
  const [warning, setWarning] = useState("");
  const [gate, setGate] = useState<"none" | "login" | "activate">("none");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function postReport(confirmPaid: boolean): Promise<Response> {
    const deviceId = await getDeviceId();
    return apiFetch("/api/report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": uid ?? "",
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
      return;
    }
    setGate("none");
    setError("");
    setWarning("");
    setReport("");
    setRawReply("");
    setLoading(true);
    try {
      // 第一步：不带 confirmPaid，看后端是否要确认
      const r1 = await postReport(false);
      if (r1.status === 402) {
        const data = await r1.json();
        const confirmed = window.confirm(
          `${data.message || "本次生成将消耗 1 次报告额度"}（剩余 ${data.paidRemaining} 次），是否继续？`
        );
        if (!confirmed) return;
        // 第二步：用户确认后重发（带 confirmPaid=true 应直接通过；后端 finalRemaining 防御 race）
        const r2 = await postReport(true);
        const data2 = await r2.json();
        if (!r2.ok) {
          if (data2.error === "settle_failed" && data2.reply) {
            setReport(data2.reply);
            setRawReply(data2.reply);
            setWarning(data2.message || "次数扣除异常，请联系客服补偿");
            onUsageChanged?.();
            return;
          }
          handleErrorResponse(r2, data2);
          return;
        }
        setReport(data2.reply);
        setRawReply(data2.reply);
        setWarning(data2.warning || "");
        onUsageChanged?.();
        return;
      }
      const data1 = await r1.json();
      if (!r1.ok) {
        if (data1.error === "settle_failed" && data1.reply) {
          setReport(data1.reply);
          setRawReply(data1.reply);
          setWarning(data1.message || "次数扣除异常，请联系客服补偿");
          onUsageChanged?.();
          return;
        }
        handleErrorResponse(r1, data1);
        return;
      }
      setReport(data1.reply);
      setRawReply(data1.reply);
      setWarning(data1.warning || "");
      onUsageChanged?.();
    } catch {
      setError("网络错误，请稍后再试");
    } finally {
      setLoading(false);
    }
  }

  function handleErrorResponse(res: Response, data: { error?: string; message?: string }) {
    if (res.status === 403 && data.error === "login_required") setGate("login");
    else if (res.status === 403 && data.error === "paid_only") setGate("activate");
    else if (res.status === 403 && data.error === "no_quota") setGate("activate");
    setError(data.message || "生成失败，请稍后再试");
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(rawReply);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = rawReply;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
      } catch {
        /* fallback 失败，忽略 */
      } finally {
        document.body.removeChild(textarea);
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const blob = await markdownToDocxBlob(rawReply, { uid: uid ?? undefined });
      triggerDocxDownload(blob, `维权方案报告_${new Date().toISOString().slice(0, 10)}`);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-[var(--foreground)] mb-1">生成完整维权方案报告</h3>
        <p className="text-xs text-[var(--foreground-tertiary)]">
          赔偿明细核对 + 证据清单 + 仲裁流程时间线 + 仲裁申请书草稿 + 谈判策略（消耗 1 次报告额度，每日 10 次免费对话不受影响）
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
          onAction={gate === "activate" ? onRequireActivate : gate === "login" ? onRequireLogin : undefined}
          actionLabel={gate === "login" ? "去登录" : "去激活"}
        />
      )}

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
                {copied ? "已复制" : "复制全文"}
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
          <ReactMarkdown
            disallowedElements={["script", "style", "iframe", "object", "embed", "form"]}
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
          description="填写工资、入职日期和离职情形后，可生成完整的维权方案与仲裁申请书草稿"
        />
      )}
    </div>
  );
}
