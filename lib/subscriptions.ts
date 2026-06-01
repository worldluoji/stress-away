/**
 * stress-away Subscriptions & Activation
 *
 * MySQL as source of truth, Redis as read-through cache (5 min TTL).
 *
 * Write path: MySQL first → sync Redis cache
 * Read path: Redis first → miss → MySQL → cache result
 * MySQL unavailable → fallback to Redis/LocalStorage (dev mode)
 */

import { query, execute, withTransaction, txQuery, txExecute, isMySQLAvailable, queryWithLimit } from './db';
import { getRedis, isRedisConfigured } from './redis';
import type { Redis } from '@upstash/redis';

const PAID_LIMIT = parseInt(process.env.PAID_LIMIT || '50', 10);
const FREE_LIMIT_PER_DAY = parseInt(process.env.FREE_LIMIT_PER_DAY || '1', 10);
const ADMIN_CODE_TTL = 60 * 60 * 24 * 31; // 31 days in seconds

// ==================== Types ====================

export interface Subscription {
  status: 'active' | 'inactive';
  source: 'mbaodu' | 'admin';
  remainingCodes: number;
  activationTime?: number;
  activationCodeIndex?: 1 | 2;
  orderId?: string;
  expiresAt?: number;
  activationCode?: string;
}

export interface ActivationCode {
  code: string;
  used: boolean;
  deviceId?: string;
  remainingCodes: number;
  activationTime?: number;
}

export interface AdminActivationCode {
  code: string;
  createdAt: number;
  expiresAt: number;
  totalTimes: number;
  remainingTimes: number;
  used: boolean;
  deviceId?: string;
  activationTime?: number;
}

interface SubscriptionRow {
  device_id: string;
  status: 'active' | 'inactive';
  source: 'mbaodu' | 'admin';
  remaining_codes: number;
  activation_time: string | null;
  activation_code_index: number | null;
  order_id: string | null;
  expires_at: string | null;
  activation_code: string | null;
}

interface ActivationCodeRow {
  order_id: string;
  code_index: number;
  code: string;
  used: boolean;
  device_id: string | null;
  remaining_codes: number;
  activation_time: string | null;
}

interface AdminActivationCodeRow {
  code: string;
  created_at: string;
  expires_at: string;
  total_times: number;
  remaining_times: number;
  used: boolean;
  device_id: string | null;
  activation_time: string | null;
}

interface OrderRow {
  order_id: string;
  created_at: number;
  activated: boolean;
}

// ==================== Helpers ====================

const SUB_CACHE_TTL = 60 * 5; // 5 minutes
const SUB_CACHE_KEY = (deviceId: string) => `sub:${deviceId}`;

async function cacheSet(key: string, value: unknown, ttl: number): Promise<void> {
  if (!isRedisConfigured()) return;
  try {
    await getRedis().set(key, value, { ex: ttl });
  } catch {
    // ignore cache errors
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
    status: row.status,
    source: row.source,
    remainingCodes: row.remaining_codes,
    activationTime: row.activation_time ? new Date(row.activation_time).getTime() : undefined,
    activationCodeIndex: row.activation_code_index as 1 | 2 | undefined,
    orderId: row.order_id ?? undefined,
    expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : undefined,
    activationCode: row.activation_code ?? undefined,
  };
}

// ==================== Subscriptions ====================

export async function getSubscription(deviceId: string): Promise<Subscription | null> {
  // Try cache first
  const cached = await cacheGet<Subscription>(SUB_CACHE_KEY(deviceId));
  if (cached) return cached;

  if (!isMySQLAvailable) return null;
  try {
    const rows = await query<SubscriptionRow>(
      'SELECT * FROM subscriptions WHERE device_id = ?',
      [deviceId]
    );
    if (rows.length === 0) return null;
    const sub = rowToSubscription(rows[0]);
    await cacheSet(SUB_CACHE_KEY(deviceId), sub, SUB_CACHE_TTL);
    return sub;
  } catch (err) {
    console.error('[subscriptions] getSubscription error:', err);
    return null;
  }
}

