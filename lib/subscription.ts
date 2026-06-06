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
  refundUsageByUid,
  FREE_LIMIT_PER_DAY,
} from './subscriptions';
import {
  getFreeCount,
  incrementFreeCount,
  decrementFreeCount,
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

  // Logged-in but not paid: daily free count
  if (uid) {
    const current = await getFreeCount(deviceId || uid); // use uid as fallback key
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

  // Anonymous: no free usage without login
  return { allowed: false, remaining: 0, isPaid: false, total: 0 };
}

/**
 * Consume one usage quota
 * @param uid TCB user ID (null = anonymous)
 * @param deviceId Device fingerprint (for anonymous free count)
 */
export { refundUsageByUid } from './subscriptions';

export async function consumeOne(
  uid: string | null,
  deviceId: string | null
): Promise<{ remaining: number; isPaid: boolean }> {
  console.log('[consumeOne] called', { uid, deviceId });
  // Paid user first
  if (uid) {
    const paid = await isPaidUserByUid(uid);
    console.log('[consumeOne] isPaidUserByUid=', paid);
    if (paid) {
      console.log('[consumeOne] taking paid path, calling consumeUsageByUid');
      const remaining = await consumeUsageByUid(uid);
      console.log('[consumeOne] after consumeUsageByUid, remaining=', remaining);
      return { remaining, isPaid: true };
    }
  }

  // Logged-in but not paid: consume from daily free count
  if (uid) {
    console.log('[consumeOne] uid but not paid, using free count');
    await incrementFreeCount(deviceId || uid);
    const current = await getFreeCount(deviceId || uid);
    const remaining = Math.max(0, FREE_LIMIT_PER_DAY - current);
    return { remaining, isPaid: false };
  }

  // Anonymous: not allowed
  console.log('[consumeOne] anonymous, denied');
  return { remaining: 0, isPaid: false };
}