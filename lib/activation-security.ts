import { TtlMap } from './ttl-map';

const MAX_FAIL_ATTEMPTS = 5;
const BLOCK_MS = 15 * 60 * 1000; // 15 minutes

interface ActFailData {
  count: number;
  blockedUntil?: number;
}

const failStore = new TtlMap();
const failKey = (ip: string, deviceId: string) => `act:fail:${ip}:${deviceId}`;

export async function checkActivationBlockedAsync(
  ip: string,
  deviceId: string
): Promise<{ blocked: boolean; remainingSeconds: number }> {
  const key = failKey(ip, deviceId);
  const data = failStore.get<ActFailData>(key);
  if (!data) return { blocked: false, remainingSeconds: 0 };
  if (data.blockedUntil) {
    const now = Date.now();
    if (now < data.blockedUntil) {
      return { blocked: true, remainingSeconds: Math.ceil((data.blockedUntil - now) / 1000) };
    }
    failStore.del(key);
  }
  return { blocked: false, remainingSeconds: 0 };
}

export async function recordFailedAttemptAsync(ip: string, deviceId: string): Promise<void> {
  const key = failKey(ip, deviceId);
  const data = failStore.get<ActFailData>(key) || { count: 0 };
  data.count++;
  if (data.count >= MAX_FAIL_ATTEMPTS) {
    data.blockedUntil = Date.now() + BLOCK_MS;
  }
  failStore.set(key, data, BLOCK_MS);
}

export async function resetFailedAttemptsAsync(ip: string, deviceId: string): Promise<void> {
  failStore.del(failKey(ip, deviceId));
}

export function getRemainingAttempts(ip: string, deviceId: string): number {
  const data = failStore.get<ActFailData>(failKey(ip, deviceId));
  return Math.max(0, MAX_FAIL_ATTEMPTS - (data?.count ?? 0));
}
