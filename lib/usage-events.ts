/**
 * Usage Events & Scenario Stats
 *
 * Track user behavior for analytics:
 * - event_type: chat | scenario_view | copy | free_consume
 *   | calculator | paywall_view | paywall_confirm | paywall_cancel | report_generate | report_download
 *   | login_gate(客户端) | paywall_block(服务端)
 * - scenario_stats: aggregated counters per scenario
 */

import { query, execute, isMySQLAvailable } from './db';

export type EventType =
  | 'chat'
  | 'scenario_view'
  | 'copy'
  | 'free_consume'
  | 'calculator'
  | 'paywall_view'
  | 'paywall_confirm'
  | 'paywall_cancel'
  | 'report_generate'
  | 'report_download'
  | 'login_gate'
  | 'paywall_block';

// 客户端可上报的事件白名单（report_generate/paywall_block 等服务端事件不在此列，防伪造）
export const CLIENT_EVENT_TYPES: EventType[] = [
  'calculator',
  'paywall_view',
  'paywall_confirm',
  'paywall_cancel',
  'report_download',
  'login_gate',
];

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
  uid?: string | null;
  deviceId?: string | null;
  eventType: EventType;
  scenarioId?: string;
  meta?: Record<string, unknown>;
}

/**
 * Record a usage event (fire-and-forget, non-blocking)
 */
export async function recordEvent(event: UsageEvent): Promise<void> {
  if (!isMySQLAvailable()) return;
  try {
    await execute(
      `INSERT INTO usage_events (uid, device_id, event_type, scenario_id, meta)
       VALUES (?, ?, ?, ?, ?)`,
      [
        event.uid ?? null,
        event.deviceId ?? null,
        event.eventType,
        event.scenarioId ?? null,
        event.meta ? JSON.stringify(event.meta) : null,
      ]
    );
  } catch (err) {
    console.error('[usage-events] recordEvent failed:', err);
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
  if (!isMySQLAvailable()) return;
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
  if (!isMySQLAvailable()) return [];
  try {
    const rows = await query<ScenarioStatRow>('SELECT * FROM scenario_stats');
    return rows.map((r) => ({
      scenarioId: r.scenario_id,
      viewCount: r.view_count,
      chatCount: r.chat_count,
      copyCount: r.copy_count,
    }));
  } catch (err) {

    return [];
  }
}

export async function incrementViewCount(scenarioId: string): Promise<void> {
  if (!isMySQLAvailable()) return;
  try {
    await ensureScenarioStats(scenarioId);
    await execute(
      'UPDATE scenario_stats SET view_count = view_count + 1 WHERE scenario_id = ?',
      [scenarioId]
    );
    // Also record event
    await recordEvent({ eventType: 'scenario_view', scenarioId });
  } catch (err) {

  }
}

export async function incrementChatCount(scenarioId: string, uid?: string | null, deviceId?: string | null): Promise<void> {
  if (!isMySQLAvailable()) return;
  try {
    await ensureScenarioStats(scenarioId);
    await execute(
      'UPDATE scenario_stats SET chat_count = chat_count + 1 WHERE scenario_id = ?',
      [scenarioId]
    );
    await recordEvent({ uid: uid ?? null, deviceId: deviceId ?? null, eventType: 'chat', scenarioId });
  } catch (err) {

  }
}

export async function incrementCopyCount(scenarioId: string, uid?: string | null, deviceId?: string | null): Promise<void> {
  if (!isMySQLAvailable()) return;
  try {
    await ensureScenarioStats(scenarioId);
    await execute(
      'UPDATE scenario_stats SET copy_count = copy_count + 1 WHERE scenario_id = ?',
      [scenarioId]
    );
    await recordEvent({ uid: uid ?? null, deviceId: deviceId ?? null, eventType: 'copy', scenarioId });
  } catch (err) {

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
  if (!isMySQLAvailable()) return { totalChats: 0, totalViews: 0, totalCopies: 0, activeDevices: 0 };
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

    return { totalChats: 0, totalViews: 0, totalCopies: 0, activeDevices: 0 };
  }
}

// ==================== 报告付费漏斗 ====================

export interface FunnelStep {
  count: number;
  users: number;
}

export interface ReportFunnel {
  calculator: FunnelStep;
  loginGate: FunnelStep;
  paywallView: FunnelStep;
  paywallBlock: FunnelStep;
  paywallConfirm: FunnelStep;
  paywallCancel: FunnelStep;
  reportGenerate: FunnelStep;
  reportDownload: FunnelStep;
}

// event_type → funnel key + SQL 里的 COALESCE(uid, device_id) 作"人数"去重口径
const FUNNEL_EVENTS: { type: EventType; key: keyof ReportFunnel }[] = [
  { type: 'calculator', key: 'calculator' },
  { type: 'login_gate', key: 'loginGate' },
  { type: 'paywall_view', key: 'paywallView' },
  { type: 'paywall_block', key: 'paywallBlock' },
  { type: 'paywall_confirm', key: 'paywallConfirm' },
  { type: 'paywall_cancel', key: 'paywallCancel' },
  { type: 'report_generate', key: 'reportGenerate' },
  { type: 'report_download', key: 'reportDownload' },
];

export async function getReportFunnel(): Promise<ReportFunnel> {
  const empty = (): ReportFunnel => ({
    calculator: { count: 0, users: 0 },
    loginGate: { count: 0, users: 0 },
    paywallView: { count: 0, users: 0 },
    paywallBlock: { count: 0, users: 0 },
    paywallConfirm: { count: 0, users: 0 },
    paywallCancel: { count: 0, users: 0 },
    reportGenerate: { count: 0, users: 0 },
    reportDownload: { count: 0, users: 0 },
  });
  if (!isMySQLAvailable()) return empty();
  try {
    const placeholders = FUNNEL_EVENTS.map(() => '?').join(', ');
    const rows = await query<{
      event_type: EventType;
      count: number;
      users: number;
    }>(
      `SELECT event_type, COUNT(*) AS count,
              COUNT(DISTINCT COALESCE(uid, device_id)) AS users
       FROM usage_events
       WHERE event_type IN (${placeholders})
       GROUP BY event_type`,
      FUNNEL_EVENTS.map((e) => e.type)
    );
    const byType = new Map(rows.map((r) => [r.event_type, r]));
    const funnel = empty();
    for (const { type, key } of FUNNEL_EVENTS) {
      const r = byType.get(type);
      funnel[key] = { count: Number(r?.count ?? 0), users: Number(r?.users ?? 0) };
    }
    return funnel;
  } catch (err) {
    console.error('[usage-events] getReportFunnel failed:', err);
    return empty();
  }
}