import crypto from 'crypto';
import { Redis } from '@upstash/redis';

const PAID_LIMIT = parseInt(process.env.PAID_LIMIT || '50', 10);
const FREE_LIMIT_PER_DAY = parseInt(process.env.FREE_LIMIT_PER_DAY || '1', 10);

export function isRedisConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (!_redis) {
    if (!isRedisConfigured()) {
      throw new Error('Redis not configured');
    }
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return _redis;
}

// Interfaces
export interface Subscription {
  status: 'active' | 'inactive';
  source: 'mbaodu' | 'admin';  // 激活来源
  remainingCodes: number;
  activationTime?: number;
  activationCodeIndex?: 1 | 2; // 记录激活时使用的是哪个码，用于后续同步
  orderId?: string; // 记录订单号（仅 mbaodu）
  expiresAt?: number; // 仅 admin 来源有
  activationCode?: string; // 使用的激活码（仅 admin 来源有）
}

export interface ActivationCode {
  code: string;
  used: boolean;
  deviceId?: string;
  remainingCodes: number; // 码上剩余次数，与设备订阅同步
  activationTime?: number;
}

// 管理端激活码
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

// Free count (daily) - use local date to match user's timezone
function getLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayKey(deviceId: string): string {
  return `device:${deviceId}:free:${getLocalDateString()}`;
}

interface FreeCountData {
  count: number;
  date: string;
}

export async function getFreeCount(deviceId: string): Promise<number> {
  const key = getTodayKey(deviceId);
  const data = await getRedis().get<FreeCountData>(key);
  if (!data || typeof data !== 'object') return 0;
  if (data.date !== getLocalDateString()) return 0;
  return data.count ?? 0;
}

export async function incrementFreeCount(deviceId: string): Promise<number> {
  const key = getTodayKey(deviceId);
  const today = getLocalDateString();

  // Store data as object with date
  const existing = await getRedis().get<FreeCountData>(key);
  if (!existing || typeof existing !== 'object' || (existing as FreeCountData).date !== today) {
    // New day or no data - reset count
    await getRedis().set(key, { count: 1, date: today });
    // Set TTL until midnight local time
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const ttl = Math.floor((midnight.getTime() - now.getTime()) / 1000);
    await getRedis().expire(key, Math.max(ttl, 60));
    return 1;
  }

  // Same day - increment count
  const count = await getRedis().incr(key);
  // Update the stored data with new count and date
  await getRedis().set(key, { count, date: today });
  return count;
}

// Subscription
export async function getSubscription(deviceId: string): Promise<Subscription | null> {
  const key = `device:${deviceId}:subscription`;
  const data = await getRedis().get<Subscription>(key);
  return data ?? null;
}

// Usage tracking for paid users
export async function getRemainingUsage(deviceId: string): Promise<number> {
  const sub = await getSubscription(deviceId);
  if (!sub || sub.status !== 'active') return 0;
  return sub.remainingCodes;
}

export async function setSubscription(
  deviceId: string,
  subscription: Subscription
): Promise<void> {
  const key = `device:${deviceId}:subscription`;
  await getRedis().set(key, subscription);
}

// Activation codes
export async function setActivationCodes(
  orderId: string,
  code1: string,
  code2: string,
  remainingCodes?: number
): Promise<void> {
  await setActivationCode(orderId, 1, code1, remainingCodes ?? PAID_LIMIT);
  await setActivationCode(orderId, 2, code2, remainingCodes ?? PAID_LIMIT);
}

export async function setActivationCode(
  orderId: string,
  index: 1 | 2,
  code: string,
  remainingCodes: number = PAID_LIMIT
): Promise<void> {
  const codeData: ActivationCode = {
    code,
    used: false,
    remainingCodes,
  };
  const key = `activation:${orderId}:${index}`;
  const ttl = 60 * 60 * 24 * 30;
  await getRedis().set(key, codeData, { ex: ttl });
}

export async function getActivationCode(
  orderId: string,
  index: 1 | 2
): Promise<ActivationCode | null> {
  const key = `activation:${orderId}:${index}`;
  const data = await getRedis().get<ActivationCode>(key);
  return data ?? null;
}

