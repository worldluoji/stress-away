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
    <h2 className="font-semibold text-[--foreground] mt-4 mb-2 first:mt-0 text-base">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="font-semibold text-[--foreground] mt-3 mb-1">{children}</h3>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-2 list-disc pl-4 space-y-1">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-2 list-decimal pl-4 space-y-1">{children}</ol>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-[--color-brand]">{children}</strong>
  ),
};

interface Props {
  comp: CompInput | null;
  uid: string | null;
  onRequireActivate: () => void;
  onRequireLogin: () => void;
}

export function ReportPanel({ comp, uid, onRequireActivate, onRequireLogin }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [narrative, setNarrative] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState("");
  const [gate, setGate] = useState<"none" | "login" | "activate">("none");
  const [error, setError] = useState("");

  const handleSubmit = async () => {
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
    setLoading(true);
    try {
      const deviceId = await getDeviceId();
      const res = await apiFetch("/api/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": uid,
          "x-device-id": deviceId,
        },
        body: JSON.stringify({ comp, intakeAnswers: answers, narrative }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 && data.error === "login_required") setGate("login");
        else if (res.status === 403 && data.error === "paid_only") setGate("activate");
        else if (res.status === 403 && data.error === "no_quota") setGate("activate");
        setError(data.message || "生成失败，请稍后再试");
        return;
      }
      setReport(data.reply);
    } catch {
      setError("网络错误，请稍后再试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-[--foreground] mb-1">生成完整维权方案报告</h3>
        <p className="text-xs text-[--foreground-tertiary]">
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
        <div className="relative w-full py-3.5 rounded-2xl bg-gradient-to-r from-[--color-brand] to-[--color-brand-alt] text-white text-center overflow-hidden opacity-90">
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-0 left-0 h-0.5 w-1/3 bg-white/40 animate-progress" />
          </div>
          <span className="inline-flex items-center justify-center gap-2 text-[15px] font-medium">
            <Spinner size={16} />
            AI 正在生成维权策略…
          </span>
          <p className="text-xs opacity-80 mt-1">约需 1~2 分钟，请勿关闭页面</p>
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
        <Card padding="md" className="text-[15px] leading-relaxed text-[--foreground] animate-fade-in">
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
