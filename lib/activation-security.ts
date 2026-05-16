const USE_LOCAL_STORAGE = process.env.USE_LOCAL_STORAGE === 'true';

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

interface FailedAttempts {
  count: number;
  firstAttempt: number;
  blockedUntil?: number;
}

const FAIL_KEY_PREFIX = 'act:fail:';
const MAX_FAIL_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function getFailKey(ip: string, deviceId: string): string {
  return `${FAIL_KEY_PREFIX}${ip}:${deviceId}`;
}

export function checkActivationBlocked(ip: string, deviceId: string): { blocked: boolean; remainingSeconds: number } {
  if (USE_LOCAL_STORAGE) {
    return checkActivationBlockedLocal(ip, deviceId);
  }
  // For Redis, we check at runtime - simplified for now
  return { blocked: false, remainingSeconds: 0 };
}

function checkActivationBlockedLocal(ip: string, deviceId: string): { blocked: boolean; remainingSeconds: number } {
  const key = getFailKey(ip, deviceId);
  const data = lsGet<FailedAttempts>(key);

  if (!data) {
    return { blocked: false, remainingSeconds: 0 };
  }

  if (data.blockedUntil) {
    const now = Date.now();
    if (now < data.blockedUntil) {
      const remainingSeconds = Math.ceil((data.blockedUntil - now) / 1000);
      return { blocked: true, remainingSeconds };
    }
    // Block expired, reset
    lsSet(key, { count: 0, firstAttempt: now });
    return { blocked: false, remainingSeconds: 0 };
  }

  return { blocked: false, remainingSeconds: 0 };
}

export function recordFailedAttempt(ip: string, deviceId: string): void {
  if (USE_LOCAL_STORAGE) {
    recordFailedAttemptLocal(ip, deviceId);
    return;
  }
  // Redis version would use INCR and EXPIRE
}

function recordFailedAttemptLocal(ip: string, deviceId: string): void {
  const key = getFailKey(ip, deviceId);
  const data = lsGet<FailedAttempts>(key);
  const now = Date.now();

  if (!data) {
    lsSet(key, { count: 1, firstAttempt: now });
    return;
  }

  // If previous block has expired, reset
  if (data.blockedUntil && now >= data.blockedUntil) {
    lsSet(key, { count: 1, firstAttempt: now });
    return;
  }

  data.count++;

  if (data.count >= MAX_FAIL_ATTEMPTS) {
    data.blockedUntil = now + BLOCK_DURATION_MS;
  }

  lsSet(key, data);
}

export function resetFailedAttempts(ip: string, deviceId: string): void {
  if (USE_LOCAL_STORAGE) {
    const key = getFailKey(ip, deviceId);
    lsSet(key, { count: 0, firstAttempt: Date.now() });
    return;
  }
}

export function getRemainingAttempts(ip: string, deviceId: string): number {
  if (USE_LOCAL_STORAGE) {
    const key = getFailKey(ip, deviceId);
    const data = lsGet<FailedAttempts>(key);
    if (!data) return MAX_FAIL_ATTEMPTS;
    return Math.max(0, MAX_FAIL_ATTEMPTS - data.count);
  }
  return MAX_FAIL_ATTEMPTS;
}