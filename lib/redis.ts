import { Redis } from '@upstash/redis';

const USE_LOCAL_STORAGE = process.env.USE_LOCAL_STORAGE === 'true';
const PAID_LIMIT = parseInt(process.env.PAID_LIMIT || '50', 10);
const FREE_LIMIT_PER_DAY = parseInt(process.env.FREE_LIMIT_PER_DAY || '1', 10);

function isRedisConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

let _redis: Redis | null = null;

function getRedis(): Redis {
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

export const isRedisAvailable = !USE_LOCAL_STORAGE && isRedisConfigured();

// LocalStorage keys
const LS_PREFIX = 'sa:';

function lsKey(key: string): string {
  return `${LS_PREFIX}${key}`;
}

// LocalStorage helpers
function lsGet<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(lsKey(key));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function lsSet(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(lsKey(key), JSON.stringify(value));
  } catch {
    // ignore
  }
}

function lsDel(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(lsKey(key));
}

// Interfaces
export interface Subscription {
  status: 'active' | 'inactive';
  remainingCodes: number;
  activationTime?: number;
  activationCodeIndex?: 1 | 2; // 记录激活时使用的是哪个码，用于后续同步
  orderId?: string; // 记录订单号
}

export interface ActivationCode {
  code: string;
  used: boolean;
  deviceId?: string;
  remainingCodes: number; // 码上剩余次数，与设备订阅同步
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

  if (USE_LOCAL_STORAGE || !isRedisAvailable) {
    const data = lsGet<FreeCountData>(key);
    if (!data || data.date !== getLocalDateString()) return 0;
    return data.count;
  }

  // Redis branch - check date stored alongside count
  const data = await getRedis().get<FreeCountData>(key);
  if (!data || typeof data !== 'object') return 0;
  if (data.date !== getLocalDateString()) return 0;
  return data.count ?? 0;
}

export async function incrementFreeCount(deviceId: string): Promise<number> {
  const key = getTodayKey(deviceId);
  const today = getLocalDateString();

  if (USE_LOCAL_STORAGE || !isRedisAvailable) {
    const data = lsGet<FreeCountData>(key);
    if (!data || data.date !== today) {
      lsSet(key, { count: 1, date: today });
      return 1;
    }
    data.count++;
    lsSet(key, data);
    return data.count;
  }

  // Redis branch - store data as object with date
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
  if (USE_LOCAL_STORAGE || !isRedisAvailable) {
    return lsGet<Subscription>(`device:${deviceId}:sub`);
  }
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
  if (USE_LOCAL_STORAGE || !isRedisAvailable) {
    lsSet(`device:${deviceId}:sub`, subscription);
    return;
  }
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
  if (USE_LOCAL_STORAGE || !isRedisAvailable) {
    lsSet(`activation:${orderId}:${index}`, codeData);
    return;
  }
  const key = `activation:${orderId}:${index}`;
  const ttl = 60 * 60 * 24 * 30;
  await getRedis().set(key, codeData, { ex: ttl });
}

export async function getActivationCode(
  orderId: string,
  index: 1 | 2
): Promise<ActivationCode | null> {
  if (USE_LOCAL_STORAGE || !isRedisAvailable) {
    return lsGet<ActivationCode>(`activation:${orderId}:${index}`);
  }
  const key = `activation:${orderId}:${index}`;
  const data = await getRedis().get<ActivationCode>(key);
  return data ?? null;
}