export async function setSubscription(
  deviceId: string,
  subscription: Subscription
): Promise<void> {
  if (!isMySQLAvailable) return;
  try {
    await execute(
      `INSERT INTO subscriptions (device_id, status, source, remaining_codes, activation_time, activation_code_index, order_id, expires_at, activation_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         source = VALUES(source),
         remaining_codes = VALUES(remaining_codes),
         activation_time = VALUES(activation_time),
         activation_code_index = VALUES(activation_code_index),
         order_id = VALUES(order_id),
         expires_at = VALUES(expires_at),
         activation_code = VALUES(activation_code)`,
      [
        deviceId,
        subscription.status,
        subscription.source,
        subscription.remainingCodes,
        subscription.activationTime ? new Date(subscription.activationTime) : null,
        subscription.activationCodeIndex ?? null,
        subscription.orderId ?? null,
        subscription.expiresAt ? new Date(subscription.expiresAt) : null,
        subscription.activationCode ?? null,
      ]
    );
    await cacheSet(SUB_CACHE_KEY(deviceId), subscription, SUB_CACHE_TTL);
  } catch (err) {
    console.error('[subscriptions] setSubscription error:', err);
  }
}

export async function getRemainingUsage(deviceId: string): Promise<number> {
  const sub = await getSubscription(deviceId);
  if (!sub || sub.status !== 'active') return 0;
  return sub.remainingCodes;
}

export async function isPaidUser(deviceId: string): Promise<boolean> {
  const sub = await getSubscription(deviceId);
  return sub !== null && sub.status === 'active' && sub.remainingCodes > 0;
}

// ==================== Usage Consumption (MySQL Transaction) ====================

export async function getActivationCodes(orderId: string): Promise<{ code1: ActivationCode | null; code2: ActivationCode | null }> {
  const [c1, c2] = await Promise.all([getActivationCode(orderId, 1), getActivationCode(orderId, 2)]);
  return { code1: c1, code2: c2 };
}

export async function setActivationCode(
  orderId: string,
  index: 1 | 2,
  code: string,
  remainingCodes: number = PAID_LIMIT
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
    console.error('[subscriptions] setActivationCode error:', err);
  }
}

export async function consumeUsage(deviceId: string): Promise<number> {
  if (!isMySQLAvailable) return 0;
  try {
    return await withTransaction(async (conn) => {
      // Lock and update in transaction
      const rows = await txQuery<SubscriptionRow>(
        conn,
        'SELECT * FROM subscriptions WHERE device_id = ? FOR UPDATE',
        [deviceId]
      );
      if (rows.length === 0 || rows[0].status !== 'active' || rows[0].remaining_codes <= 0) {
        await conn.commit();
        return 0;
      }
      const newCount = rows[0].remaining_codes - 1;
      await txExecute(
        conn,
        'UPDATE subscriptions SET remaining_codes = ? WHERE device_id = ?',
        [newCount, deviceId]
      );
      await conn.commit();

      // Sync cache
      const sub = rowToSubscription(rows[0]);
      sub.remainingCodes = newCount;
      await cacheSet(SUB_CACHE_KEY(deviceId), sub, SUB_CACHE_TTL);
      return newCount;
    });
  } catch (err) {
    console.error('[subscriptions] consumeUsage error:', err);
    return 0;
  }
}

// ==================== Activation Codes ====================

export async function setActivationCodes(
  orderId: string,
  code1: string,
  code2: string,
  remainingCodes = PAID_LIMIT
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
    console.error('[subscriptions] setActivationCodes error:', err);
  }
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
      activationTime: r.activation_time ? new Date(r.activation_time).getTime() : undefined,
    };
  } catch (err) {
    console.error('[subscriptions] getActivationCode error:', err);
    return null;
  }
}

