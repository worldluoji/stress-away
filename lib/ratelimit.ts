const USE_LOCAL_STORAGE = process.env.USE_LOCAL_STORAGE === 'true';

function isRedisAvailable(): boolean {
  return !!(
    !USE_LOCAL_STORAGE &&
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

async function getRedis() {
  const { Redis } = await import('@upstash/redis');
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

function lsGet<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function lsSet(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

function getMinuteKey(key: string): string {
  const minute = Math.floor(Date.now() / 60000);
  return `rl:${key}:${minute}`;
}

function getTTL(): number {
  return 120;
}

export async function checkRateLimit(
  deviceId: string,
  ip: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const combinedKey = `${deviceId}:${ip}`;
  const minuteKey = getMinuteKey(combinedKey);
  const now = Date.now();
  const resetAt = Math.ceil(now / 60000) * 60000;

  if (USE_LOCAL_STORAGE || !isRedisAvailable) {
    return checkRateLimitLocal(minuteKey, config, resetAt);
  }

  return checkRateLimitRedis(minuteKey, config, resetAt);
}

async function checkRateLimitLocal(
  minuteKey: string,
  config: RateLimitConfig,
  resetAt: number
): Promise<RateLimitResult> {
  const data = lsGet<{ count: number; windowStart: number }>(minuteKey);
  const now = Date.now();

  if (!data || now - data.windowStart > config.windowMs) {
    lsSet(minuteKey, { count: 1, windowStart: now });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt };
  }

  if (data.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt };
  }

  data.count++;
  lsSet(minuteKey, data);
  return { allowed: true, remaining: config.maxRequests - data.count, resetAt };
}

async function checkRateLimitRedis(
  minuteKey: string,
  config: RateLimitConfig,
  resetAt: number
): Promise<RateLimitResult> {
  const { Redis } = await import('@upstash/redis');
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });

  const count = await redis.incr(minuteKey);
  if (count === 1) {
    await redis.expire(minuteKey, getTTL());
  }

  if (count > config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt };
  }

  return { allowed: true, remaining: config.maxRequests - count, resetAt };
}

export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return 'unknown';
}

export function extractClientInfo(request: Request, fallbackDeviceId: string = 'unknown') {
  const ip = getClientIP(request);
  const deviceId = request.headers.get('x-device-id') || fallbackDeviceId;
  return { ip, deviceId };
}

// Predefined rate limit configs
export const RATE_LIMITS = {
  chat: { windowMs: 60000, maxRequests: 20 } as RateLimitConfig,
  activate: { windowMs: 60000, maxRequests: 10 } as RateLimitConfig,
  queryCodes: { windowMs: 60000, maxRequests: 10 } as RateLimitConfig,
  usage: { windowMs: 60000, maxRequests: 30 } as RateLimitConfig,
};

// Device ID anti-spoofing: track unique deviceIds per IP
const DEVICE_ID_TRACK_PREFIX = 'ip:deviceids:';
const DEVICE_ID_TRACK_TTL = 60 * 60; // 1 hour
const DEVICE_ID_MAX_PER_IP = 5;

export interface DeviceIdCheckResult {
  allowed: boolean;
  reason?: string;
}

export async function checkDeviceIdSpoofing(ip: string, deviceId: string): Promise<DeviceIdCheckResult> {
  // Skip for local storage mode (dev)
  if (USE_LOCAL_STORAGE || !isRedisAvailable()) {
    return { allowed: true };
  }

  const key = `${DEVICE_ID_TRACK_PREFIX}${ip}`;
  const redis = await getRedis();

  // Check if deviceId already exists in the set
  const exists = await redis.sismember(key, deviceId);
  if (exists) {
    return { allowed: true };
  }

  // New deviceId - check total count
  const count = await redis.scard(key);
  if (count >= DEVICE_ID_MAX_PER_IP) {
    console.warn(`[Security] Device ID spoofing detected. IP: ${ip}, deviceId: ${deviceId}, count: ${count}`);
    return {
      allowed: false,
      reason: 'device_id_rejected',
    };
  }

  // Allow and add to set
  await redis.sadd(key, deviceId);
  await redis.expire(key, DEVICE_ID_TRACK_TTL);
  return { allowed: true };
}