export async function consumeActivationCode(
  orderId: string,
  index: 1 | 2,
  deviceId: string
): Promise<{ success: boolean; error?: string; previousDeviceId?: string; remainingCodes?: number }> {
  const key = `activation:${orderId}:${index}`;
  const data = await getRedis().get<ActivationCode>(key);

  if (!data) {
    return { success: false, error: 'invalid_code' };
  }

  if (data.used && data.deviceId && data.deviceId !== deviceId) {
    await clearDeviceSubscription(data.deviceId);
  }

  const now = Math.floor(Date.now() / 1000);

  await getRedis().set(
    key,
    {
      ...data,
      used: true,
      deviceId,
      remainingCodes: data.remainingCodes,
      activationTime: data.activationTime || now
    },
    { ex: 60 * 60 * 24 * 30 }
  );

  return { success: true, previousDeviceId: data.deviceId, remainingCodes: data.remainingCodes };
}

export async function clearDeviceSubscription(deviceId: string): Promise<void> {
  const key = `device:${deviceId}:subscription`;
  await getRedis().set(key, { status: 'inactive', remainingCodes: 0 } as Subscription, { ex: 60 * 60 * 24 * 30 });
}

// Usage tracking for paid users - also syncs with activation code
export async function consumeUsage(deviceId: string): Promise<number> {
  const sub = await getSubscription(deviceId);
  if (!sub || sub.remainingCodes <= 0) return 0;

  sub.remainingCodes--;

  // Sync to activation code if this device is activated
  if (sub.orderId && sub.activationCodeIndex) {
    // Mbaodu activation code
    const codeKey = `activation:${sub.orderId}:${sub.activationCodeIndex}`;
    const codeData = await getActivationCodeInternal(codeKey);
    if (codeData) {
      codeData.remainingCodes = sub.remainingCodes;
      await setActivationCodeInternal(codeKey, codeData);
    }
  } else if (sub.source === 'admin' && sub.activationCode) {
    // Admin activation code
    const codeKey = `admin:code:${sub.activationCode}`;
    const codeData = await getAdminActivationCodeInternal(codeKey);
    if (codeData) {
      codeData.remainingTimes = sub.remainingCodes;
      await setAdminActivationCodeInternal(codeKey, codeData);
    }
  }

  await setSubscription(deviceId, sub);
  return sub.remainingCodes;
}

// Internal helpers for use by consumeUsage
async function getActivationCodeInternal(key: string): Promise<ActivationCode | null> {
  const data = await getRedis().get<ActivationCode>(key);
  return data ?? null;
}

async function setActivationCodeInternal(key: string, data: ActivationCode): Promise<void> {
  await getRedis().set(key, data, { ex: 60 * 60 * 24 * 30 });
}

async function getAdminActivationCodeInternal(key: string): Promise<AdminActivationCode | null> {
  const data = await getRedis().get<AdminActivationCode>(key);
  return data ?? null;
}

async function setAdminActivationCodeInternal(key: string, data: AdminActivationCode): Promise<void> {
  await getRedis().set(key, data, { ex: ADMIN_CODE_TTL });
}

// Check if paid user
export async function isPaidUser(deviceId: string): Promise<boolean> {
  const sub = await getSubscription(deviceId);
  return sub !== null && sub.status === 'active' && sub.remainingCodes > 0;
}

// Constants
export { PAID_LIMIT, FREE_LIMIT_PER_DAY };

// Order activation tracking
export async function isOrderActivated(orderId: string): Promise<boolean> {
  const key = `used_order:${orderId}`;
  const data = await getRedis().get<string>(key);
  return data !== null;
}

export async function markOrderActivated(orderId: string): Promise<void> {
  const key = `used_order:${orderId}`;
  await getRedis().set(key, '1', { ex: 60 * 60 * 24 * 30 });
}

export async function setUsedOrderTTL(orderId: string, ttlDays = 30): Promise<void> {
  const key = `used_order:${orderId}`;
  await getRedis().expire(key, ttlDays * 24 * 60 * 60);
}

// Order creation time tracking for 48-hour query restriction
export async function setOrderCreatedTime(orderId: string, timestamp: number): Promise<void> {
  const key = `order_created:${orderId}`;
  await getRedis().set(key, timestamp, { ex: 60 * 60 * 24 * 60 }); // 60 days TTL
}

