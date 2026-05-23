import type { ChatMessage } from "./models";

const STORAGE_KEY = "fanpua-messages";
const HISTORY_KEY = "fanpua-history";

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface ConversationHistory {
  conversations: Conversation[];
}

export function loadMessages(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as ChatMessage[];
  } catch {
    return [];
  }
}

export function saveMessages(messages: ChatMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // ignore
  }
}

export function loadHistory(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (!stored) return [];
    const history = JSON.parse(stored) as ConversationHistory;
    return history.conversations || [];
  } catch {
    return [];
  }
}

export function saveHistory(history: ConversationHistory): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // ignore
  }
}

export function generateConversationId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function generateTitle(messages: ChatMessage[]): string {
  if (messages.length === 0) return "新对话";
  const firstUserMsg = messages.find((m) => m.role === "user");
  if (!firstUserMsg) return "新对话";
  const content = firstUserMsg.content.slice(0, 30);
  return content.length < firstUserMsg.content.length ? content + "..." : content;
}