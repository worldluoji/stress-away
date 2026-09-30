/**
 * stress-away Subscriptions & Admin Activation Codes (TCB User Edition)
 *
 * 订阅主键: uid (TCB 用户 ID)
 * Admin 激活码: 单码单用户，绑定 uid
 */

import { query, execute, withTransaction, txQuery, txExecute, isMySQLAvailable, queryWithLimit } from './db';
import { TtlMap } from './ttl-map';

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

const SUB_CACHE_TTL_MS = 60 * 1000;
const SUB_CACHE_KEY = (uid: string) => `sub:${uid}`;
const subCache = new TtlMap();

async function cacheSet(key: string, value: unknown): Promise<void> {
  subCache.set(key, value, SUB_CACHE_TTL_MS);
}

async function cacheGet<T>(key: string): Promise<T | null> {
  return subCache.get<T>(key) ?? null;
}

async function cacheDel(key: string): Promise<void> {
  subCache.del(key);
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

  if (!isMySQLAvailable()) return null;
  try {
    const rows = await query<SubscriptionRow>(
      'SELECT * FROM subscriptions WHERE uid = ?',
      [uid]
    );
    if (rows.length === 0) return null;
    const sub = rowToSubscription(rows[0]);
    await cacheSet(SUB_CACHE_KEY(uid), sub);
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
  if (!isMySQLAvailable()) return;
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
    if (updated) await cacheSet(SUB_CACHE_KEY(uid), updated);
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
  if (!sub || sub.status !== 'active') return false;
  if (sub.remainingUsage <= 0) return false;
  if (sub.expiresAt !== undefined && Date.now() > sub.expiresAt) return false;
  return true;
}

// ==================== Usage Consumption ====================

export async function consumeUsageByUid(uid: string): Promise<number> {
  if (!isMySQLAvailable()) return 0;
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
      const rowExpiresAt = rows[0].expires_at ? Number(rows[0].expires_at) : null;
      if (rowExpiresAt !== null && Date.now() > rowExpiresAt) {
        return 0;
      }

      const newCount = rows[0].remaining_usage - 1;
      await txExecute(
        conn,
        'UPDATE subscriptions SET remaining_usage = ? WHERE uid = ?',
        [newCount, uid]
      );

      // 事务内 sub 是 stale 快照，写缓存会带入错误 totalUsage/expiresAt；
      // 失效让下次读取重读 MySQL。
      await cacheDel(SUB_CACHE_KEY(uid));
      return newCount;
    });
  } catch (err) {
    console.error('[consumeUsageByUid] failed:', err);
    return 0;
  }
}

export async function refundUsageByUid(uid: string): Promise<void> {
  if (!isMySQLAvailable()) return;
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
  if (!isMySQLAvailable()) {
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
  if (!isMySQLAvailable()) return { success: false, error: 'mysql_not_configured' };
  try {
    return await withTransaction(async (conn) => {
      // ── 锁码行：先锁码再锁订阅，避免死锁保持固定顺序
      const codeRows = await txQuery<AdminActivationCodeRow>(
        conn,
        'SELECT * FROM admin_activation_codes WHERE code = ? FOR UPDATE',
        [code]
      );
      if (codeRows.length === 0) {
        return { success: false, error: 'invalid_code' };
      }
      const codeRow = codeRows[0];
      const codeExpiresAt = Number(codeRow.expires_at);
      if (Date.now() > codeExpiresAt) {
        return { success: false, error: 'expired_code' };
      }

      // 单码单用户：码已绑给其他 uid
      if (codeRow.uid && codeRow.uid !== uid) {
        return { success: false, error: 'code_already_used' };
      }

      // ── 锁订阅行
      const subRows = await txQuery<SubscriptionRow>(
        conn,
        'SELECT * FROM subscriptions WHERE uid = ? FOR UPDATE',
        [uid]
      );
      const currentSub = subRows.length > 0 ? subRows[0] : null;

      // ── 同码重复激活 → 幂等返回当前订阅状态
      if (codeRow.uid === uid && currentSub && currentSub.activation_code === code) {
        return {
          success: true,
          remainingCodes: currentSub.remaining_usage,
          expiresAt: currentSub.expires_at ? Number(currentSub.expires_at) : undefined,
        };
      }

      // ── 计算叠加后的新值
      const isExpired =
        currentSub && currentSub.expires_at && Date.now() > Number(currentSub.expires_at);

      let newRemaining: number;
      let newTotal: number;
      let newExpiresAt: number;

      if (!currentSub || isExpired) {
        // 无订阅 / 已过期 → 全新起步（不继承过期前剩余次数）
        newRemaining = codeRow.total_times;
        newTotal = codeRow.total_times;
        newExpiresAt = codeExpiresAt;
      } else {
        // 活跃订阅 → 次数叠加，到期时间取最大
        newRemaining = currentSub.remaining_usage + codeRow.total_times;
        newTotal = currentSub.total_usage + codeRow.total_times;
        newExpiresAt = Math.max(Number(currentSub.expires_at), codeExpiresAt);
      }

      // ── 首次绑定时标记码行为已绑定
      const now = Date.now();
      if (!codeRow.uid) {
        await txExecute(
          conn,
          `UPDATE admin_activation_codes SET used = TRUE, uid = ?, device_id = ?, activation_time = ? WHERE code = ?`,
          [uid, deviceId ?? null, now, code]
        );
      }

      // ── 写订阅行
      if (!currentSub) {
        await txExecute(
          conn,
          `INSERT INTO subscriptions (uid, device_id, status, source, total_usage, remaining_usage, activation_code, expires_at)
           VALUES (?, ?, 'active', 'admin', ?, ?, ?, ?)`,
          [uid, deviceId ?? null, newTotal, newRemaining, code, newExpiresAt]
        );
      } else {
        await txExecute(
          conn,
          `UPDATE subscriptions SET
             device_id = COALESCE(?, device_id),
             status = 'active',
             source = 'admin',
             total_usage = ?,
             remaining_usage = ?,
             activation_code = ?,
             expires_at = ?
           WHERE uid = ?`,
          [deviceId ?? null, newTotal, newRemaining, code, newExpiresAt, uid]
        );
      }

      // ── 失效订阅缓存（避免脏读）
      await cacheDel(SUB_CACHE_KEY(uid));

      return { success: true, remainingCodes: newRemaining, expiresAt: newExpiresAt };
    });
  } catch (err) {
    console.error('[consumeAdminActivationCode] failed:', err);
    return { success: false, error: 'db_error' };
  }
}

export async function getAdminActivationCode(code: string): Promise<AdminActivationCode | null> {
  if (!isMySQLAvailable()) return null;
  try {
    const rows = await query<AdminActivationCodeRow & { user_sub_remaining: number | string | null }>(
      `SELECT a.*, s.remaining_usage AS user_sub_remaining
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
      userSubRemaining: r.user_sub_remaining !== null ? Number(r.user_sub_remaining) : undefined,
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
  if (!isMySQLAvailable()) return { codes: [], total: 0 };
  try {
    const countRows = await query<{ cnt: number }>('SELECT COUNT(*) as cnt FROM admin_activation_codes');
    const total = countRows[0]?.cnt ?? 0;
    const offset = (page - 1) * limit;
    const rows = await queryWithLimit<AdminActivationCodeRow & { user_sub_remaining: number | string | null }>(
      `SELECT a.*, s.remaining_usage AS user_sub_remaining
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
      userSubRemaining: r.user_sub_remaining !== null ? Number(r.user_sub_remaining) : undefined,
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
  userSubRemaining?: number;
  used: boolean;
  activationTime?: number;
}