export async function getOrderCreatedTime(orderId: string): Promise<number | null> {
  const key = `order_created:${orderId}`;
  const data = await getRedis().get<number>(key);
  return data ?? null;
}

export async function canQueryOrder(orderId: string): Promise<{ allowed: boolean; remainingSeconds: number }> {
  const createdTime = await getOrderCreatedTime(orderId);
  if (createdTime === null) {
    // No creation time means callback not called - allow query
    return { allowed: true, remainingSeconds: 0 };
  }

  const now = Date.now();
  const elapsed = now - createdTime;
  const LIMIT_MS = 48 * 60 * 60 * 1000; // 48 hours

  if (elapsed >= LIMIT_MS) {
    // Beyond 48 hours, cannot query
    return { allowed: false, remainingSeconds: 0 };
  }

  // Within 48 hours, allow query
  return { allowed: true, remainingSeconds: Math.ceil((LIMIT_MS - elapsed) / 1000) };
}

// Admin functions - get both activation codes for an order
export async function getActivationCodes(orderId: string): Promise<{ code1: ActivationCode | null; code2: ActivationCode | null }> {
  const key1 = `activation:${orderId}:1`;
  const key2 = `activation:${orderId}:2`;
  const [code1, code2] = await Promise.all([
    getRedis().get<ActivationCode>(key1),
    getRedis().get<ActivationCode>(key2),
  ]);
  return { code1: code1 ?? null, code2: code2 ?? null };
}

// Admin token management
const ADMIN_TOKEN_PREFIX = 'admin:token:';
const ADMIN_TOKEN_TTL = 60 * 60 * 2; // 2 hours

/**
 * Generate a random admin token, store its hash in Redis with TTL.
 * Returns the raw token (to set as cookie) - never store raw token in DB.
 */
export async function setAdminToken(rawToken: string): Promise<void> {
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
  await getRedis().set(`${ADMIN_TOKEN_PREFIX}${hash}`, Date.now().toString(), { ex: ADMIN_TOKEN_TTL });
}

// Admin login brute force protection
const ADMIN_FAIL_KEY_PREFIX = 'admin:fail:';
const ADMIN_MAX_FAIL = 5;
const ADMIN_BLOCK_MS = 15 * 60 * 1000; // 15 minutes

interface AdminFailData {
  count: number;
  blockedUntil?: number;
}

export async function checkAdminBlocked(ip: string): Promise<{ blocked: boolean; remainingSeconds: number }> {
  const key = `${ADMIN_FAIL_KEY_PREFIX}${ip}`;
  const data = await getRedis().get<AdminFailData>(key);
  if (!data || !data.blockedUntil) return { blocked: false, remainingSeconds: 0 };
  const now = Date.now();
  if (now < data.blockedUntil) {
    return { blocked: true, remainingSeconds: Math.ceil((data.blockedUntil - now) / 1000) };
  }
  await getRedis().set(key, { count: 0 });
  return { blocked: false, remainingSeconds: 0 };
}

export async function recordAdminFailedAttempt(ip: string): Promise<void> {
  const key = `${ADMIN_FAIL_KEY_PREFIX}${ip}`;
  const data = await getRedis().get<AdminFailData>(key) || { count: 0 };
  data.count++;
  if (data.count >= ADMIN_MAX_FAIL) {
    data.blockedUntil = Date.now() + ADMIN_BLOCK_MS;
  }
  await getRedis().set(key, data);
}

export async function resetAdminFailedAttempts(ip: string): Promise<void> {
  await getRedis().set(`${ADMIN_FAIL_KEY_PREFIX}${ip}`, { count: 0 });
}

// ==================== Admin Activation Codes ====================

const ADMIN_CODE_PREFIX = 'admin:code:';
const ADMIN_CODE_LIST_KEY = 'admin:codes:list';
const ADMIN_CODE_TTL = 60 * 60 * 24 * 31; // 31 days

export async function createAdminActivationCode(
  code: string,
  totalTimes: number = 50
): Promise<AdminActivationCode> {
  const now = Date.now();
  const adminCode: AdminActivationCode = {
    code,
    createdAt: now,
    expiresAt: now + 30 * 24 * 60 * 60 * 1000,
    totalTimes,
    remainingTimes: totalTimes,
    used: false,
  };

  await getRedis().set(`${ADMIN_CODE_PREFIX}${code}`, adminCode, { ex: ADMIN_CODE_TTL });
  // Add to sorted set for listing (score = createdAt)
  await getRedis().zadd(ADMIN_CODE_LIST_KEY, { score: now, member: code });
  return adminCode;
}

