/**
 * Usage quota check and consume - TCB user edition
 *
 * Priority:
 * 1. Logged-in user (uid) → check MySQL uid-based subscription
 * 2. Anonymous user → device-based free count (Redis)
 */

import {
  isPaidUserByUid,
  getRemainingUsageByUid,
  consumeUsageByUid,
  FREE_LIMIT_PER_DAY,
} from './subscriptions';
import {
  getFreeCount,
  incrementFreeCount,
} from './redis';

export interface UsageStatus {
  allowed: boolean;
  remaining: number;
  isPaid: boolean;
  total: number;
}

/**
 * Check usage quota for a user session
 * @param uid TCB user ID (null = anonymous)
 * @param deviceId Device fingerprint (for anonymous free count)
 */
export async function checkUsage(uid: string | null, deviceId: string | null): Promise<UsageStatus> {
  // Paid user (logged in with claimed subscription)
  if (uid) {
    const paid = await isPaidUserByUid(uid);
    if (paid) {
      const remaining = await getRemainingUsageByUid(uid);
      return {
        allowed: remaining > 0,
        remaining,
        isPaid: true,
        total: 100,
      };
    }
  }

  // Free/anonymous user (device-based daily limit)
  if (deviceId) {
    const current = await getFreeCount(deviceId);
    if (current >= FREE_LIMIT_PER_DAY) {
      return { allowed: false, remaining: 0, isPaid: false, total: FREE_LIMIT_PER_DAY };
    }
    return {
      allowed: true,
      remaining: Math.max(0, FREE_LIMIT_PER_DAY - current),
      isPaid: false,
      total: FREE_LIMIT_PER_DAY,
    };
  }

  return { allowed: false, remaining: 0, isPaid: false, total: FREE_LIMIT_PER_DAY };
}

/**
 * Consume one usage quota
 * @param uid TCB user ID (null = anonymous)
 * @param deviceId Device fingerprint (for anonymous free count)
 */
export async function consumeOne(
  uid: string | null,
  deviceId: string | null
): Promise<{ remaining: number; isPaid: boolean }> {
  // Paid user first
  if (uid) {
    const paid = await isPaidUserByUid(uid);
    if (paid) {
      const remaining = await consumeUsageByUid(uid);
      return { remaining, isPaid: true };
    }
  }

  // Anonymous free count
  if (deviceId) {
    await incrementFreeCount(deviceId);
    const current = await getFreeCount(deviceId);
    const remaining = Math.max(0, FREE_LIMIT_PER_DAY - current);
    return { remaining, isPaid: false };
  }

  return { remaining: 0, isPaid: false };
}