const USE_LOCAL_STORAGE = process.env.USE_LOCAL_STORAGE === 'true';

function isRedisAvailable(): boolean {
  return !!(
    !USE_LOCAL_STORAGE &&
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  );
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
  callback: { windowMs: 60000, maxRequests: 5 } as RateLimitConfig,
};