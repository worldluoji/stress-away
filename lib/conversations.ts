import type { ChatMessage } from './models';
import { query, execute, isMySQLAvailable, queryWithLimit } from './db';

export interface Conversation {
  id: string;
  uid?: string;         // TCB user ID (if logged in)
  deviceId: string;     // Device fingerprint (fallback)
  title: string;
  scenarioId?: string;
  scenarioAnswers?: Record<string, string>;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface ConversationRow {
  id: string;
  uid: string | null;
  device_id: string;
  title: string;
  scenario_id: string | null;
  scenario_answers: string | null;
  messages: string;
  created_at: string;
  updated_at: string;
}

function rowToConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    uid: row.uid ?? undefined,
    deviceId: row.device_id,
    title: row.title,
    scenarioId: row.scenario_id ?? undefined,
    scenarioAnswers: row.scenario_answers ? JSON.parse(row.scenario_answers) : undefined,
    messages: JSON.parse(row.messages),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

// ==================== By UID (logged-in users) ====================

export async function listConversationsByUid(uid: string): Promise<Conversation[]> {
  if (!isMySQLAvailable) return [];
  try {
    const rows = await query<ConversationRow>(
      'SELECT * FROM conversations WHERE uid = ? ORDER BY created_at DESC LIMIT 50',
      [uid]
    );
    return rows.map(rowToConversation);
  } catch (err) {

    return [];
  }
}

export async function saveConversationByUid(conv: Conversation, uid: string): Promise<void> {
  if (!isMySQLAvailable) return;
  try {
    await execute(
      `INSERT INTO conversations (id, uid, device_id, title, scenario_id, scenario_answers, messages, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title),
         uid = VALUES(uid),
         scenario_id = VALUES(scenario_id),
         scenario_answers = VALUES(scenario_answers),
         messages = VALUES(messages),
         updated_at = VALUES(updated_at)`,
      [
        conv.id,
        uid,
        conv.deviceId,
        conv.title,
        conv.scenarioId ?? null,
        conv.scenarioAnswers ? JSON.stringify(conv.scenarioAnswers) : null,
        JSON.stringify(conv.messages),
        conv.createdAt,
        conv.updatedAt,
      ]
    );
  } catch (err) {

  }
}

// ==================== By Device ID (anonymous users) ====================

export async function listConversationsByDevice(deviceId: string): Promise<Conversation[]> {
  if (!isMySQLAvailable) return [];
  try {
    const rows = await queryWithLimit<ConversationRow>(
      'SELECT * FROM conversations WHERE device_id = ? ORDER BY created_at DESC',
      50, 0, [deviceId]
    );
    return rows.map(rowToConversation);
  } catch (err) {

    return [];
  }
}

export async function saveConversation(conv: Conversation, uid?: string): Promise<void> {
  if (!isMySQLAvailable) return;
  try {
    await execute(
      `INSERT INTO conversations (id, uid, device_id, title, scenario_id, scenario_answers, messages, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title),
         uid = COALESCE(VALUES(uid), uid),
         device_id = VALUES(device_id),
         scenario_id = VALUES(scenario_id),
         scenario_answers = VALUES(scenario_answers),
         messages = VALUES(messages),
         updated_at = VALUES(updated_at)`,
      [
        conv.id,
        uid ?? null,
        conv.deviceId,
        conv.title,
        conv.scenarioId ?? null,
        conv.scenarioAnswers ? JSON.stringify(conv.scenarioAnswers) : null,
        JSON.stringify(conv.messages),
        conv.createdAt,
        conv.updatedAt,
      ]
    );
  } catch (err) {

  }
}

export async function getConversation(id: string): Promise<Conversation | null> {
  if (!isMySQLAvailable) return null;
  try {
    const rows = await query<ConversationRow>('SELECT * FROM conversations WHERE id = ?', [id]);
    if (rows.length === 0) return null;
    return rowToConversation(rows[0]);
  } catch (err) {

    return null;
  }
}

export async function deleteConversation(id: string): Promise<void> {
  if (!isMySQLAvailable) return;
  try {
    await execute('DELETE FROM conversations WHERE id = ?', [id]);
  } catch (err) {

  }
}

export async function updateConversation(
  id: string,
  updates: Partial<Conversation>
): Promise<void> {
  if (!isMySQLAvailable) return;
  try {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.messages !== undefined) {
      fields.push('messages = ?');
      values.push(JSON.stringify(updates.messages));
    }
    if (updates.scenarioAnswers !== undefined) {
      fields.push('scenario_answers = ?');
      values.push(JSON.stringify(updates.scenarioAnswers));
    }
    if (updates.updatedAt !== undefined) {
      fields.push('updated_at = ?');
      values.push(updates.updatedAt);
    }

    if (fields.length === 0) return;
    values.push(id);
    await execute(`UPDATE conversations SET ${fields.join(', ')} WHERE id = ?`, values);
  } catch (err) {

  }
}