import type { ChatMessage } from "./models";

const STORAGE_KEY = "fanpua-messages";

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