export async function consumeActivationCode(
  orderId: string,
  index: 1 | 2,
  deviceId: string
): Promise<{ success: boolean; error?: string; previousDeviceId?: string; remainingCodes?: number }> {
  if (!isMySQLAvailable) {
    return { success: false, error: 'mysql_not_configured' };
  }
  try {
    return await withTransaction(async (conn) => {
      const rows = await txQuery<ActivationCodeRow>(
        conn,
        'SELECT * FROM activation_codes WHERE order_id = ? AND code_index = ? FOR UPDATE',
        [orderId, index]
      );
      if (rows.length === 0) {
        await conn.commit();
        return { success: false, error: 'invalid_code' };
      }
      const data = rows[0];
      const previousDeviceId = data.device_id ?? undefined;

      // Revoke previous device
      if (data.used && previousDeviceId && previousDeviceId !== deviceId) {
        await txExecute(
          conn,
          "UPDATE subscriptions SET status = 'inactive', remaining_codes = 0 WHERE device_id = ?",
          [previousDeviceId]
        );
        await cacheDel(`sub:${previousDeviceId}`);
      }

      const now = Date.now();
      const activationTime = data.activation_time ? new Date(data.activation_time).getTime() : now;

      await txExecute(
        conn,
        `UPDATE activation_codes SET used = TRUE, device_id = ?, activation_time = ?, remaining_codes = ? WHERE order_id = ? AND code_index = ?`,
        [deviceId, new Date(now), data.remaining_codes, orderId, index]
      );
      await conn.commit();

      return {
        success: true,
        previousDeviceId,
        remainingCodes: data.remaining_codes,
      };
    });
  } catch (err) {
    console.error('[subscriptions] consumeActivationCode error:', err);
    return { success: false, error: 'db_error' };
  }
}

export async function clearDeviceSubscription(deviceId: string): Promise<void> {
  if (!isMySQLAvailable) return;
  try {
    await execute(
      "UPDATE subscriptions SET status = 'inactive', remaining_codes = 0 WHERE device_id = ?",
      [deviceId]
    );
    await cacheDel(SUB_CACHE_KEY(deviceId));
  } catch (err) {
    console.error('[subscriptions] clearDeviceSubscription error:', err);
  }
}

// ==================== Admin Activation Codes ====================

export async function createAdminActivationCode(
  code: string,
  totalTimes = 50
): Promise<AdminActivationCode> {
  const now = Date.now();
  const expiresAt = now + 30 * 24 * 60 * 60 * 1000;
  if (!isMySQLAvailable) {
    return { code, createdAt: now, expiresAt, totalTimes, remainingTimes: totalTimes, used: false };
  }
  try {
    await execute(
      `INSERT INTO admin_activation_codes (code, created_at, expires_at, total_times, remaining_times)
       VALUES (?, ?, ?, ?, ?)`,
      [code, now, expiresAt, totalTimes, totalTimes]
    );
    return { code, createdAt: now, expiresAt, totalTimes, remainingTimes: totalTimes, used: false };
  } catch (err) {
    console.error('[subscriptions] createAdminActivationCode error:', err);
    return { code, createdAt: now, expiresAt, totalTimes, remainingTimes: totalTimes, used: false };
  }
}

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
      createdAt: new Date(r.created_at).getTime(),
      expiresAt: new Date(r.expires_at).getTime(),
      totalTimes: r.total_times,
      remainingTimes: r.remaining_times,
      used: r.used,
      deviceId: r.device_id ?? undefined,
      activationTime: r.activation_time ? new Date(r.activation_time).getTime() : undefined,
    };
  } catch (err) {
    console.error('[subscriptions] getAdminActivationCode error:', err);
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
    const rows = await queryWithLimit<AdminActivationCodeRow>(
      'SELECT * FROM admin_activation_codes ORDER BY created_at DESC',
      limit, offset
    );
    const codes = rows.map((r) => ({
      code: r.code,
      createdAt: new Date(r.created_at).getTime(),
      expiresAt: new Date(r.expires_at).getTime(),
      totalTimes: r.total_times,
      remainingTimes: r.remaining_times,
      used: r.used,
      deviceId: r.device_id ?? undefined,
      activationTime: r.activation_time ? new Date(r.activation_time).getTime() : undefined,
    }));
    return { codes, total };
  } catch (err) {
    console.error('[subscriptions] listAdminActivationCodes error:', err);
    return { codes: [], total: 0 };
  }
}

