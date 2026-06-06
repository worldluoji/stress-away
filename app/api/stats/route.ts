/**
 * User stats API: scenario distribution, active days, total chats
 */

import { NextRequest, NextResponse } from 'next/server';
import { query, isMySQLAvailable } from '@/lib/db';
import { getAuthContext } from '@/lib/api-auth';
import { checkRateLimit, RATE_LIMITS, extractClientInfo } from '@/lib/ratelimit';

export async function GET(request: NextRequest) {
  try {
    const { uid } = await getAuthContext(request);

    if (!uid) {
      return NextResponse.json({ error: 'login_required' }, { status: 401 });
    }

    const { ip } = extractClientInfo(request, uid);
    const rateLimitResult = await checkRateLimit(uid, ip, RATE_LIMITS.usage);
    if (!rateLimitResult.allowed) {
      return NextResponse.json({ error: 'rate_limit_exceeded' }, { status: 429 });
    }

    if (!isMySQLAvailable) {
      return NextResponse.json({
        totalChats: 0,
        activeDays: 0,
        scenarios: [],
        keywords: [],
        weeklyActivity: [],
      });
    }

    // 1. Total chats & active days (last 30 days)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const statsRows = await query<{ total_chats: number; active_days: number }>(
      `SELECT
         COUNT(*) as total_chats,
         COUNT(DISTINCT DATE(FROM_UNIXTIME(created_at / 1000))) as active_days
       FROM usage_events
       WHERE uid = ? AND event_type = 'chat'`,
      [uid]
    );

    const totalChats = statsRows[0]?.total_chats ?? 0;
    const activeDays = statsRows[0]?.active_days ?? 0;

    // 2. Scenario distribution
    const scenarioRows = await query<{ scenario_id: string; cnt: number }>(
      `SELECT scenario_id, COUNT(*) as cnt
       FROM usage_events
       WHERE uid = ? AND scenario_id IS NOT NULL AND scenario_id != ''
       GROUP BY scenario_id
       ORDER BY cnt DESC
       LIMIT 10`,
      [uid]
    );

    // 3. Keywords from meta (last 30 days, last 20 chats)
    const keywordRows = await query<{ meta: string | null; cnt: number }>(
      `SELECT meta, COUNT(*) as cnt
       FROM usage_events
       WHERE uid = ? AND event_type = 'chat' AND meta IS NOT NULL AND created_at > ?
       ORDER BY created_at DESC
       LIMIT 20`,
      [uid, thirtyDaysAgo]
    );

    // Extract keywords from meta JSON
    const keywordMap = new Map<string, number>();
    for (const row of keywordRows) {
      if (row.meta) {
        try {
          const meta = JSON.parse(row.meta);
          if (meta.keywords && Array.isArray(meta.keywords)) {
            for (const kw of meta.keywords) {
              keywordMap.set(kw, (keywordMap.get(kw) ?? 0) + 1);
            }
          }
        } catch {
          // ignore parse errors
        }
      }
    }
    const keywords = Array.from(keywordMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([keyword, count]) => ({ keyword, count }));

    // 4. Weekly activity (last 7 days, count per day)
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const activityRows = await query<{ day: string; cnt: number }>(
      `SELECT DATE(FROM_UNIXTIME(created_at / 1000)) as day, COUNT(*) as cnt
       FROM usage_events
       WHERE uid = ? AND event_type = 'chat' AND created_at > ?
       GROUP BY day
       ORDER BY day ASC`,
      [uid, sevenDaysAgo]
    );

    // Fill missing days with 0
    const weeklyActivity = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().slice(0, 10);
      const found = activityRows.find(r => r.day === dayStr);
      weeklyActivity.push({
        date: dayStr,
        count: found ? found.cnt : 0,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
      });
    }

    return NextResponse.json({
      totalChats,
      activeDays,
      scenarios: scenarioRows.map(r => ({ scenarioId: r.scenario_id, count: r.cnt })),
      keywords,
      weeklyActivity,
    });
  } catch (error) {

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}