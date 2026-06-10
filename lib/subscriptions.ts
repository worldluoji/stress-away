/**
 * stress-away Subscriptions & Admin Activation Codes (TCB User Edition)
 *
 * 订阅主键: uid (TCB 用户 ID)
 * Admin 激活码: 单码单用户，绑定 uid
 */

import { query, execute, withTransaction, txQuery, txExecute, isMySQLAvailable, queryWithLimit } from './db';
import { getRedis, isRedisConfigured } from './redis';

const FREE_LIMIT_PER_DAY = parseInt(process.env.FREE_LIMIT_PER_DAY || '1', 10);
const TOTAL_USAGE = 100;

// ==================== Types ====================

export interface Subscription {
  uid: string;
  deviceId?: string;
  status: 'active' | 'inactive';
  source: 'admin';
  totalUsage: number;
  remainingUsage: number;
  activationCode?: string;
  expiresAt?: number;
}

interface SubscriptionRow {
  uid: string;
  device_id: string | null;
  status: 'active' | 'inactive';
  source: 'admin';
  total_usage: number;
  remaining_usage: number;
  claimed_at: string | null;
  order_id: string | null;
  activation_code: string | null;
  expires_at: string | null;
}

interface AdminActivationCodeRow {
  code: string;
  uid: string | null;
  device_id: string | null;
  created_at: string;
  expires_at: string;
  total_times: number;
  used: boolean;
  activation_time: string | null;
}

// ==================== Helpers ====================

const SUB_CACHE_TTL = 60 * 5;
const SUB_CACHE_KEY = (uid: string) => `sub:${uid}`;

async function cacheSet(key: string, value: unknown, ttl: number): Promise<void> {
  if (!isRedisConfigured()) return;
  try {
    await getRedis().set(key, value, { ex: ttl });
  } catch {
    // ignore
  }
}

async function cacheGet<T>(key: string): Promise<T | null> {
  if (!isRedisConfigured()) return null;
  try {
    const val = await getRedis().get<T>(key);
    return val ?? null;
  } catch {
    return null;
  }
}

async function cacheDel(key: string): Promise<void> {
  if (!isRedisConfigured()) return;
  try {
    await getRedis().del(key);
  } catch {
    // ignore
  }
}

function rowToSubscription(row: SubscriptionRow): Subscription {
  return {
    uid: row.uid,
    deviceId: row.device_id ?? undefined,
    status: row.status,
    source: row.source,
    totalUsage: row.total_usage,
    remainingUsage: row.remaining_usage,
    activationCode: row.activation_code ?? undefined,
    expiresAt: row.expires_at ? Number(row.expires_at) : undefined,
  };
}

// ==================== Subscriptions (uid-based) ====================

export async function getSubscriptionByUid(uid: string): Promise<Subscription | null> {
  const cached = await cacheGet<Subscription>(SUB_CACHE_KEY(uid));
  if (cached) return cached;

  if (!isMySQLAvailable) return null;
  try {
    const rows = await query<SubscriptionRow>(
      'SELECT * FROM subscriptions WHERE uid = ?',
      [uid]
    );
    if (rows.length === 0) return null;
    const sub = rowToSubscription(rows[0]);
    await cacheSet(SUB_CACHE_KEY(uid), sub, SUB_CACHE_TTL);
    return sub;
  } catch (err) {
    console.error('[getSubscriptionByUid] failed:', err);
    return null;
  }
}

export async function setSubscription(
  uid: string,
  subscription: Partial<Subscription>
): Promise<void> {
  if (!isMySQLAvailable) return;
  try {
    await execute(
      `INSERT INTO subscriptions (uid, device_id, status, source, total_usage, remaining_usage, activation_code, expires_at)
       VALUES (?, ?, ?, 'admin', ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         device_id = COALESCE(VALUES(device_id), device_id),
         status = VALUES(status),
         source = 'admin',
         total_usage = VALUES(total_usage),
         remaining_usage = VALUES(remaining_usage),
         activation_code = COALESCE(VALUES(activation_code), activation_code),
         expires_at = COALESCE(VALUES(expires_at), expires_at)`,
      [
        uid,
        subscription.deviceId ?? null,
        subscription.status ?? 'inactive',
        subscription.totalUsage ?? TOTAL_USAGE,
        subscription.remainingUsage ?? 0,
        subscription.activationCode ?? null,
        subscription.expiresAt ?? null,
      ]
    );
    const updated = await getSubscriptionByUid(uid);
    if (updated) await cacheSet(SUB_CACHE_KEY(uid), updated, SUB_CACHE_TTL);
  } catch (err) {
    console.error('[setSubscription] failed:', err);
  }
}

