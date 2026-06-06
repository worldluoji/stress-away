/**
 * stress-away Subscriptions & Activation (TCB User Edition)
 *
 * Primary key: uid (TCB user ID)
 * Fallback: device_id for anonymous/free users
 *
 * Schema:
 * - uid PRIMARY KEY: TCB user ID
 * - device_id: current device (nullable, for logs/security)
 * - total_usage: always 100 per claim
 * - remaining_usage: remaining times
 */

import { query, execute, withTransaction, txQuery, txExecute, isMySQLAvailable, queryWithLimit } from './db';
import { getRedis, isRedisConfigured } from './redis';

const FREE_LIMIT_PER_DAY = parseInt(process.env.FREE_LIMIT_PER_DAY || '1', 10);
const TOTAL_USAGE = 100; // fixed at 100 per order claim

// ==================== Types ====================

export interface Subscription {
  uid: string;
  deviceId?: string;
  status: 'active' | 'inactive';
  source: 'mbaodu' | 'admin';
  totalUsage: number;
  remainingUsage: number;
  claimedAt?: number;
  orderId?: string;
  activationCode?: string;
  expiresAt?: number;
}

interface SubscriptionRow {
  uid: string;
  device_id: string | null;
  status: 'active' | 'inactive';
  source: 'mbaodu' | 'admin';
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
  remaining_times: number;
  used: boolean;
  activation_time: string | null;
}

interface OrderRow {
  order_id: string;
  payment_status: string;
  payment_time: string | null;
  claimed: boolean;
  claimed_uid: string | null;
  claimed_at: string | null;
}

// ==================== Helpers ====================

const SUB_CACHE_TTL = 60 * 5; // 5 minutes
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
    claimedAt: row.claimed_at ? Number(row.claimed_at) : undefined,
    orderId: row.order_id ?? undefined,
    activationCode: row.activation_code ?? undefined,
    expiresAt: row.expires_at ? Number(row.expires_at) : undefined,
  };
}

// ==================== Subscriptions (uid-based) ====================

export async function getSubscriptionByUid(uid: string): Promise<Subscription | null> {
  // Try cache first
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
      `INSERT INTO subscriptions (uid, device_id, status, source, total_usage, remaining_usage, claimed_at, order_id, activation_code, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         device_id = COALESCE(VALUES(device_id), device_id),
         status = VALUES(status),
         source = VALUES(source),
         total_usage = VALUES(total_usage),
         remaining_usage = VALUES(remaining_usage),
         claimed_at = COALESCE(VALUES(claimed_at), claimed_at),
         order_id = COALESCE(VALUES(order_id), order_id),
         activation_code = COALESCE(VALUES(activation_code), activation_code),
         expires_at = COALESCE(VALUES(expires_at), expires_at)`,
      [
        uid,
        subscription.deviceId ?? null,
        subscription.status ?? 'inactive',
        subscription.source ?? 'mbaodu',
        subscription.totalUsage ?? TOTAL_USAGE,
        subscription.remainingUsage ?? 0,
        subscription.claimedAt ?? null,
        subscription.orderId ?? null,
        subscription.activationCode ?? null,
        subscription.expiresAt ?? null,
      ]
    );
    // Update cache
    const updated = await getSubscriptionByUid(uid);
    if (updated) await cacheSet(SUB_CACHE_KEY(uid), updated, SUB_CACHE_TTL);
  } catch (err) {

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

// ==================== Usage Consumption (uid-based, MySQL Transaction) ====================

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

      // Sync cache
      const sub = rowToSubscription(rows[0]);
      sub.remainingUsage = newCount;
      await cacheSet(SUB_CACHE_KEY(uid), sub, SUB_CACHE_TTL);
      return newCount;
    });
  } catch (err) {

    return 0;
  }
}

// ==================== Admin Activation Codes (account-bound) ====================

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
      `INSERT INTO admin_activation_codes (code, created_at, expires_at, total_times, remaining_times)
       VALUES (?, ?, ?, ?, ?)`,
      [code, now, expiresAt, totalTimes, totalTimes]
    );
    return { code, expiresAt, totalTimes };
  } catch (err) {

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

      // Revoke previous user's subscription (if different uid)
      if (data.uid && data.uid !== uid) {
        await txExecute(conn, "UPDATE subscriptions SET status = 'inactive', remaining_usage = 0 WHERE uid = ?", [data.uid]);
        await cacheDel(`sub:${data.uid}`);
      }

      // Same user - return success
      if (data.uid === uid) {
        return { success: true, remainingCodes: data.remaining_times, expiresAt };
      }

      const now = Date.now();
      // Update admin code with uid
      await txExecute(
        conn,
        `UPDATE admin_activation_codes SET used = TRUE, uid = ?, device_id = ?, activation_time = ? WHERE code = ?`,
        [uid, deviceId ?? null, now, code]
      );

      // Upsert subscription for this uid
      await txExecute(
        conn,
        `INSERT INTO subscriptions (uid, device_id, status, source, total_usage, remaining_usage, claimed_at, activation_code, expires_at)
         VALUES (?, ?, 'active', 'admin', ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           device_id = VALUES(device_id),
           status = 'active',
           source = 'admin',
           total_usage = VALUES(total_usage),
           remaining_usage = VALUES(remaining_usage),
           claimed_at = VALUES(claimed_at),
           activation_code = VALUES(activation_code),
           expires_at = VALUES(expires_at)`,
        [uid, deviceId ?? null, data.total_times, data.remaining_times, now, code, expiresAt]
      );

      return { success: true, remainingCodes: data.remaining_times, expiresAt };
    });
  } catch (err) {

    return { success: false, error: 'db_error' };
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
    const rows = await queryWithLimit<AdminActivationCodeRow>(
      'SELECT * FROM admin_activation_codes ORDER BY created_at DESC',
      limit, offset
    );
    const codes = rows.map((r) => ({
      code: r.code,
      uid: r.uid ?? undefined,
      deviceId: r.device_id ?? undefined,
      createdAt: Number(r.created_at),
      expiresAt: Number(r.expires_at),
      totalTimes: r.total_times,
      remainingTimes: r.remaining_times,
      used: r.used,
      activationTime: r.activation_time ? Number(r.activation_time) : undefined,
    }));
    return { codes, total };
  } catch (err) {

    return { codes: [], total: 0 };
  }
}

