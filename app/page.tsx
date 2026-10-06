"use client";

import { useState, useEffect, useCallback, useRef, startTransition } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import type { ChatMessage } from "@/lib/models";
import { generateMessageId } from "@/lib/models";
import { generateConversationId, generateTitle, type Conversation } from "@/lib/storage";
import { getDeviceId } from "@/lib/utils";
import { SubscriptionActivate } from "./components/SubscriptionActivate";
import { remarkPlugins, markdownComponents, disallowedElements } from "./components/markdown";
import dynamic from 'next/dynamic';
const LoginModal = dynamic(() => import('./components/LoginModal').then(m => ({ default: m.LoginModal })), { ssr: false });
const AccountStatus = dynamic(() => import('./components/LoginModal').then(m => ({ default: m.AccountStatus })), { ssr: false });
import { useAuth } from './components/LoginModal';
import { ScenarioCard } from "./components/ScenarioCard";
import { ScenarioModal } from "./components/ScenarioModal";
import { HistoryPanel } from "./components/HistoryPanel";
import { SavedMessagesPanel } from "./components/SavedMessagesPanel";
import { ShareCard } from "./components/ShareCard";
import { MyStatsPanel } from "./components/MyStatsPanel";
import type { ScenarioTemplate } from "@/lib/scenarios";
import { apiFetch } from '@/lib/request-api';
import { Avatar } from "./components/ui/Avatar";
import { Icon } from "./components/ui/Icon";
import { Button } from "./components/ui/Button";
import { Badge } from "./components/ui/Badge";
import { Modal } from "./components/ui/Modal";
import { Spinner } from "./components/ui/Spinner";
import { ErrorBanner } from "./components/ui/ErrorBanner";

interface UsageStatus {
  allowed: boolean;
  remaining: number;
  isPaid: boolean;
  total: number;
  chatFreeRemaining: number;
  chatFreeTotal: number;
}

// Typing Indicator
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2">
      <span className="w-2 h-2 bg-[var(--foreground-tertiary)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-2 h-2 bg-[var(--foreground-tertiary)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-2 h-2 bg-[var(--foreground-tertiary)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  );
}

