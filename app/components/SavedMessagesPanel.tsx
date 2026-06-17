'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './LoginModal';
import { apiFetch } from '@/lib/request-api';

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
    if (uid) fetchSavedMessages();
  }, [uid]);

  const fetchSavedMessages = async () => {
    try {
      const res = await apiFetch('/api/messages/saved', {
        headers: uid ? { 'X-User-Id': uid } : {},
      });
      if (res.status === 401 || !uid) {
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
  };

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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[80vh] mx-4 bg-[--card-bg] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[--card-border]">
          <h2 className="text-lg font-semibold text-[--foreground]">我的收藏</h2>
          <button
            onClick={onClose}
            className="p-1 text-[--foreground-tertiary] hover:text-[--foreground]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <span className="text-[--foreground-tertiary]">加载中...</span>
            </div>
          )}

          {error && (
            <div className="text-center py-12 text-[--foreground-tertiary]">
              {error}
            </div>
          )}

          {!loading && !error && messages.length === 0 && (
            <div className="text-center py-12">
              <svg className="w-12 h-12 mx-auto mb-3 text-[--foreground-tertiary]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              <p className="text-[--foreground-tertiary]">还没有收藏</p>
              <p className="text-xs text-[--foreground-tertiary] mt-1">收藏喜欢的回复，方便以后复习</p>
            </div>
          )}

          {!loading && !error && messages.length > 0 && (
            <div className="space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.messageId}
                  className="bg-[--background-secondary] rounded-xl p-4 hover:bg-[--background-tertiary] transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[--foreground] text-sm line-clamp-4 whitespace-pre-wrap">
                        {msg.content}
                      </p>
                      {msg.scenarioId && (
                        <span className="inline-block mt-2 px-2 py-0.5 bg-[#007AFF]/10 text-[#007AFF] text-xs rounded-full">
                          场景对话
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setViewingMessage(msg)}
                        className="p-1.5 rounded-lg hover:bg-[--card-bg] text-[--foreground-tertiary] transition-colors"
                        title="查看"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleCopy(msg.messageId, msg.content)}
                        className="p-1.5 rounded-lg hover:bg-[--card-bg] text-[--foreground-tertiary] transition-colors text-xs min-w-[2.5rem] flex items-center justify-center"
                        title="复制"
                      >
                        {copiedId === msg.messageId ? (
                          <span className="text-[#34C759]">已复制</span>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={(e) => handleUnsave(msg.messageId, e)}
                        className="p-1.5 rounded-lg hover:bg-[--card-bg] text-[#007AFF] transition-colors"
                        title="取消收藏"
                      >
                        <svg className="w-4 h-4" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-[--foreground-tertiary] mt-2">
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setViewingMessage(null)} />
      <div className="relative w-full max-w-xl mx-4 bg-[--card-bg] rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[--card-border]">
          <h3 className="text-base font-semibold text-[--foreground]">消息详情</h3>
          <button
            onClick={() => setViewingMessage(null)}
            className="p-1 text-[--foreground-tertiary] hover:text-[--foreground]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          <p className="text-[--foreground] text-sm whitespace-pre-wrap leading-relaxed">
            {viewingMessage.content}
          </p>
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-[--card-border]">
          <button
            onClick={() => {
              handleCopy(viewingMessage.messageId, viewingMessage.content);
              setViewingMessage(null);
            }}
            className="flex-1 py-2 rounded-xl bg-[#007AFF] text-white text-sm font-medium hover:bg-[#007AFF]/90 transition-colors"
          >
            复制
          </button>
          <button
            onClick={() => setViewingMessage(null)}
            className="flex-1 py-2 rounded-xl border border-[--card-border] text-[--foreground] text-sm font-medium hover:bg-[--card-bg] transition-colors"
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