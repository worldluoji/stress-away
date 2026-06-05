import {
  checkActivationBlockedRedis,
  recordActivationFailedAttemptRedis,
  resetActivationFailedAttemptsRedis,
} from './redis';

const MAX_FAIL_ATTEMPTS = 5;

// Sync version (no-op, rate limiting is async-only via checkActivationBlockedAsync)
export function checkActivationBlocked(ip: string, deviceId: string): { blocked: boolean; remainingSeconds: number } {
  return { blocked: false, remainingSeconds: 0 };
}

// Async version - delegates to Redis implementation
export async function checkActivationBlockedAsync(
  ip: string,
  deviceId: string
): Promise<{ blocked: boolean; remainingSeconds: number }> {
  return checkActivationBlockedRedis(ip, deviceId);
}

// Sync stub (no-op)
export function recordFailedAttempt(ip: string, deviceId: string): void {}

// Async version
export async function recordFailedAttemptAsync(ip: string, deviceId: string): Promise<void> {
  await recordActivationFailedAttemptRedis(ip, deviceId);
}

// Sync stub (no-op)
export function resetFailedAttempts(ip: string, deviceId: string): void {}

// Async version
export async function resetFailedAttemptsAsync(ip: string, deviceId: string): Promise<void> {
  await resetActivationFailedAttemptsRedis(ip, deviceId);
}

// Returns max attempts (actual counting is in Redis)
export function getRemainingAttempts(ip: string, deviceId: string): number {
  return MAX_FAIL_ATTEMPTS;
}