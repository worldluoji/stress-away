import crypto from 'crypto';
import { Redis } from '@upstash/redis';



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

export async function decrementFreeCount(deviceId: string): Promise<number> {
  const key = getTodayKey(deviceId);
  const today = getLocalDateString();
  const existing = await getRedis().get<FreeCountData>(key);
  if (!existing || typeof existing !== 'object' || (existing as FreeCountData).date !== today) {
    return 0;
  }
  const current = (existing as FreeCountData).count ?? 0;
  const newCount = Math.max(0, current - 1);
  await getRedis().set(key, { count: newCount, date: today });
  return newCount;
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