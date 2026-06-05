'use client';

import { useState, useEffect, useCallback } from 'react';

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
  const [messages, setMessages] = useState<SavedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSavedMessages();
  }, []);

  const fetchSavedMessages = async () => {
    try {
      const res = await fetch('/api/messages/saved');
      if (res.status === 401) {
        setError('请先登录');
        return;
      }
      if (!res.ok) throw new Error('获取收藏失败');
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取收藏失败');
    } finally {
      setLoading(false);
    }
  };

  const handleUnsave = async (messageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/messages/${messageId}/save`, { method: 'DELETE' });
      if (res.ok) {
        setMessages(prev => prev.filter(m => m.messageId !== messageId));
      }
    } catch {
      // ignore
    }
  };

  const handleCopy = async (content: string) => {
    await navigator.clipboard.writeText(content);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[80vh] mx-4 bg-white dark:bg-[--card-bg] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[--border]">
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

        {/* Content */}
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
                        onClick={() => handleCopy(msg.content)}
                        className="p-1.5 rounded-lg hover:bg-[--card-bg] text-[--foreground-tertiary] transition-colors"
                        title="复制"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
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
}