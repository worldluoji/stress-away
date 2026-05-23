'use client';

import type { Conversation } from '@/lib/storage';

interface Props {
  conversations: Conversation[];
  currentConversationId?: string;
  onSelect: (conv: Conversation) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function HistoryPanel({ conversations, currentConversationId, onSelect, onDelete, onClose }: Props) {
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="absolute inset-y-0 left-0 w-full max-w-xs bg-[--card-bg] shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-4 py-4 border-b border-[var(--card-border)] flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[--foreground]">历史记录</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[--background-secondary] text-[--foreground-tertiary] hover:bg-[--apple-gray-light] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[--foreground-tertiary]">
              <svg className="w-12 h-12 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm">暂无历史记录</p>
            </div>
          ) : (
            <div className="py-2">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`group px-4 py-3 flex items-start gap-3 hover:bg-[--background-secondary] cursor-pointer transition-colors ${
                    conv.id === currentConversationId ? 'bg-[--background-secondary]' : ''
                  }`}
                  onClick={() => onSelect(conv)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[--foreground] truncate">{conv.title}</p>
                    <p className="text-xs text-[--foreground-tertiary] mt-0.5">{formatTime(conv.updatedAt)}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(conv.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 w-8 h-8 flex items-center justify-center rounded-full hover:bg-[--apple-gray-light] text-[--foreground-tertiary] transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}