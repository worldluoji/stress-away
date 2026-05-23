"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import type { ChatMessage } from "@/lib/models";
import { loadMessages, saveMessages, loadHistory, saveHistory, generateConversationId, generateTitle, type Conversation } from "@/lib/storage";
import { SubscriptionActivate } from "./components/SubscriptionActivate";
import { ScenarioCard } from "./components/ScenarioCard";
import { ScenarioModal } from "./components/ScenarioModal";
import { HistoryPanel } from "./components/HistoryPanel";
import type { ScenarioTemplate } from "@/lib/scenarios";

interface UsageStatus {
  allowed: boolean;
  remaining: number;
  isPaid: boolean;
  total: number;
}

async function getDeviceId(): Promise<string> {
  const fp = await FingerprintJS.load();
  const result = await fp.get();
  return result.visitorId;
}

// AI Assistant Avatar
function AssistantAvatar() {
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#007AFF] to-[#5856D6] flex items-center justify-center shadow-sm shrink-0">
      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    </div>
  );
}

// User Avatar
function UserAvatar() {
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#34C759] to-[#30D158] flex items-center justify-center shadow-sm shrink-0">
      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    </div>
  );
}

// Typing Indicator
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2">
      <span className="w-2 h-2 bg-[#8E8E93] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-2 h-2 bg-[#8E8E93] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-2 h-2 bg-[#8E8E93] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const saved = loadMessages();
    if (saved.length > 0) {
      setMessages(saved);
      setShowEmptyState(false);
    }
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      setShowEmptyState(false);
      saveMessages(messages);
    }
  }, [messages]);

  useEffect(() => {
    const init = async () => {
      try {
        const id = await getDeviceId();
        setDeviceId(id);
        const res = await fetch("/api/usage", {
          headers: { "x-device-id": id },
        });
        if (res.ok) {
          const data = await res.json();
          setUsage(data);
        }

        // Load scenarios
        const scenariosRes = await fetch("/api/scenarios");
        if (scenariosRes.ok) {
          const scenariosData = await scenariosRes.json();
          setScenarios(scenariosData.scenarios || []);
        }

        // Load conversation history
        const history = loadHistory();
        setConversationHistory(history);
      } catch {
        // ignore
      } finally {
        setIsInitializing(false);
      }
    };
    init();
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleActivated = useCallback(() => {
    setShowActivate(false);
    const recheck = async () => {
      if (!deviceId) return;
      const res = await fetch("/api/usage", {
        headers: { "x-device-id": deviceId },
      });
      if (res.ok) {
        const data = await res.json();
        setUsage(data);
      }
    };
    recheck();
  }, [deviceId]);

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

  const handleScenarioCustomize = () => {
    const prefix = `场景ID：${selectedScenario?.id}\n场景：${selectedScenario?.name}\n${selectedScenario?.description}\n\n请根据我的具体情况，生成专属的话术和应对建议：\n\n我的具体情况：`;
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
  };

  const handleDeleteConversation = (id: string) => {
    const updated = conversationHistory.filter((c) => c.id !== id);
    setConversationHistory(updated);
    saveHistory({ conversations: updated });
    if (currentConversationId === id) {
      setCurrentConversationId(undefined);
    }
  };

  const handleSaveConversation = (newMessages: ChatMessage[]) => {
    if (newMessages.length === 0) return;

    const title = generateTitle(newMessages);
    const now = Date.now();

    if (currentConversationId) {
      // Update existing conversation
      const updated = conversationHistory.map((c) =>
        c.id === currentConversationId
          ? { ...c, messages: newMessages, updatedAt: now }
          : c
      );
      setConversationHistory(updated);
      saveHistory({ conversations: updated });
    } else {
      // Create new conversation
      const newConv: Conversation = {
        id: generateConversationId(),
        title,
        messages: newMessages,
        createdAt: now,
        updatedAt: now,
      };
      const updated = [newConv, ...conversationHistory].slice(0, 50); // Keep max 50 conversations
      setConversationHistory(updated);
      saveHistory({ conversations: updated });
      setCurrentConversationId(newConv.id);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    if (!usage?.allowed) {
      setShowActivate(true);
      return;
    }

    const userMessage: ChatMessage = { role: "user", content: userText || input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          scenarioId: selectedScenario?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const reply = data.reply
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
        .trim();
      setMessages([...newMessages, { role: "assistant", content: reply }]);
      handleSaveConversation([...newMessages, { role: "assistant", content: reply }]);

      // Keep scenario context for follow-up messages
      if (selectedScenario) {
        // Keep scenario selected
      }

      if (deviceId) {
        const usageRes = await fetch("/api/usage/consume", {
          method: "POST",
          headers: { "x-device-id": deviceId },
        });
        if (usageRes.ok) {
          const usageData = await usageRes.json();
          setUsage((prev) =>
            prev
              ? {
                  ...prev,
                  remaining: usageData.remaining,
                  isPaid: usageData.isPaid,
                }
              : null
          );
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[--background]">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[--glass-bg] backdrop-blur-xl border-b border-[var(--card-border)]">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowHistory(true)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-[--background-secondary] text-[--foreground-tertiary] hover:bg-[--apple-gray-light] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              {messages.length > 0 && (
                <button
                  onClick={() => {
                    setShowEmptyState(true);
                    setInput("");
                    setUserText("");
                    setScenarioPrefix("");
                    setSelectedScenario(null);
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-[--background-secondary] text-[--foreground-tertiary] hover:bg-[--apple-gray-light] transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}
              <div className="flex flex-col">
                <h1 className="text-xl font-semibold text-[--foreground] tracking-tight">
                  反PUA手册
                </h1>
                <p className="text-xs text-[--foreground-tertiary]">
                  职场困境应对指南
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {usage && !isInitializing && (
                <span
                  className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                    usage.isPaid
                      ? "bg-[#34C759]/10 text-[#34C759]"
                      : "bg-[--background-secondary] text-[--foreground-tertiary]"
                  }`}
                >
                  {usage.isPaid
                    ? `${usage.remaining} 次可用`
                    : `${usage.remaining}/${usage.total} 次`}
                </span>
              )}
              {!usage?.isPaid && !isInitializing && usage && (
                <button
                  onClick={() => setShowActivate(true)}
                  className="px-4 py-1.5 rounded-full text-xs font-medium bg-[#007AFF] text-white hover:bg-[#007AFF]/90 transition-all active:scale-95"
                >
                  激活
                </button>
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

      {/* Activation Modal */}
      {showActivate && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={(e) => e.target === e.currentTarget && setShowActivate(false)}
        >
          <div className="w-full sm:max-w-md bg-[#FAFAFA] rounded-t-2xl sm:rounded-2xl shadow-2xl animate-slide-up sm:animate-scale-in overflow-hidden border border-[var(--card-border)]">
            <div className="hidden sm:block relative">
              <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 bg-[--apple-gray-light] rounded-full" />
            </div>
            <div className="pt-4 sm:pt-5">
              <button
                onClick={() => setShowActivate(false)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-[--background-secondary] text-[--foreground-tertiary] hover:bg-[--apple-gray-light] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <SubscriptionActivate onActivated={handleActivated} />
            </div>
          </div>
        </div>
      )}

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-6">
          {/* Empty state with scenarios */}
          {showEmptyState && !isInitializing && (
            <div className="animate-fade-in">
              {/* Hero */}
              <div className="text-center py-8 mb-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#007AFF] to-[#5856D6] flex items-center justify-center shadow-lg">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-[--foreground] mb-2">
                  有什么职场困扰吗？
                </h2>
                <p className="text-sm text-[--foreground-tertiary] max-w-xs mx-auto">
                  选择常见场景获取话术模板，或输入具体情况定制生成
                </p>
              </div>

              {/* Scenarios Grid */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-[--foreground-secondary] mb-3">
                  📂 常见职场困境
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
                <span className="text-xs text-[--foreground-tertiary]">或直接输入</span>
                <div className="flex-1 h-px bg-[var(--card-border)]" />
              </div>
            </div>
          )}

          {isInitializing && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-10 h-10 rounded-full border-2 border-[--apple-blue] border-t-transparent animate-spin" />
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
                {msg.role === "assistant" ? <AssistantAvatar /> : <UserAvatar />}
                <div
                  className={`flex-1 max-w-[80%] sm:max-w-[75%] ${
                    msg.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
                      msg.role === "user"
                        ? "bg-gradient-to-r from-[#007AFF] to-[#5856D6] text-white rounded-br-md"
                        : "bg-[--background-secondary] text-[--foreground] rounded-bl-md border border-[var(--card-border)]"
                    }`}
                  >
                    {msg.role === "user" ? (
                      msg.content
                    ) : (
                      <>
                        <div className="group">
                          <ReactMarkdown
                            components={{
                              p: ({ children }) => (
                                <p className="mb-2 last:mb-0">{children}</p>
                              ),
                              strong: ({ children }) => (
                                <strong className="font-semibold text-[#007AFF]">{children}</strong>
                              ),
                              ul: ({ children }) => (
                                <ul className="mb-2 list-disc pl-4 space-y-1">{children}</ul>
                              ),
                              ol: ({ children }) => (
                                <ol className="mb-2 list-decimal pl-4 space-y-1">{children}</ol>
                              ),
                              li: ({ children }) => (
                                <li className="text-[--foreground]">{children}</li>
                              ),
                              h3: ({ children }) => (
                                <h3 className="font-semibold text-[--foreground] mt-3 mb-1">{children}</h3>
                              ),
                              blockquote: ({ children }) => (
                                <blockquote className="border-l-3 border-[#007AFF] pl-3 my-2 text-[--foreground-secondary]">
                                  {children}
                                </blockquote>
                              ),
                            }}
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
                        className="p-1.5 rounded-lg hover:bg-[--background-secondary] text-[--foreground-tertiary] transition-colors"
                      >
                        {copiedIndex === i ? (
                          <svg className="w-3.5 h-3.5 text-[#34C759]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-3 animate-fade-in">
                <AssistantAvatar />
                <div className="bg-[--background-secondary] border border-[var(--card-border)] rounded-2xl rounded-bl-md">
                  <TypingIndicator />
                </div>
              </div>
            )}

            {error && (
              <div className="flex justify-center animate-fade-in">
                <div className="bg-[#FF3B30]/10 text-[#FF3B30] px-4 py-2 rounded-full text-sm">
                  {error}
                </div>
              </div>
            )}
          </div>
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <footer className="sticky bottom-0 bg-[--glass-bg] backdrop-blur-xl border-t border-[var(--card-border)]">
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
                className="w-full rounded-2xl bg-[--background-secondary] px-5 py-4 text-[--foreground] placeholder:text-[--foreground-tertiary] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 disabled:opacity-50 transition-all resize-none"
                style={{ minHeight: '80px', maxHeight: '200px' }}
              />
              <span className="absolute bottom-2 right-3 text-xs text-[--foreground-tertiary]">
                {userText.length}/600
              </span>
            </div>
            <button
              type="submit"
              disabled={loading || !input.trim() || (!usage?.allowed && !isInitializing)}
              className="shrink-0 h-12 px-5 rounded-2xl bg-[#007AFF] text-white flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100 shadow-sm hover:shadow-md"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
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
    </div>
  );
}
