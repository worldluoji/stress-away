"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { LaborReport } from "@/lib/labor-reports";
import { markdownToDocxBlob, triggerDocxDownload } from "@/lib/report-docx";
import { copyTextToClipboard } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics-client";
import { useAuth } from "./LoginModal";
import { Icon } from "./ui/Icon";
import { EmptyState } from "./ui/EmptyState";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

interface Props {
  reports: LaborReport[];
  onDelete: (id: string) => void;
  onClose: () => void;
}

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

export function LaborHistoryPanel({ reports, onDelete, onClose }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [failedCopyId, setFailedCopyId] = useState<string | null>(null);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [downloadError, setDownloadError] = useState("");
  const { uid } = useAuth();

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "今天";
    if (diffDays === 1) return "昨天";
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  };

  async function handleCopy(report: LaborReport) {
    const ok = await copyTextToClipboard(report.reply);
    if (ok) setCopiedId(report.id);
    else setFailedCopyId(report.id);
    setTimeout(() => {
      setCopiedId(null);
      setFailedCopyId(null);
    }, 2000);
  }

  async function handleDownload(report: LaborReport) {
    setDownloadError("");
    setDownloadingIds((prev) => new Set(prev).add(report.id));
    try {
      const blob = await markdownToDocxBlob(report.reply, {
        generatedAt: new Date(report.createdAt),
      });
      triggerDocxDownload(blob, `维权方案报告_${new Date(report.createdAt).toISOString().slice(0, 10)}`);
      trackEvent("report_download", { uid });
    } catch (err) {
      console.error("[labor-history] docx download failed:", err);
      setDownloadError("Word 生成失败，请稍后重试");
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(report.id);
        return next;
      });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      <div className="absolute inset-y-0 right-0 w-full max-w-md bg-[var(--card-bg)] shadow-2xl flex flex-col animate-slide-up border-l border-[var(--card-border)]">
        <div className="px-4 py-4 border-b border-[var(--card-border)] flex items-center justify-between">
          <h2 className="text-[var(--text-h3)] font-semibold text-[var(--foreground)]">维权报告历史</h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--background-secondary)] text-[var(--foreground-tertiary)] hover:bg-[var(--apple-gray-light)] hover:text-[var(--foreground)] transition-all active:scale-95"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {downloadError && (
            <div className="px-4 py-2 text-xs text-[var(--color-danger)] bg-[var(--color-danger)]/10 animate-fade-in">
              {downloadError}
            </div>
          )}
          {reports.length === 0 ? (
            <EmptyState
              icon="file-text"
              title="暂无报告历史"
              description="生成过的维权方案报告会自动保存至此（最多 50 条），关闭页面也能找回"
            />
          ) : (
            <div className="divide-y divide-[var(--card-border)]">
              {reports.map((r) => {
                const expanded = expandedId === r.id;
                return (
                  <div key={r.id} className="px-4 py-3">
                    <div
                      className="flex items-start gap-3 cursor-pointer hover:bg-[var(--background-secondary)] -mx-2 px-2 py-1.5 rounded-lg transition-colors"
                      onClick={() => setExpandedId(expanded ? null : r.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--foreground)]">
                          {r.comp.city} · 预计 ¥{r.computation.total.toLocaleString("zh-CN")}
                        </p>
                        <p className="text-xs text-[var(--foreground-tertiary)] mt-0.5">
                          {formatTime(r.createdAt)} · {r.narrative.slice(0, 30)}{r.narrative.length > 30 ? "…" : ""}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm("确定要删除这份报告吗？此操作不可恢复。")) {
                            onDelete(r.id);
                          }
                        }}
                        aria-label="删除报告"
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--apple-gray-light)] text-[var(--foreground-tertiary)] hover:text-[var(--color-danger)] transition-all"
                      >
                        <Icon name="x" size={14} />
                      </button>
                    </div>
                    {expanded && (
                      <Card padding="md" className="mt-2 text-sm leading-relaxed text-[var(--foreground)]">
                        <div className="flex items-center justify-end gap-1 mb-3">
                          <Button
                            size="sm"
                            variant="ghost"
                            leftIcon={<Icon name="copy" size={14} />}
                            onClick={() => handleCopy(r)}
                          >
                            {copiedId === r.id
                              ? "已复制"
                              : failedCopyId === r.id
                                ? "复制失败"
                                : "复制全文"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            leftIcon={<Icon name="download" size={14} />}
                            onClick={() => handleDownload(r)}
                            disabled={downloadingIds.has(r.id)}
                          >
                            {downloadingIds.has(r.id) ? "生成中…" : "下载 Word"}
                          </Button>
                        </div>
                        <ReactMarkdown
                          disallowedElements={["script", "style", "iframe", "object", "embed", "form"]}
                          components={markdownComponents}
                        >
                          {r.reply}
                        </ReactMarkdown>
                      </Card>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