export async function consumeAdminActivationCode(
  code: string,
  deviceId: string
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
        await conn.commit();
        return { success: false, error: 'invalid_code' };
      }
      const data = rows[0];
      const expiresAt = new Date(data.expires_at).getTime();
      if (Date.now() > expiresAt) {
        await conn.commit();
        return { success: false, error: 'expired_code' };
      }

      // Revoke previous device
      if (data.used && data.device_id && data.device_id !== deviceId) {
        await txExecute(
          conn,
          "UPDATE subscriptions SET status = 'inactive', remaining_codes = 0 WHERE device_id = ?",
          [data.device_id]
        );
        await cacheDel(`sub:${data.device_id}`);
      }

      // Same device - just return success
      if (data.device_id === deviceId) {
        await conn.commit();
        return { success: true, remainingCodes: data.remaining_times, expiresAt };
      }

      const now = Date.now();
      const activationTime = data.activation_time ? new Date(data.activation_time).getTime() : now;
      await txExecute(
        conn,
        `UPDATE admin_activation_codes SET used = TRUE, device_id = ?, activation_time = ? WHERE code = ?`,
        [deviceId, new Date(now), code]
      );
      await conn.commit();

      return { success: true, remainingCodes: data.remaining_times, expiresAt };
    });
  } catch (err) {
    console.error('[subscriptions] consumeAdminActivationCode error:', err);
    return { success: false, error: 'db_error' };
  }
}

// ==================== Orders ====================

export async function isOrderActivated(orderId: string): Promise<boolean> {
  if (!isMySQLAvailable) return false;
  try {
    const rows = await query<OrderRow>(
      'SELECT * FROM orders WHERE order_id = ?',
      [orderId]
    );
    return rows.length > 0 && rows[0].activated;
  } catch (err) {
    console.error('[subscriptions] isOrderActivated error:', err);
    return false;
  }
}

export async function markOrderActivated(orderId: string): Promise<void> {
  if (!isMySQLAvailable) return;
  try {
    await execute(
      'INSERT INTO orders (order_id, activated) VALUES (?, TRUE) ON DUPLICATE KEY UPDATE activated = TRUE',
      [orderId]
    );
  } catch (err) {
    console.error('[subscriptions] markOrderActivated error:', err);
  }
}

export async function setOrderCreatedTime(orderId: string, timestamp: number): Promise<void> {
  if (!isMySQLAvailable) return;
  try {
    await execute(
      'INSERT INTO orders (order_id, created_at) VALUES (?, ?) ON DUPLICATE KEY UPDATE created_at = ?',
      [orderId, timestamp, timestamp]
    );
  } catch (err) {
    console.error('[subscriptions] setOrderCreatedTime error:', err);
  }
}

export async function getOrderCreatedTime(orderId: string): Promise<number | null> {
  if (!isMySQLAvailable) return null;
  try {
    const rows = await query<{ created_at: number }>(
      'SELECT created_at FROM orders WHERE order_id = ?',
      [orderId]
    );
    return rows.length > 0 ? rows[0].created_at : null;
  } catch (err) {
    console.error('[subscriptions] getOrderCreatedTime error:', err);
    return null;
  }
}

export async function canQueryOrder(orderId: string): Promise<{ allowed: boolean; remainingSeconds: number }> {
  const createdTime = await getOrderCreatedTime(orderId);
  if (createdTime === null) return { allowed: true, remainingSeconds: 0 };
  const now = Date.now();
  const elapsed = now - createdTime;
  const LIMIT_MS = 48 * 60 * 60 * 1000;
  if (elapsed >= LIMIT_MS) return { allowed: false, remainingSeconds: 0 };
  return { allowed: true, remainingSeconds: Math.ceil((LIMIT_MS - elapsed) / 1000) };
}

// ==================== Exports ====================

export { PAID_LIMIT, FREE_LIMIT_PER_DAY };