export async function getRemainingUsageByUid(uid: string): Promise<number> {
  const sub = await getSubscriptionByUid(uid);
  if (!sub || sub.status !== 'active') return 0;
  return sub.remainingUsage;
}

export async function isPaidUserByUid(uid: string): Promise<boolean> {
  const sub = await getSubscriptionByUid(uid);
  return sub !== null && sub.status === 'active' && sub.remainingUsage > 0;
}

// ==================== Usage Consumption ====================

export async function consumeUsageByUid(uid: string): Promise<number> {
  if (!isMySQLAvailable) return 0;
  try {
    return await withTransaction(async (conn) => {
      const rows = await txQuery<SubscriptionRow>(
        conn,
        'SELECT * FROM subscriptions WHERE uid = ? FOR UPDATE',
        [uid]
      );
      if (rows.length === 0 || rows[0].status !== 'active' || rows[0].remaining_usage <= 0) {
        return 0;
      }

      const newCount = rows[0].remaining_usage - 1;
      await txExecute(
        conn,
        'UPDATE subscriptions SET remaining_usage = ? WHERE uid = ?',
        [newCount, uid]
      );

      const sub = rowToSubscription(rows[0]);
      sub.remainingUsage = newCount;
      await cacheSet(SUB_CACHE_KEY(uid), sub, SUB_CACHE_TTL);
      return newCount;
    });
  } catch (err) {
    console.error('[consumeUsageByUid] failed:', err);
    return 0;
  }
}

export async function refundUsageByUid(uid: string): Promise<void> {
  if (!isMySQLAvailable) return;
  try {
    await execute(
      'UPDATE subscriptions SET remaining_usage = remaining_usage + 1 WHERE uid = ? AND status = ?',
      [uid, 'active']
    );
    await cacheDel(SUB_CACHE_KEY(uid));
  } catch (err) {
    console.error('[refundUsageByUid] failed:', err);
  }
}

// ==================== Admin Activation Codes ====================

export async function createAdminActivationCode(
  code: string,
  totalTimes = TOTAL_USAGE
): Promise<{ code: string; expiresAt: number; totalTimes: number }> {
  const now = Date.now();
  const expiresAt = now + 30 * 24 * 60 * 60 * 1000;
  if (!isMySQLAvailable) {
    return { code, expiresAt, totalTimes };
  }
  try {
    await execute(
      `INSERT INTO admin_activation_codes (code, created_at, expires_at, total_times)
       VALUES (?, ?, ?, ?)`,
      [code, now, expiresAt, totalTimes]
    );
    return { code, expiresAt, totalTimes };
  } catch (err) {
    console.error('[createAdminActivationCode] failed:', err);
    return { code, expiresAt, totalTimes };
  }
}

