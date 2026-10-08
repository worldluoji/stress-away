import { kvGet, kvSet } from '@/lib/kv';
import { TtlMap } from '@/lib/ttl-map';

const rateStore = new TtlMap();

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

const RATE_BUCKET_TTL_MS = 120_000;

export async function checkRateLimit(
  deviceId: string,
  ip: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const combinedKey = `${deviceId}:${ip}`;
  const minuteKey = getMinuteKey(combinedKey);
  const now = Date.now();
  const resetAt = Math.ceil(now / 60000) * 60000;

  const count = rateStore.incr(minuteKey, RATE_BUCKET_TTL_MS);

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
  usage: { windowMs: 60000, maxRequests: 30 } as RateLimitConfig,
  report: { windowMs: 60000, maxRequests: 5 } as RateLimitConfig,
};

// Device ID anti-spoofing: track unique deviceIds per IP
const DEVICE_ID_TRACK_PREFIX = 'ip:deviceids:';
const DEVICE_ID_TRACK_TTL_MS = 60 * 60 * 1000; // 1 hour
const DEVICE_ID_MAX_PER_IP = 5;

export interface DeviceIdCheckResult {
  allowed: boolean;
  reason?: string;
}

export async function checkDeviceIdSpoofing(ip: string, deviceId: string): Promise<DeviceIdCheckResult> {
  const key = `${DEVICE_ID_TRACK_PREFIX}${ip}`;
  const knownDeviceIds = await kvGet<string[]>(key) ?? [];

  if (knownDeviceIds.includes(deviceId)) {
    return { allowed: true };
  }

  if (knownDeviceIds.length >= DEVICE_ID_MAX_PER_IP) {
    return {
      allowed: false,
      reason: 'device_id_rejected',
    };
  }

  knownDeviceIds.push(deviceId);
  await kvSet(key, knownDeviceIds, DEVICE_ID_TRACK_TTL_MS);
  return { allowed: true };
}