export async function consumeActivationCode(
  orderId: string,
  index: 1 | 2,
  deviceId: string
): Promise<{ success: boolean; error?: string; previousDeviceId?: string; remainingCodes?: number }> {
  if (USE_LOCAL_STORAGE || !isRedisAvailable) {
    const key = `activation:${orderId}:${index}`;
    const data = lsGet<ActivationCode>(key);
    if (!data) return { success: false, error: 'invalid_code' };

    // If code already used by another device, revoke that device's subscription
    if (data.used && data.deviceId && data.deviceId !== deviceId) {
      lsDel(`device:${data.deviceId}:sub`);
    }

    // Update activation code - inherit remainingCodes from code
    lsSet(key, {
      ...data,
      used: true,
      deviceId,
      remainingCodes: data.remainingCodes,
      activationTime: data.activationTime || Date.now()
    });

    // Return the remaining codes from the code itself
    return { success: true, previousDeviceId: data.deviceId, remainingCodes: data.remainingCodes };
  }

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
  if (USE_LOCAL_STORAGE || !isRedisAvailable) {
    lsDel(`device:${deviceId}:sub`);
    return;
  }
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
    const codeKey = `activation:${sub.orderId}:${sub.activationCodeIndex}`;
    const codeData = await getActivationCodeInternal(codeKey);
    if (codeData) {
      codeData.remainingCodes = sub.remainingCodes;
      await setActivationCodeInternal(codeKey, codeData);
    }
  }

  await setSubscription(deviceId, sub);
  return sub.remainingCodes;
}

// Internal helpers for use by consumeUsage
async function getActivationCodeInternal(key: string): Promise<ActivationCode | null> {
  if (USE_LOCAL_STORAGE || !isRedisAvailable) {
    return lsGet<ActivationCode>(key);
  }
  const data = await getRedis().get<ActivationCode>(key);
  return data ?? null;
}

async function setActivationCodeInternal(key: string, data: ActivationCode): Promise<void> {
  if (USE_LOCAL_STORAGE || !isRedisAvailable) {
    lsSet(key, data);
    return;
  }
  await getRedis().set(key, data, { ex: 60 * 60 * 24 * 30 });
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
  if (USE_LOCAL_STORAGE || !isRedisAvailable) {
    return lsGet<string>(`used_order:${orderId}`) !== null;
  }
  const key = `used_order:${orderId}`;
  const data = await getRedis().get<string>(key);
  return data !== null;
}

export async function markOrderActivated(orderId: string): Promise<void> {
  if (USE_LOCAL_STORAGE || !isRedisAvailable) {
    lsSet(`used_order:${orderId}`, '1');
    return;
  }
  const key = `used_order:${orderId}`;
  await getRedis().set(key, '1', { ex: 60 * 60 * 24 * 30 });
}

export async function setUsedOrderTTL(orderId: string, ttlDays = 30): Promise<void> {
  if (USE_LOCAL_STORAGE || !isRedisAvailable) {
    lsSet(`used_order:${orderId}`, '1');
    return;
  }
  const key = `used_order:${orderId}`;
  await getRedis().expire(key, ttlDays * 24 * 60 * 60);
}

// Order creation time tracking for 48-hour query restriction
export async function setOrderCreatedTime(orderId: string, timestamp: number): Promise<void> {
  if (USE_LOCAL_STORAGE || !isRedisAvailable) {
    lsSet(`order_created:${orderId}`, timestamp);
    return;
  }
  const key = `order_created:${orderId}`;
  await getRedis().set(key, timestamp, { ex: 60 * 60 * 24 * 60 }); // 60 days TTL
}

export async function getOrderCreatedTime(orderId: string): Promise<number | null> {
  if (USE_LOCAL_STORAGE || !isRedisAvailable) {
    return lsGet<number>(`order_created:${orderId}`);
  }
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
  if (USE_LOCAL_STORAGE || !isRedisAvailable) {
    const code1 = lsGet<ActivationCode>(`activation:${orderId}:1`);
    const code2 = lsGet<ActivationCode>(`activation:${orderId}:2`);
    return { code1, code2 };
  }
  const key1 = `activation:${orderId}:1`;
  const key2 = `activation:${orderId}:2`;
  const [code1, code2] = await Promise.all([
    getRedis().get<ActivationCode>(key1),
    getRedis().get<ActivationCode>(key2),
  ]);
  return { code1: code1 ?? null, code2: code2 ?? null };
}