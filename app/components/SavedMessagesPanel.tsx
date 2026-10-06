'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './LoginModal';
import { apiFetch } from '@/lib/request-api';
import { Icon } from './ui/Icon';
import { Badge } from './ui/Badge';
import { Spinner } from './ui/Spinner';
import { EmptyState } from './ui/EmptyState';

interface SavedMessage {
  messageId: string;
  content: string;
  conversationId: string;
  scenarioId?: string;
  createdAt: number;
}

interface SavedMessagesPanelProps {
  onClose: () => void;
  onSelect?: (messageId: string) => void;
}

export function SavedMessagesPanel({ onClose, onSelect }: SavedMessagesPanelProps) {
  const { uid } = useAuth();
  const [messages, setMessages] = useState<SavedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewingMessage, setViewingMessage] = useState<SavedMessage | null>(null);

  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        const res = await apiFetch('/api/messages/saved', { headers: { 'X-User-Id': uid } });
        if (res.status === 401) {
          setError('请先登录');
          return;
        }
        // 即使返回非200也显示空状态，不显示报错
        const data = await res.json();
        setMessages(data.messages || []);
        setError(null);
      } catch {
        // 网络错误也显示空状态
        setMessages([]);
        setError(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [uid]);

  const handleUnsave = async (messageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await apiFetch(`/api/messages/${messageId}/save`, {
        method: 'DELETE',
        headers: uid ? { 'X-User-Id': uid } : {},
      });
      if (res.ok) {
        setMessages(prev => prev.filter(m => m.messageId !== messageId));
      }
    } catch {
      // network error - silent, leave message in list
    }
  };

  const handleCopy = async (messageId: string, content: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(messageId);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const panel = (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[80vh] mx-4 bg-[var(--card-bg)] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scale-in border border-[var(--card-border)]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--card-border)]">
          <h2 className="text-[var(--text-h3)] font-semibold text-[var(--foreground)]">我的收藏</h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--foreground-tertiary)] hover:bg-[var(--background-secondary)] hover:text-[var(--foreground)] transition-all active:scale-95"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Spinner label="加载中…" />
            </div>
          )}

          {error && (
            <div className="text-center py-12 text-[var(--foreground-tertiary)]">
              {error}
            </div>
          )}

          {!loading && !error && messages.length === 0 && (
            <EmptyState
              icon="bookmark"
              title="还没有收藏"
              description="收藏喜欢的回复，方便以后复习"
            />
          )}

          {!loading && !error && messages.length > 0 && (
            <div className="space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.messageId}
                  className="bg-[var(--background-secondary)] rounded-xl p-4 hover:bg-[var(--background-secondary)]/70 transition-colors border border-transparent hover:border-[var(--card-border)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[var(--foreground)] text-sm line-clamp-4 whitespace-pre-wrap">
                        {msg.content}
                      </p>
                      {msg.scenarioId && (
                        <span className="inline-block mt-2">
                          <Badge tone="brand">场景对话</Badge>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setViewingMessage(msg)}
                        aria-label="查看"
                        className="p-1.5 rounded-lg hover:bg-[var(--card-bg)] text-[var(--foreground-tertiary)] hover:text-[var(--foreground)] transition-colors"
                      >
                        <Icon name="eye" size={14} />
                      </button>
                      <button
                        onClick={() => handleCopy(msg.messageId, msg.content)}
                        aria-label="复制"
                        className="p-1.5 rounded-lg hover:bg-[var(--card-bg)] text-[var(--foreground-tertiary)] transition-colors text-xs min-w-[2.5rem] flex items-center justify-center"
                      >
                        {copiedId === msg.messageId ? (
                          <span className="inline-flex items-center gap-1 text-[var(--color-success)]">
                            <Icon name="check" size={14} strokeWidth={2.4} />
                            已复制
                          </span>
                        ) : (
                          <Icon name="copy" size={14} />
                        )}
                      </button>
                      <button
                        onClick={(e) => handleUnsave(msg.messageId, e)}
                        aria-label="取消收藏"
                        className="p-1.5 rounded-lg hover:bg-[var(--card-bg)] text-[var(--color-brand)] transition-colors"
                      >
                        <Icon name="bookmark-check" size={14} filled />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--foreground-tertiary)] mt-2">
                    {new Date(msg.createdAt).toLocaleDateString('zh-CN')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const modal = viewingMessage ? (
    <div className="fixed inset-0 z-[60] flex items-center justify-center animate-fade-in">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setViewingMessage(null)} />
      <div className="relative w-full max-w-xl mx-4 bg-[var(--card-bg)] rounded-2xl shadow-2xl overflow-hidden animate-scale-in border border-[var(--card-border)]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--card-border)]">
          <h3 className="text-base font-semibold text-[var(--foreground)]">消息详情</h3>
          <button
            onClick={() => setViewingMessage(null)}
            aria-label="关闭"
            className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--foreground-tertiary)] hover:bg-[var(--background-secondary)] hover:text-[var(--foreground)] transition-all active:scale-95"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          <p className="text-[var(--foreground)] text-sm whitespace-pre-wrap leading-relaxed">
            {viewingMessage.content}
          </p>
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-[var(--card-border)]">
          <button
            onClick={() => {
              handleCopy(viewingMessage.messageId, viewingMessage.content);
              setViewingMessage(null);
            }}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[var(--color-brand)] to-[var(--color-brand-alt)] text-white text-sm font-medium hover:shadow-[var(--shadow-moderate)] hover:-translate-y-px transition-all active:scale-95"
          >
            复制
          </button>
          <button
            onClick={() => setViewingMessage(null)}
            className="flex-1 py-2.5 rounded-xl border border-[var(--card-border)] text-[var(--foreground)] text-sm font-medium hover:bg-[var(--background-secondary)] transition-all active:scale-95"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {modal}
      {panel}
    </>
  );
}