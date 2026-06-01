/**
 * Usage Events & Scenario Stats
 *
 * Track user behavior for analytics:
 * - event_type: chat | scenario_view | copy | activate | free_consume
 * - scenario_stats: aggregated counters per scenario
 */

import { query, execute, isMySQLAvailable } from './db';

export type EventType = 'chat' | 'scenario_view' | 'copy' | 'activate' | 'free_consume';

interface EventRow {
  id: number;
  device_id: string | null;
  event_type: EventType;
  scenario_id: string | null;
  meta: string | null;
  created_at: string;
}

interface ScenarioStatRow {
  scenario_id: string;
  view_count: number;
  chat_count: number;
  copy_count: number;
}

// ==================== Usage Events ====================

export interface UsageEvent {
  deviceId?: string;
  eventType: EventType;
  scenarioId?: string;
  meta?: Record<string, unknown>;
}

/**
 * Record a usage event (fire-and-forget, non-blocking)
 */
export async function recordEvent(event: UsageEvent): Promise<void> {
  if (!isMySQLAvailable) return;
  try {
    await execute(
      `INSERT INTO usage_events (device_id, event_type, scenario_id, meta)
       VALUES (?, ?, ?, ?)`,
      [
        event.deviceId ?? null,
        event.eventType,
        event.scenarioId ?? null,
        event.meta ? JSON.stringify(event.meta) : null,
      ]
    );
  } catch (err) {
    console.error('[usage-events] recordEvent error:', err);
  }
}

// ==================== Scenario Stats ====================

export interface ScenarioStat {
  scenarioId: string;
  viewCount: number;
  chatCount: number;
  copyCount: number;
}

async function ensureScenarioStats(scenarioId: string): Promise<void> {
  if (!isMySQLAvailable) return;
  try {
    await execute(
      `INSERT IGNORE INTO scenario_stats (scenario_id) VALUES (?)`,
      [scenarioId]
    );
  } catch {
    // ignore
  }
}

export async function getScenarioStats(): Promise<ScenarioStat[]> {
  if (!isMySQLAvailable) return [];
  try {
    const rows = await query<ScenarioStatRow>('SELECT * FROM scenario_stats');
    return rows.map((r) => ({
      scenarioId: r.scenario_id,
      viewCount: r.view_count,
      chatCount: r.chat_count,
      copyCount: r.copy_count,
    }));
  } catch (err) {
    console.error('[usage-events] getScenarioStats error:', err);
    return [];
  }
}

export async function incrementViewCount(scenarioId: string): Promise<void> {
  if (!isMySQLAvailable) return;
  try {
    await ensureScenarioStats(scenarioId);
    await execute(
      'UPDATE scenario_stats SET view_count = view_count + 1 WHERE scenario_id = ?',
      [scenarioId]
    );
    // Also record event
    await recordEvent({ eventType: 'scenario_view', scenarioId });
  } catch (err) {
    console.error('[usage-events] incrementViewCount error:', err);
  }
}

export async function incrementChatCount(scenarioId: string, deviceId?: string): Promise<void> {
  if (!isMySQLAvailable) return;
  try {
    await ensureScenarioStats(scenarioId);
    await execute(
      'UPDATE scenario_stats SET chat_count = chat_count + 1 WHERE scenario_id = ?',
      [scenarioId]
    );
    await recordEvent({ deviceId, eventType: 'chat', scenarioId });
  } catch (err) {
    console.error('[usage-events] incrementChatCount error:', err);
  }
}

export async function incrementCopyCount(scenarioId: string, deviceId?: string): Promise<void> {
  if (!isMySQLAvailable) return;
  try {
    await ensureScenarioStats(scenarioId);
    await execute(
      'UPDATE scenario_stats SET copy_count = copy_count + 1 WHERE scenario_id = ?',
      [scenarioId]
    );
    await recordEvent({ deviceId, eventType: 'copy', scenarioId });
  } catch (err) {
    console.error('[usage-events] incrementCopyCount error:', err);
  }
}

// ==================== Analytics API Helpers ====================

export async function getScenarioRanking(): Promise<ScenarioStat[]> {
  const stats = await getScenarioStats();
  return stats.sort((a, b) => (b.viewCount + b.chatCount * 2 + b.copyCount * 3) - (a.viewCount + a.chatCount * 2 + a.copyCount * 3));
}

export async function getTotalUsage(): Promise<{
  totalChats: number;
  totalViews: number;
  totalCopies: number;
  activeDevices: number;
}> {
  if (!isMySQLAvailable) return { totalChats: 0, totalViews: 0, totalCopies: 0, activeDevices: 0 };
  try {
    const [chatRows, viewRows, copyRows, deviceRows] = await Promise.all([
      query<{ cnt: number }>("SELECT COUNT(*) as cnt FROM usage_events WHERE event_type = 'chat'"),
      query<{ cnt: number }>("SELECT COUNT(*) as cnt FROM usage_events WHERE event_type = 'scenario_view'"),
      query<{ cnt: number }>("SELECT COUNT(*) as cnt FROM usage_events WHERE event_type = 'copy'"),
      query<{ cnt: number }>("SELECT COUNT(DISTINCT device_id) as cnt FROM usage_events WHERE device_id IS NOT NULL"),
    ]);
    return {
      totalChats: chatRows[0]?.cnt ?? 0,
      totalViews: viewRows[0]?.cnt ?? 0,
      totalCopies: copyRows[0]?.cnt ?? 0,
      activeDevices: deviceRows[0]?.cnt ?? 0,
    };
  } catch (err) {
    console.error('[usage-events] getTotalUsage error:', err);
    return { totalChats: 0, totalViews: 0, totalCopies: 0, activeDevices: 0 };
  }
}