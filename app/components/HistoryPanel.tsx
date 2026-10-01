'use client';

import type { Conversation } from '@/lib/storage';
import { Icon } from './ui/Icon';
import { EmptyState } from './ui/EmptyState';

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
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="absolute inset-y-0 left-0 w-full max-w-xs bg-[var(--card-bg)] shadow-2xl flex flex-col animate-slide-up border-r border-[var(--card-border)]">
        {/* Header */}
        <div className="px-4 py-4 border-b border-[var(--card-border)] flex items-center justify-between">
          <h2 className="text-[var(--text-h3)] font-semibold text-[var(--foreground)]">历史记录</h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--background-secondary)] text-[var(--foreground-tertiary)] hover:bg-[var(--apple-gray-light)] hover:text-[var(--foreground)] transition-all active:scale-95"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <EmptyState
              icon="clock"
              title="暂无历史记录"
              description="最多保存50条。更换设备、更换浏览器或清理缓存将导致记录丢失。"
            />
          ) : (
            <div className="py-2">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`group px-4 py-3 flex items-start gap-3 hover:bg-[var(--background-secondary)] cursor-pointer transition-colors ${
                    conv.id === currentConversationId ? 'bg-[var(--background-secondary)]' : ''
                  }`}
                  onClick={() => onSelect(conv)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--foreground)] truncate">{conv.title}</p>
                    <p className="text-xs text-[var(--foreground-tertiary)] mt-0.5">{formatTime(conv.updatedAt)} · {conv.messages.length} 条消息</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(conv.id);
                    }}
                    aria-label="删除对话"
                    className="opacity-0 group-hover:opacity-100 w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--apple-gray-light)] text-[var(--foreground-tertiary)] hover:text-[var(--color-danger)] transition-all"
                  >
                    <Icon name="x" size={14} />
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