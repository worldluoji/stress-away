/**
 * Message reactions (like) and bookmarks (save) - MySQL backed
 */

import { query, execute, isMySQLAvailable, queryWithLimit } from './db';

// ==================== Types ====================

export interface MessageReaction {
  id: number;
  uid: string;
  messageId: string;
  createdAt: number;
}

export interface SavedMessage {
  id: number;
  uid: string;
  messageId: string;
  conversationId: string;
  messageIndex: number;
  content: string;
  scenarioId?: string;
  createdAt: number;
}

// ==================== Store message (for lookup) ====================

export async function storeMessage(
  conversationId: string,
  messageIndex: number,
  messageId: string,
  role: string,
  content: string,
  scenarioId?: string,
  createdAt?: number
): Promise<void> {
  if (!isMySQLAvailable) return;
  try {
    await execute(
      `INSERT INTO messages (conversation_id, message_index, message_id, role, content, scenario_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE content = VALUES(content)`,
      [conversationId, messageIndex, messageId, role, content, scenarioId ?? null, createdAt ?? Date.now()]
    );
  } catch (err) {

  }
}

// ==================== Reactions (likes) ====================

export async function addReaction(uid: string, messageId: string): Promise<boolean> {
  if (!isMySQLAvailable) return false;
  try {
    await execute(
      `INSERT IGNORE INTO message_reactions (uid, message_id, created_at) VALUES (?, ?, ?)`,
      [uid, messageId, Date.now()]
    );
    return true;
  } catch (err) {

    return false;
  }
}

export async function removeReaction(uid: string, messageId: string): Promise<boolean> {
  if (!isMySQLAvailable) return false;
  try {
    await execute(
      `DELETE FROM message_reactions WHERE uid = ? AND message_id = ?`,
      [uid, messageId]
    );
    return true;
  } catch (err) {

    return false;
  }
}

export async function isMessageLikedByUid(uid: string, messageId: string): Promise<boolean> {
  if (!isMySQLAvailable) return false;
  try {
    const rows = await query<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM message_reactions WHERE uid = ? AND message_id = ?`,
      [uid, messageId]
    );
    return rows[0]?.cnt > 0;
  } catch (err) {

    return false;
  }
}

export async function getLikedMessageIds(uid: string, messageIds: string[]): Promise<Set<string>> {
  if (!isMySQLAvailable || messageIds.length === 0) return new Set();
  try {
    const placeholders = messageIds.map(() => '?').join(',');
    const rows = await query<{ message_id: string }>(
      `SELECT message_id FROM message_reactions WHERE uid = ? AND message_id IN (${placeholders})`,
      [uid, ...messageIds]
    );
    return new Set(rows.map(r => r.message_id));
  } catch (err) {

    return new Set();
  }
}

export async function getLikedMessages(uid: string, limit = 50, offset = 0): Promise<{
  messageId: string;
  content: string;
  conversationId: string;
  scenarioId?: string;
  createdAt: number;
}[]> {
  if (!isMySQLAvailable) return [];
  try {
    const rows = await queryWithLimit<{
      message_id: string;
      content: string;
      conversation_id: string;
      scenario_id: string | null;
      created_at: string;
    }>(
      `SELECT r.message_id, m.content, m.conversation_id, m.scenario_id, r.created_at
       FROM message_reactions r
       JOIN messages m ON r.message_id = m.message_id
       WHERE r.uid = ?
       ORDER BY r.created_at DESC`,
      limit,
      offset,
      [uid]
    );
    return rows.map(r => ({
      messageId: r.message_id,
      content: r.content,
      conversationId: r.conversation_id,
      scenarioId: r.scenario_id ?? undefined,
      createdAt: Number(r.created_at),
    }));
  } catch (err) {

    return [];
  }
}

// ==================== Saved messages ====================

export async function saveMessage(
  uid: string,
  messageId: string,
  conversationId: string,
  messageIndex: number,
  content: string,
  scenarioId?: string
): Promise<boolean> {
  if (!isMySQLAvailable) return false;
  try {
    await execute(
      `INSERT IGNORE INTO saved_messages (uid, message_id, conversation_id, message_index, content, scenario_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uid, messageId, conversationId, messageIndex, content, scenarioId ?? null, Date.now()]
    );
    return true;
  } catch (err) {

    return false;
  }
}

export async function unsaveMessage(uid: string, messageId: string): Promise<boolean> {
  if (!isMySQLAvailable) return false;
  try {
    await execute(
      `DELETE FROM saved_messages WHERE uid = ? AND message_id = ?`,
      [uid, messageId]
    );
    return true;
  } catch (err) {

    return false;
  }
}

export async function isMessageSavedByUid(uid: string, messageId: string): Promise<boolean> {
  if (!isMySQLAvailable) return false;
  try {
    const rows = await query<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM saved_messages WHERE uid = ? AND message_id = ?`,
      [uid, messageId]
    );
    return rows[0]?.cnt > 0;
  } catch (err) {

    return false;
  }
}

export async function getSavedMessageIds(uid: string, messageIds: string[]): Promise<Set<string>> {
  if (!isMySQLAvailable || messageIds.length === 0) return new Set();
  try {
    const placeholders = messageIds.map(() => '?').join(',');
    const rows = await query<{ message_id: string }>(
      `SELECT message_id FROM saved_messages WHERE uid = ? AND message_id IN (${placeholders})`,
      [uid, ...messageIds]
    );
    return new Set(rows.map(r => r.message_id));
  } catch (err) {

    return new Set();
  }
}

export async function getSavedMessages(uid: string, limit = 50, offset = 0): Promise<{
  messageId: string;
  content: string;
  conversationId: string;
  scenarioId?: string;
  createdAt: number;
}[]> {
  if (!isMySQLAvailable) return [];
  try {
    const rows = await queryWithLimit<{
      message_id: string;
      content: string;
      conversation_id: string;
      scenario_id: string | null;
      created_at: string;
    }>(
      `SELECT message_id, content, conversation_id, scenario_id, created_at
       FROM saved_messages
       WHERE uid = ?
       ORDER BY created_at DESC`,
      limit,
      offset,
      [uid]
    );
    return rows.map(r => ({
      messageId: r.message_id,
      content: r.content,
      conversationId: r.conversation_id,
      scenarioId: r.scenario_id ?? undefined,
      createdAt: Number(r.created_at),
    }));
  } catch (err) {

    return [];
  }
}