export async function getAdminActivationCode(code: string): Promise<AdminActivationCode | null> {
  const data = await getRedis().get<AdminActivationCode>(`${ADMIN_CODE_PREFIX}${code}`);
  return data ?? null;
}

export async function listAdminActivationCodes(
  page: number = 1,
  limit: number = 20
): Promise<{ codes: AdminActivationCode[]; total: number }> {
  const total = await getRedis().zcard(ADMIN_CODE_LIST_KEY);
  const results = await getRedis().zrange(ADMIN_CODE_LIST_KEY, (page - 1) * limit, page * limit - 1);
  const codes: AdminActivationCode[] = [];
  for (const code of results) {
    const data = await getRedis().get<AdminActivationCode>(`${ADMIN_CODE_PREFIX}${code}`);
    if (data) codes.push(data);
  }
  return { codes, total };
}

export async function consumeAdminActivationCode(
  code: string,
  deviceId: string
): Promise<{ success: boolean; error?: string; remainingCodes?: number; expiresAt?: number }> {
  const key = `${ADMIN_CODE_PREFIX}${code}`;
  const data = await getRedis().get<AdminActivationCode>(key);

  if (!data) {
    return { success: false, error: 'invalid_code' };
  }

  // Check expiry
  if (Date.now() > data.expiresAt) {
    return { success: false, error: 'expired_code' };
  }

  // If code already used by another device, revoke that device's subscription
  if (data.used && data.deviceId && data.deviceId !== deviceId) {
    await clearDeviceSubscription(data.deviceId);
  }

  // Same device - just return success
  if (data.deviceId === deviceId) {
    return {
      success: true,
      remainingCodes: data.remainingTimes,
      expiresAt: data.expiresAt
    };
  }

  // New device - update
  await getRedis().set(
    key,
    {
      ...data,
      used: true,
      deviceId,
      remainingTimes: data.remainingTimes,
      activationTime: data.activationTime || Date.now()
    },
    { ex: ADMIN_CODE_TTL }
  );

  return {
    success: true,
    remainingCodes: data.remainingTimes,
    expiresAt: data.expiresAt
  };
}

// ==================== Activation Code Rate Limiting ====================

const ACT_FAIL_KEY_PREFIX = 'act:fail:';
const ACT_MAX_FAIL = 5;
const ACT_BLOCK_MS = 15 * 60 * 1000; // 15 minutes

interface ActFailData {
  count: number;
  blockedUntil?: number;
}

export async function checkActivationBlockedRedis(
  ip: string,
  deviceId: string
): Promise<{ blocked: boolean; remainingSeconds: number }> {
  const key = `${ACT_FAIL_KEY_PREFIX}${ip}:${deviceId}`;
  const data = await getRedis().get<ActFailData>(key);
  if (!data) return { blocked: false, remainingSeconds: 0 };
  if (data.blockedUntil) {
    const now = Date.now();
    if (now < data.blockedUntil) {
      return { blocked: true, remainingSeconds: Math.ceil((data.blockedUntil - now) / 1000) };
    }
    await getRedis().set(key, { count: 0 });
  }
  return { blocked: false, remainingSeconds: 0 };
}

export async function recordActivationFailedAttemptRedis(
  ip: string,
  deviceId: string
): Promise<void> {
  const key = `${ACT_FAIL_KEY_PREFIX}${ip}:${deviceId}`;
  const data = await getRedis().get<ActFailData>(key) || { count: 0 };
  data.count++;
  if (data.count >= ACT_MAX_FAIL) {
    data.blockedUntil = Date.now() + ACT_BLOCK_MS;
  }
  await getRedis().set(key, data, { ex: Math.ceil(ACT_BLOCK_MS / 1000) });
}

export async function resetActivationFailedAttemptsRedis(
  ip: string,
  deviceId: string
): Promise<void> {
  await getRedis().set(`${ACT_FAIL_KEY_PREFIX}${ip}:${deviceId}`, { count: 0 });
}