export default function Home() {
  const [showEmptyState, setShowEmptyState] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(""); // 显示用完整文本
  const [userText, setUserText] = useState(""); // 用户原始输入（限制600字）
  const [scenarioPrefix, setScenarioPrefix] = useState(""); // 场景前缀（不计入600字）
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [usage, setUsage] = useState<UsageStatus | null>(null);
  const [showActivate, setShowActivate] = useState(false);
  const [deviceId, setDeviceId] = useState<string>("");
  const [isInitializing, setIsInitializing] = useState(true);

  // Scenarios
  const [scenarios, setScenarios] = useState<ScenarioTemplate[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioTemplate | null>(null);

  // History
  const [conversationHistory, setConversationHistory] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | undefined>();
  const [showHistory, setShowHistory] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [activateKey, setActivateKey] = useState(0);
  const [shareContent, setShareContent] = useState('');
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [likedAnimating, setLikedAnimating] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const { user, uid, loading: authLoading, logout } = useAuth();

  const handleLoginSuccess = useCallback(() => {
    // Login succeeded, auth state will update via onAuthStateChange
  }, []);

  const handleToggleLike = useCallback(async (messageId: string) => {
    if (!user) {
      setShowLogin(true);
      return;
    }
    const isLiked = likedIds.has(messageId);
    // Optimistic update
    setLikedIds(prev => {
      const next = new Set(prev);
      if (isLiked) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
    // Trigger animation on like (not unlike)
    if (!isLiked) {
      setLikedAnimating(messageId);
      setTimeout(() => setLikedAnimating(null), 600);
    }
    try {
      const method = isLiked ? 'DELETE' : 'POST';
      await apiFetch(`/api/messages/${messageId}/reaction`, {
        method,
        headers: uid ? { 'X-User-Id': uid } : {},
      });
    } catch {
      // Revert on error
      setLikedIds(prev => {
        const next = new Set(prev);
        if (isLiked) next.add(messageId);
        else next.delete(messageId);
        return next;
      });
    }
  }, [user, likedIds]);

  const handleToggleSave = useCallback(async (messageId: string) => {
    if (!user) {
      setShowLogin(true);
      return;
    }
    const isSaved = savedIds.has(messageId);
    // Find the message for content
    const msg = messages.find(m => m.id === messageId);
    const conv = conversationHistory.find(c => c.id === currentConversationId);
    const msgIndex = messages.indexOf(msg!);
    // Optimistic update
    setSavedIds(prev => {
      const next = new Set(prev);
      if (isSaved) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
    try {
      if (isSaved) {
        await apiFetch(`/api/messages/${messageId}/save`, {
          method: 'DELETE',
          headers: uid ? { 'X-User-Id': uid } : {},
        });
      } else {
        await apiFetch(`/api/messages/${messageId}/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-User-Id': uid || '' },
          body: JSON.stringify({
            conversationId: currentConversationId,
            messageIndex: msgIndex,
            content: msg?.content || '',
            scenarioId: selectedScenario?.id,
          }),
        });
      }
    } catch {
      // Revert on error
      setSavedIds(prev => {
        const next = new Set(prev);
        if (isSaved) next.add(messageId);
        else next.delete(messageId);
        return next;
      });
    }
  }, [user, savedIds, messages, currentConversationId, conversationHistory, selectedScenario]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const id = await getDeviceId();
        setDeviceId(id);

        // Load scenarios (independent of auth)
        const scenariosRes = await apiFetch("/api/scenarios");
        if (scenariosRes.ok) {
          const scenariosData = await scenariosRes.json();
          setScenarios(scenariosData.scenarios || []);
        }

        // Load conversation history from MySQL (logged-in users only)
        if (uid) {
          const res = await apiFetch('/api/conversations', {
            headers: { 'X-User-Id': uid },
          });
          if (res.ok) {
            const data = await res.json();
            setConversationHistory(data.conversations || []);
          }
        }
      } catch {
        // ignore
      } finally {
        setIsInitializing(false);
      }
    };
    init();
  }, [uid]);

  // Fetch usage whenever uid or deviceId changes
  useEffect(() => {
    if (!deviceId) return;
    const fetchUsage = async () => {
      try {
        const headers: Record<string, string> = { "x-device-id": deviceId };
        if (uid) headers["x-user-id"] = uid;
        const res = await apiFetch("/api/usage", { headers });
        if (res.ok) {
          const data = await res.json();
          setUsage(data);
        }
      } catch {
        // ignore
      }
    };
    fetchUsage();
  }, [uid, deviceId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleActivated = useCallback(() => {
    setShowActivate(false);
    const recheck = async () => {
      if (!deviceId) return;
      const headers: Record<string, string> = { "x-device-id": deviceId };
      if (uid) headers["x-user-id"] = uid;
      const res = await apiFetch("/api/usage", { headers });
      if (res.ok) {
        const data = await res.json();
        setUsage(data);
      }
    };
    recheck();
  }, [uid, deviceId]);

  const handleCopy = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      // Clipboard access denied - show fallback
      const textarea = document.createElement("textarea");
      textarea.value = content;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
      } catch {
        // Fallback failed - silently ignore
      } finally {
        document.body.removeChild(textarea);
      }
    }
  };

  const handleScenarioClick = (scenario: ScenarioTemplate) => {
    setSelectedScenario(scenario);
  };

  const handleScenarioCustomize = (prefix: string) => {
    setScenarioPrefix(prefix);
    setInput(prefix);
    setUserText("");
    inputRef.current?.focus();
  };

  const handleSelectConversation = (conv: Conversation) => {
    setMessages(conv.messages);
    setShowEmptyState(false);
    setCurrentConversationId(conv.id);
    setShowHistory(false);
    setInput("");
    setUserText("");
    setScenarioPrefix("");
    setSelectedScenario(null);
    // Focus input for continuing the conversation
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleDeleteConversation = (id: string) => {
    const updated = conversationHistory.filter((c) => c.id !== id);
    setConversationHistory(updated);
    fetch(`/api/conversations/${id}`, {
      method: 'DELETE',
      headers: uid ? { 'X-User-Id': uid } : {},
    });
    if (currentConversationId === id) {
      setCurrentConversationId(undefined);
    }
  };

  const handleSaveConversation = async (newMessages: ChatMessage[]) => {
    if (newMessages.length === 0) return;
    if (!uid) return;

    const title = generateTitle(newMessages);
    const now = Date.now();

    if (currentConversationId) {
      const conv = conversationHistory.find(c => c.id === currentConversationId);
      if (conv) {
        const updatedConv = { ...conv, messages: newMessages, updatedAt: now };
        const updated = conversationHistory.map(c =>
          c.id === currentConversationId ? updatedConv : c
        );
        setConversationHistory(updated);
        fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-User-Id': uid },
          body: JSON.stringify(updatedConv),
        });
      }
    } else {
      const newConv: Conversation = {
        id: generateConversationId(),
        title,
        messages: newMessages,
        createdAt: now,
        updatedAt: now,
      };
      const updated = [newConv, ...conversationHistory].slice(0, 50);
      setConversationHistory(updated);
      fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': uid },
        body: JSON.stringify(newConv),
      });
      setCurrentConversationId(newConv.id);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    if (!usage?.allowed) {
      if (!uid) {
        setShowLogin(true);
      } else {
        setShowActivate(true);
      }
      return;
    }

    const userMessage: ChatMessage = { role: "user", content: userText || input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setError("");

    try {
      const payload: Record<string, unknown> = {
        messages: newMessages,
        scenarioId: selectedScenario?.id,
      };
      const chatHeaders = {
        "Content-Type": "application/json",
        "X-User-Id": uid || "",
        "x-device-id": deviceId,
      };
      let res = await apiFetch("/api/chat", {
        method: "POST",
        headers: chatHeaders,
        body: JSON.stringify(payload),
      });
      let data = await res.json();

      // 402：今日免费对话已用完，需用户确认消耗购买额度后重发
      if (res.status === 402 && data.error === "chat_quota_confirm") {
        const confirmed = window.confirm(data.message);
        if (!confirmed) {
          setInput(userMessage.content);
          setMessages(messages);
          return;
        }
        res = await apiFetch("/api/chat", {
          method: "POST",
          headers: chatHeaders,
          body: JSON.stringify({ ...payload, confirmPaid: true }),
        });
        data = await res.json();
      }

      if (!res.ok) throw new Error(data.message || data.error || "请求失败");
      const reply = data.reply
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
        .trim();
      const replyMsg = { role: "assistant" as const, content: reply, id: generateMessageId() };
      setMessages([...newMessages, replyMsg]);
      handleSaveConversation([...newMessages, replyMsg]);

      // Keep scenario context for follow-up messages
      if (selectedScenario) {
        // Keep scenario selected
      }

      if (data.quota) {
        setUsage(data.quota);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[var(--glass-bg)] backdrop-blur-xl border-b border-[var(--card-border)]">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHistory(true)}
                aria-label="历史对话"
                className="w-9 h-9 flex items-center justify-center rounded-full bg-[var(--background-secondary)] text-[var(--foreground-tertiary)] hover:bg-[var(--apple-gray-light)] hover:text-[var(--foreground)] transition-all active:scale-95"
              >
                <Icon name="clock" size={18} />
              </button>
              {user && (
                <button
                  onClick={() => setShowStats(true)}
                  aria-label="我的统计"
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-[var(--background-secondary)] text-[var(--foreground-tertiary)] hover:bg-[var(--apple-gray-light)] hover:text-[var(--foreground)] transition-all active:scale-95"
                >
                  <Icon name="trending-up" size={18} />
                </button>
              )}
              {user && (
                <button
                  onClick={() => setShowSaved(true)}
                  aria-label="收藏的话术"
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-[var(--background-secondary)] text-[var(--foreground-tertiary)] hover:bg-[var(--apple-gray-light)] hover:text-[var(--foreground)] transition-all active:scale-95"
                >
                  <Icon name="bookmark" size={18} />
                </button>
              )}
              {messages.length > 0 && (
                <button
                  onClick={() => {
                    setShowEmptyState(true);
                    setInput("");
                    setUserText("");
                    setScenarioPrefix("");
                    setSelectedScenario(null);
                  }}
                  aria-label="新建对话"
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-[var(--background-secondary)] text-[var(--foreground-tertiary)] hover:bg-[var(--apple-gray-light)] hover:text-[var(--foreground)] transition-all active:scale-95"
                >
                  <Icon name="arrow-left" size={18} />
                </button>
              )}
              <div className="flex flex-col ml-2">
                <h1 className="text-[var(--text-h2)] font-semibold text-[var(--foreground)] tracking-tight leading-tight">
                  反PUA手册
                </h1>
                <p className="text-xs text-[var(--foreground-tertiary)]">
                  裁员赔偿估算 · 职场维权助手
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <AccountStatus
                user={user}
                onLogout={logout}
                onLoginClick={() => setShowLogin(true)}
              />
              {usage && !isInitializing && (
                <Badge tone={usage.isPaid ? "success" : "neutral"}>
                  {usage.isPaid ? (
                    <>
                      <Icon name="check" size={11} strokeWidth={2.4} />
                      {usage.remaining} 份报告 · 今日对话 {usage.chatFreeRemaining}/{usage.chatFreeTotal}
                    </>
                  ) : (
                    <>今日对话 {usage.chatFreeRemaining}/{usage.chatFreeTotal}</>
                  )}
                </Badge>
              )}
              {usage && !isInitializing && user && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => { setActivateKey((k) => k + 1); setShowActivate(true); }}
                >
                  {usage.isPaid ? '叠加' : '升级'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Scenario Modal */}
      {selectedScenario && (
        <ScenarioModal
          scenario={selectedScenario}
          onClose={() => setSelectedScenario(null)}
          onCustomize={handleScenarioCustomize}
        />
      )}

      {/* History Panel */}
      {showHistory && (
        <HistoryPanel
          conversations={conversationHistory}
          currentConversationId={currentConversationId}
          onSelect={handleSelectConversation}
          onDelete={handleDeleteConversation}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Saved Messages Panel */}
      {showSaved && (
        <SavedMessagesPanel
          onClose={() => setShowSaved(false)}
          onSelect={(messageId) => {
            setShowSaved(false);
          }}
        />
      )}

      {/* Share Card Modal */}
      {showShare && (
        <ShareCard
          content={shareContent}
          scenario={selectedScenario?.name}
          onClose={() => setShowShare(false)}
        />
      )}

      {/* My Stats Modal */}
      {showStats && (
        <MyStatsPanel onClose={() => setShowStats(false)} />
      )}

      {/* Activation Modal */}
      <Modal
        open={showActivate}
        onClose={() => setShowActivate(false)}
        title="激活订阅"
        size="md"
        hideCloseButton
      >
        <div className="relative">
          <SubscriptionActivate key={activateKey} onActivated={handleActivated} />
        </div>
      </Modal>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-6">
          {/* Empty state with scenarios */}
          {showEmptyState && !isInitializing && (
            <div className="animate-fade-in">
              {/* Hero */}
              <div className="hero-glow text-center py-10 mb-8">
                <div className="relative w-20 h-20 mx-auto mb-5 rounded-3xl bg-gradient-to-br from-[var(--color-brand)] to-[var(--color-brand-alt)] flex items-center justify-center shadow-[var(--shadow-prominent)] ring-1 ring-white/20">
                  <Icon name="lightbulb" size={36} strokeWidth={1.5} className="text-white" />
                </div>
                <h2 className="text-[var(--text-h1)] font-bold text-[var(--foreground)] mb-2 tracking-tight">
                  被裁员？先算算你该拿多少钱
                </h2>
                <p className="text-sm text-[var(--foreground-tertiary)] max-w-xs mx-auto mb-6 leading-relaxed">
                  免费估算 N+1 / 2N 法定赔偿，一键生成维权方案与仲裁申请书
                </p>
                <Link
                  href="/labor"
                  className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-2xl text-[15px] font-medium text-white bg-gradient-to-r from-[var(--color-brand)] to-[var(--color-brand-alt)] shadow-sm hover:shadow-[var(--shadow-moderate)] hover:-translate-y-px transition-all duration-[var(--dur-base)] ease-[var(--ease-out)] active:scale-[0.97]"
                >
                  算我的赔偿
                  <Icon name="arrow-right" size={16} strokeWidth={2.2} />
                </Link>
              </div>

              {/* Example prompts for new users */}
              <div className="mb-8">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground-secondary)] mb-3">
                  <Icon name="message-circle" size={16} className="text-[var(--color-brand)]" />
                  免费应对话术
                </h3>
                <div className="space-y-2">
                  {[
                    '领导当众说我能力不行，该怎么反击？',
                    '同事把我的方案据为己有向领导邀功',
                    '公司要求免费加班，不给调休合法吗？',
                  ].map((example, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setInput(example);
                        inputRef.current?.focus();
                      }}
                      className="group/example w-full text-left px-4 py-3.5 bg-[var(--background-secondary)] hover:bg-[var(--background-secondary)]/70 rounded-xl text-sm text-[var(--foreground-secondary)] transition-all border border-[var(--card-border)] hover:border-[var(--color-brand)]/30 hover:shadow-[var(--shadow-subtle)]"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Icon
                          name="chevron-right"
                          size={14}
                          className="text-[var(--foreground-tertiary)] group-hover/example:text-[var(--color-brand)] transition-colors"
                        />
                        {example}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Scenarios Grid */}
              <div className="mb-6">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground-secondary)] mb-3">
                  <Icon name="folder-open" size={16} className="text-[var(--color-brand)]" />
                  进阶：常见职场困境应对话术
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {scenarios.map((scenario) => (
                    <ScenarioCard
                      key={scenario.id}
                      scenario={scenario}
                      onClick={() => handleScenarioClick(scenario)}
                    />
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 h-px bg-[var(--card-border)]" />
                <span className="text-xs text-[var(--foreground-tertiary)]">或直接输入</span>
                <div className="flex-1 h-px bg-[var(--card-border)]" />
              </div>
            </div>
          )}

          {isInitializing && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Spinner size={28} />
              <span className="text-xs text-[var(--foreground-tertiary)]">加载历史与额度…</span>
            </div>
          )}

          <div className="flex flex-col gap-5">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-3 animate-fade-in ${
                  msg.role === "user" ? "flex-row-reverse" : "flex-row"
                }`}
              >
                <Avatar role={msg.role} size="md" />
                <div
                  className={`flex-1 max-w-[80%] sm:max-w-[75%] ${
                    msg.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`rounded-2xl px-4 py-3 text-[15px] leading-relaxed shadow-[var(--shadow-subtle)] ${
                      msg.role === "user"
                        ? "bg-gradient-to-r from-[var(--color-brand)] to-[var(--color-brand-alt)] text-white rounded-br-md"
                        : "bg-[var(--background-secondary)] text-[var(--foreground)] rounded-bl-md border border-[var(--card-border)]"
                    }`}
                  >
                    {msg.role === "user" ? (
                      msg.content
                    ) : (
                      <>
                        <div className="group">
                          <ReactMarkdown
                            remarkPlugins={remarkPlugins}
                            disallowedElements={disallowedElements}
                            components={markdownComponents}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      </>
                    )}
                  </div>
                  {msg.role === "assistant" && (
                    <div className="flex items-center gap-1 mt-1.5 ml-1">
                      <button
                        onClick={() => handleCopy(msg.content, i)}
                        aria-label="复制"
                        className="p-1.5 rounded-lg hover:bg-[var(--background-secondary)] text-[var(--foreground-tertiary)] hover:text-[var(--color-success)] transition-colors"
                      >
                        {copiedIndex === i ? (
                          <Icon name="check" size={14} strokeWidth={2.4} className="text-[var(--color-success)]" />
                        ) : (
                          <Icon name="copy" size={14} />
                        )}
                      </button>
                      <button
                        onClick={() => { setShareContent(msg.content); setShowShare(true); }}
                        aria-label="分享"
                        title="分享卡片"
                        className="p-1.5 rounded-lg hover:bg-[var(--background-secondary)] text-[var(--foreground-tertiary)] hover:text-[var(--color-brand)] transition-colors"
                      >
                        <Icon name="share" size={14} />
                      </button>
                      {msg.id && (
                        <>
                          <button
                            onClick={() => handleToggleLike(msg.id!)}
                            aria-label={likedIds.has(msg.id!) ? '取消点赞' : '点赞'}
                            className={`p-1.5 rounded-lg hover:bg-[var(--background-secondary)] transition-colors ${likedIds.has(msg.id!) || likedAnimating === msg.id ? 'text-[var(--color-warning)]' : 'text-[var(--foreground-tertiary)]'}`}
                          >
                            <span
                              className={`inline-block transition-transform duration-[var(--dur-base)] ${likedAnimating === msg.id ? 'animate-spring' : ''}`}
                            >
                              <Icon
                                name="heart"
                                size={14}
                                filled={likedIds.has(msg.id!)}
                              />
                            </span>
                          </button>
                          <button
                            onClick={() => handleToggleSave(msg.id!)}
                            aria-label={savedIds.has(msg.id!) ? '取消收藏' : '收藏'}
                            className={`p-1.5 rounded-lg hover:bg-[var(--background-secondary)] transition-colors ${savedIds.has(msg.id!) ? 'text-[var(--color-brand)]' : 'text-[var(--foreground-tertiary)]'}`}
                          >
                            <Icon
                              name={savedIds.has(msg.id!) ? "bookmark-check" : "bookmark"}
                              size={14}
                              filled={savedIds.has(msg.id!)}
                            />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-3 animate-fade-in">
                <Avatar role="assistant" size="md" />
                <div className="bg-[var(--background-secondary)] border border-[var(--card-border)] rounded-2xl rounded-bl-md shadow-[var(--shadow-subtle)]">
                  <TypingIndicator />
                </div>
              </div>
            )}

            {error && (
              <div className="flex justify-center animate-fade-in">
                <ErrorBanner
                  message={error}
                  onRetry={() => {
                    setError("");
                    if (input.trim()) handleSubmit({ preventDefault: () => {} } as React.FormEvent);
                  }}
                />
              </div>
            )}
          </div>
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <footer className="sticky bottom-0 bg-[var(--glass-bg)] backdrop-blur-xl border-t border-[var(--card-border)]">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  const newValue = e.target.value;
                  // 只允许用户在 userText 区域输入（前缀之后）
                  if (scenarioPrefix && newValue.startsWith(scenarioPrefix)) {
                    const newUserText = newValue.slice(scenarioPrefix.length);
                    if (newUserText.length <= 600) {
                      setUserText(newUserText);
                      setInput(scenarioPrefix + newUserText);
                    }
                  } else if (!scenarioPrefix) {
                    // 无场景前缀时，直接限制600字
                    const newUserText = newValue.slice(0, 600);
                    setUserText(newUserText);
                    setInput(newUserText);
                  }
                }}
                placeholder={usage?.allowed ? "输入职场困境..." : "今日次数已用完"}
                disabled={loading || (!usage?.allowed && !isInitializing)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                rows={1}
                className="w-full rounded-2xl bg-[var(--background-secondary)] px-5 py-4 text-[var(--foreground)] placeholder:text-[var(--foreground-tertiary)] text-[15px] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30 border border-transparent focus:border-[var(--color-brand)]/20 disabled:opacity-50 transition-all duration-[var(--dur-base)] ease-[var(--ease-out)] resize-none"
                style={{ minHeight: '80px', maxHeight: '200px' }}
              />
              <span className="absolute bottom-2 right-3 text-xs text-[var(--foreground-tertiary)]">
                {userText.length}/600
              </span>
            </div>
            <button
              type="submit"
              disabled={loading || !input.trim() || (!usage?.allowed && !isInitializing)}
              aria-label="发送"
              className="shrink-0 h-12 w-12 rounded-2xl bg-gradient-to-br from-[var(--color-brand)] to-[var(--color-brand-alt)] text-white flex items-center justify-center transition-all duration-[var(--dur-base)] ease-[var(--ease-out)] active:scale-95 disabled:opacity-40 disabled:active:scale-100 shadow-sm hover:shadow-[var(--shadow-moderate)] hover:-translate-y-px"
            >
              {loading ? <Spinner size={18} /> : <Icon name="send" size={18} strokeWidth={2.2} />}
            </button>
          </form>
          <style jsx global>{`
            input[type="text"] {
              -webkit-appearance: none;
              appearance: none;
            }
          `}</style>
        </div>
      </footer>

      {/* Login Modal */}
      <LoginModal
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        onSuccess={handleLoginSuccess}
      />
    </div>
  );
}