export async function consumeAdminActivationCode(
  code: string,
  uid: string,
  deviceId?: string
): Promise<{ success: boolean; error?: string; remainingCodes?: number; expiresAt?: number }> {
  if (!isMySQLAvailable) return { success: false, error: 'mysql_not_configured' };
  try {
    return await withTransaction(async (conn) => {
      const rows = await txQuery<AdminActivationCodeRow>(
        conn,
        'SELECT * FROM admin_activation_codes WHERE code = ? FOR UPDATE',
        [code]
      );
      if (rows.length === 0) {
        return { success: false, error: 'invalid_code' };
      }
      const data = rows[0];
      const expiresAt = Number(data.expires_at);
      if (Date.now() > expiresAt) {
        return { success: false, error: 'expired_code' };
      }

      // 单码单用户
      if (data.uid && data.uid !== uid) {
        return { success: false, error: 'code_already_used' };
      }

      // 同 uid 重复激活
      if (data.uid === uid) {
        const subs = await txQuery<SubscriptionRow>(
          conn,
          'SELECT remaining_usage FROM subscriptions WHERE uid = ?',
          [uid]
        );
        const remainingCodes = subs.length > 0 ? subs[0].remaining_usage : data.total_times;
        return { success: true, remainingCodes, expiresAt };
      }

      const now = Date.now();
      await txExecute(
        conn,
        `UPDATE admin_activation_codes SET used = TRUE, uid = ?, device_id = ?, activation_time = ? WHERE code = ?`,
        [uid, deviceId ?? null, now, code]
      );

      await txExecute(
        conn,
        `INSERT INTO subscriptions (uid, device_id, status, source, total_usage, remaining_usage, activation_code, expires_at)
         VALUES (?, ?, 'active', 'admin', ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           device_id = VALUES(device_id),
           status = 'active',
           source = 'admin',
           total_usage = VALUES(total_usage),
           remaining_usage = VALUES(remaining_usage),
           activation_code = VALUES(activation_code),
           expires_at = VALUES(expires_at)`,
        [uid, deviceId ?? null, data.total_times, data.total_times, code, expiresAt]
      );

      const subs = await txQuery<SubscriptionRow>(
        conn,
        'SELECT remaining_usage FROM subscriptions WHERE uid = ?',
        [uid]
      );
      return { success: true, remainingCodes: subs[0]?.remaining_usage ?? data.total_times, expiresAt };
    });
  } catch (err) {
    console.error('[consumeAdminActivationCode] failed:', err);
    return { success: false, error: 'db_error' };
  }
}

export async function getAdminActivationCode(code: string): Promise<AdminActivationCode | null> {
  if (!isMySQLAvailable) return null;
  try {
    const rows = await query<AdminActivationCodeRow & { remaining_times: number | string }>(
      `SELECT a.*, COALESCE(s.remaining_usage, a.total_times) AS remaining_times
       FROM admin_activation_codes a
       LEFT JOIN subscriptions s ON s.uid = a.uid
       WHERE a.code = ?`,
      [code]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      code: r.code,
      uid: r.uid ?? undefined,
      deviceId: r.device_id ?? undefined,
      createdAt: Number(r.created_at),
      expiresAt: Number(r.expires_at),
      totalTimes: r.total_times,
      remainingTimes: Number(r.remaining_times),
      used: r.used,
      activationTime: r.activation_time ? Number(r.activation_time) : undefined,
    };
  } catch (err) {
    console.error('[getAdminActivationCode] failed:', err);
    return null;
  }
}

export async function listAdminActivationCodes(
  page = 1,
  limit = 20
): Promise<{ codes: AdminActivationCode[]; total: number }> {
  if (!isMySQLAvailable) return { codes: [], total: 0 };
  try {
    const countRows = await query<{ cnt: number }>('SELECT COUNT(*) as cnt FROM admin_activation_codes');
    const total = countRows[0]?.cnt ?? 0;
    const offset = (page - 1) * limit;
    const rows = await queryWithLimit<AdminActivationCodeRow & { remaining_times: number | string }>(
      `SELECT a.*, COALESCE(s.remaining_usage, a.total_times) AS remaining_times
       FROM admin_activation_codes a
       LEFT JOIN subscriptions s ON s.uid = a.uid
       ORDER BY a.created_at DESC`,
      limit, offset
    );
    const codes = rows.map((r) => ({
      code: r.code,
      uid: r.uid ?? undefined,
      deviceId: r.device_id ?? undefined,
      createdAt: Number(r.created_at),
      expiresAt: Number(r.expires_at),
      totalTimes: r.total_times,
      remainingTimes: Number(r.remaining_times),
      used: r.used,
      activationTime: r.activation_time ? Number(r.activation_time) : undefined,
    }));
    return { codes, total };
  } catch (err) {
    console.error('[listAdminActivationCodes] failed:', err);
    return { codes: [], total: 0 };
  }
}

// ==================== Exports ====================

export { FREE_LIMIT_PER_DAY, TOTAL_USAGE };

export interface AdminActivationCode {
  code: string;
  uid?: string;
  deviceId?: string;
  createdAt: number;
  expiresAt: number;
  totalTimes: number;
  remainingTimes: number;
  used: boolean;
  activationTime?: number;
}
