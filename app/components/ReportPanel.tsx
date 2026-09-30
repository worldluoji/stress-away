"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { CompInput } from "@/lib/compensation";
import { getDeviceId } from "@/lib/utils";
import { apiFetch } from "@/lib/request-api";

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
    <strong className="font-semibold text-[#007AFF]">{children}</strong>
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
        if (res.status === 403 && data.error === "paid_only") setGate("activate");
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
          赔偿明细核对 + 证据清单 + 仲裁流程时间线 + 仲裁申请书草稿 + 谈判策略（消耗 1 次额度）
        </p>
      </div>

      <div className="space-y-3">
        {INTAKE_QUESTIONS.map((q) => (
          <div key={q.id}>
            <label className="block text-xs font-medium text-[--foreground-secondary] mb-1.5">
              {q.question}
            </label>
            <select
              value={answers[q.id] || ""}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
              className="w-full rounded-xl bg-[--background-secondary] border border-[var(--card-border)] px-4 py-3 text-[15px] text-[--foreground] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
            >
              <option value="" disabled>请选择</option>
              {q.options.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
        ))}
        <div>
          <label className="block text-xs font-medium text-[--foreground-secondary] mb-1.5">
            事件经过
          </label>
          <textarea
            value={narrative}
            onChange={(e) => setNarrative(e.target.value.slice(0, MAX_NARRATIVE_LENGTH))}
            rows={4}
            placeholder="例如：公司以架构调整为由口头通知我月底走人，只给N不给+1，没给书面文件，周末还让我无偿oncall…"
            className="w-full rounded-xl bg-[--background-secondary] border border-[var(--card-border)] px-4 py-3 text-[15px] text-[--foreground] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 resize-none"
          />
          <span className="text-xs text-[--foreground-tertiary] float-right">
            {narrative.length}/{MAX_NARRATIVE_LENGTH}
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-[#FF3B30]/10 text-[#FF3B30] px-4 py-2.5 rounded-xl text-sm flex items-center justify-between gap-2">
          <span>{error}</span>
          {gate === "activate" && (
            <button onClick={onRequireActivate}
              className="shrink-0 px-3 py-1 rounded-full bg-[#007AFF] text-white text-xs">
              去激活
            </button>
          )}
          {gate === "login" && (
            <button onClick={onRequireLogin}
              className="shrink-0 px-3 py-1 rounded-full bg-[#007AFF] text-white text-xs">
              去登录
            </button>
          )}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#007AFF] to-[#5856D6] text-white font-medium text-[15px] shadow-sm hover:shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
      >
        {loading ? "AI 正在生成维权方案（约需 1~2 分钟），请稍候…" : "生成维权方案报告"}
      </button>

      {report && (
        <div className="rounded-2xl bg-[--background-secondary] border border-[var(--card-border)] p-5 text-[15px] leading-relaxed text-[--foreground] animate-fade-in">
          <ReactMarkdown disallowedElements={["script", "style", "iframe", "object", "embed", "form"]}
            components={markdownComponents}>
            {report}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
