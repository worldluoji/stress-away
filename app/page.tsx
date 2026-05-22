"use client";

import { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import type { ChatMessage } from "@/lib/models";
import { loadMessages, saveMessages } from "@/lib/storage";
import { SubscriptionActivate } from "./components/SubscriptionActivate";

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

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages());
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [usage, setUsage] = useState<UsageStatus | null>(null);
  const [showActivate, setShowActivate] = useState(false);
  const [deviceId, setDeviceId] = useState<string>("");

  useEffect(() => {
    saveMessages(messages);
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
      } catch {
        // ignore
      }
    };
    init();
  }, []);

  const handleActivated = useCallback(() => {
    setShowActivate(false);
    // Re-check usage
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
    await navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    if (!usage?.allowed) {
      setShowActivate(true);
      return;
    }

    const userMessage: ChatMessage = { role: "user", content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const reply = data.reply
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
        .trim();
      setMessages([...newMessages, { role: "assistant", content: reply }]);

      // Consume usage after successful response
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
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-sky-50 to-white">
      {/* Header */}
      <header className="sticky top-0 z-10 w-full border-b border-amber-100 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
                反PUA手册
              </h1>
              <p className="text-sm sm:text-base text-amber-600">
                你的职场反PUA专家
              </p>
            </div>
            {usage && (
              <button
                onClick={() => (usage.isPaid ? null : setShowActivate(true))}
                className={`text-sm px-3 py-1 rounded-full ${
                  usage.isPaid
                    ? "bg-green-100 text-green-700"
                    : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                }`}
              >
                {usage.isPaid
                  ? `付费版 · 剩余 ${usage.remaining} 次`
                  : `免费版 · 剩余 ${usage.remaining}/${usage.total} 次`}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Activation Modal */}
      {showActivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md">
            <button
              onClick={() => setShowActivate(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/80 hover:bg-white text-gray-500"
            >
              ✕
            </button>
            <SubscriptionActivate onActivated={handleActivated} />
          </div>
        </div>
      )}

      {/* Chat Area */}
      <main className="mx-auto flex flex-1 flex-col justify-between gap-6 px-4 py-8 max-w-3xl w-full">
        <div className="flex flex-col gap-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-base sm:text-lg text-amber-700">
                描述你的职场困境，我来帮你生成反PUA建议
              </p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-xl rounded-2xl px-4 py-3 text-base sm:text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-gradient-to-r from-amber-400 to-orange-400 text-white shadow-lg shadow-amber-200"
                    : "bg-white text-zinc-700 shadow-md border border-amber-100 relative group"
                }`}
              >
                {msg.role === "user" ? (
                  msg.content
                ) : (
                  <>
                    <button
                      onClick={() => handleCopy(msg.content, i)}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-600 copy-btn"
                      title="复制内容"
                    >
                      <style jsx global>{`
                        @media (hover: none) {
                          .copy-btn {
                            opacity: 1 !important;
                          }
                        }
                      `}</style>
                      {copiedIndex === i ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => (
                          <p className="mb-2 last:mb-0">{children}</p>
                        ),
                        strong: ({ children }) => (
                          <strong className="font-semibold text-amber-700">{children}</strong>
                        ),
                        ul: ({ children }) => (
                          <ul className="mb-2 list-disc pl-4">{children}</ul>
                        ),
                        li: ({ children }) => (
                          <li className="mb-1">{children}</li>
                        ),
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="max-w-xl rounded-2xl bg-white px-4 py-3 shadow-md border border-amber-100">
                <p className="text-sm text-amber-600">
                  正在思考中...
                </p>
              </div>
            </div>
          )}
          {error && (
            <div className="flex justify-center">
              <p className="text-sm text-red-500">{error}</p>
            </div>
          )}
        </div>
      </main>

      {/* Input Area */}
      <footer className="sticky bottom-0 border-t border-amber-100 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  usage?.allowed
                    ? "输入你的职场困境..."
                    : "今日免费次数已用完，请先激活..."
                }
                disabled={loading}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                className="w-full rounded-full border border-amber-200 bg-white pl-5 pr-12 py-3 text-base sm:text-sm text-zinc-700 placeholder:text-amber-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:opacity-50 shadow-sm"
              />
              <style jsx global>{`
                input[type="text"]::-webkit-search-decoration,
                input[type="text"]::-webkit-search-cancel-button,
                input[type="text"]::-webkit-search-results-button,
                input[type="text"]::-webkit-search-results-decoration {
                  -webkit-appearance: none !important;
                  display: none !important;
                }
                input[type="text"] {
                  -webkit-appearance: none;
                  appearance: none;
                }
              `}</style>
            </div>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="shrink-0 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 px-8 py-3 text-sm font-medium text-white shadow-lg shadow-amber-200 transition-all hover:shadow-xl hover:scale-105 disabled:opacity-50 disabled:scale-100"
            >
              发送
            </button>
          </form>
        </div>
      </footer>
    </div>
  );
}