// ==================== Orders ====================

export async function isOrderClaimed(orderId: string): Promise<boolean> {
  if (!isMySQLAvailable) return false;
  try {
    const [row] = await query<{ claimed: boolean }>(
      'SELECT claimed FROM orders WHERE order_id = ?',
      [orderId]
    );
    return row?.claimed ?? false;
  } catch (err) {

    return false;
  }
}

// ==================== MBAODU Activation Codes (admin panel, legacy) ====================

interface ActivationCodeRow {
  order_id: string;
  code_index: number;
  code: string;
  used: boolean;
  device_id: string | null;
  uid: string | null;
  remaining_codes: number;
  activation_time: string | null;
}

export interface ActivationCode {
  code: string;
  used: boolean;
  deviceId?: string;
  remainingCodes: number;
  activationTime?: number;
}

export async function getActivationCode(
  orderId: string,
  index: 1 | 2
): Promise<ActivationCode | null> {
  if (!isMySQLAvailable) return null;
  try {
    const rows = await query<ActivationCodeRow>(
      'SELECT * FROM activation_codes WHERE order_id = ? AND code_index = ?',
      [orderId, index]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      code: r.code,
      used: r.used,
      deviceId: r.device_id ?? undefined,
      remainingCodes: r.remaining_codes,
      activationTime: r.activation_time ? Number(r.activation_time) : undefined,
    };
  } catch (err) {

    return null;
  }
}

export async function setActivationCode(
  orderId: string,
  index: 1 | 2,
  code: string,
  remainingCodes = 100
): Promise<void> {
  if (!isMySQLAvailable) return;
  try {
    await execute(
      `INSERT INTO activation_codes (order_id, code_index, code, remaining_codes)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE code = VALUES(code), remaining_codes = VALUES(remaining_codes)`,
      [orderId, index, code, remainingCodes]
    );
  } catch (err) {

  }
}

export async function getActivationCodes(orderId: string): Promise<{ code1: ActivationCode | null; code2: ActivationCode | null }> {
  const [c1, c2] = await Promise.all([getActivationCode(orderId, 1), getActivationCode(orderId, 2)]);
  return { code1: c1, code2: c2 };
}

export async function setActivationCodes(
  orderId: string,
  code1: string,
  code2: string,
  remainingCodes = 100
): Promise<void> {
  if (!isMySQLAvailable) return;
  try {
    await execute(
      `INSERT INTO activation_codes (order_id, code_index, code, remaining_codes)
       VALUES (?, 1, ?, ?)
       ON DUPLICATE KEY UPDATE code = VALUES(code), remaining_codes = VALUES(remaining_codes)`,
      [orderId, code1, remainingCodes]
    );
    await execute(
      `INSERT INTO activation_codes (order_id, code_index, code, remaining_codes)
       VALUES (?, 2, ?, ?)
       ON DUPLICATE KEY UPDATE code = VALUES(code), remaining_codes = VALUES(remaining_codes)`,
      [orderId, code2, remainingCodes]
    );
  } catch (err) {

  }
}

// ==================== 48-hour order query window ====================

export async function getOrderCreatedTime(orderId: string): Promise<number | null> {
  if (!isMySQLAvailable) return null;
  try {
    const [row] = await query<{ payment_time: number | null }>(
      'SELECT payment_time FROM orders WHERE order_id = ?',
      [orderId]
    );
    return row?.payment_time ?? null;
  } catch (err) {

    return null;
  }
}

export async function canQueryOrder(orderId: string): Promise<{ allowed: boolean; remainingSeconds: number }> {
  const createdTime = await getOrderCreatedTime(orderId);
  // No record or no payment time → allow query (order hasn't been claimed yet)
  if (createdTime === null) return { allowed: true, remainingSeconds: 0 };
  const now = Date.now();
  const elapsed = now - createdTime;
  const LIMIT_MS = 48 * 60 * 60 * 1000;
  if (elapsed >= LIMIT_MS) return { allowed: false, remainingSeconds: 0 };
  return { allowed: true, remainingSeconds: Math.ceil((LIMIT_MS - elapsed) / 1000) };
}

// ==================== Admin Activation Codes (single code lookup) ====================

export async function getAdminActivationCode(code: string): Promise<AdminActivationCode | null> {
  if (!isMySQLAvailable) return null;
  try {
    const rows = await query<AdminActivationCodeRow>(
      'SELECT * FROM admin_activation_codes WHERE code = ?',
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
      remainingTimes: r.remaining_times,
      used: r.used,
      activationTime: r.activation_time ? Number(r.activation_time) : undefined,
    };
  } catch (err) {

    return null;
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