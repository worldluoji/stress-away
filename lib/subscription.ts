import {
  isPaidUser as checkIsPaidUserMySQL,
  getRemainingUsage as getPaidUsageMySQL,
  consumeUsage as consumePaidUsageMySQL,
  FREE_LIMIT_PER_DAY,
  PAID_LIMIT,
} from './subscriptions';
import {
  isPaidUser as checkIsPaidUserRedis,
  getFreeCount,
  incrementFreeCount,
  consumeUsage as consumeUsageRedis,
  getRemainingUsage as getRemainingUsageRedis,
} from './redis';
import { isMySQLAvailable } from './db';

export interface UsageStatus {
  allowed: boolean;
  remaining: number;
  isPaid: boolean;
  total: number;
}

export async function checkUsage(deviceId: string): Promise<UsageStatus> {
  // Paid check uses MySQL
  const paid = await checkIsPaidUserMySQL(deviceId);

  if (paid) {
    const remaining = await getPaidUsageMySQL(deviceId);
    return {
      allowed: remaining > 0,
      remaining,
      isPaid: true,
      total: PAID_LIMIT,
    };
  }

  // Free count still uses Redis (daily counter, works well)
  const current = await getFreeCount(deviceId);
  if (current >= FREE_LIMIT_PER_DAY) {
    return {
      allowed: false,
      remaining: 0,
      isPaid: false,
      total: FREE_LIMIT_PER_DAY,
    };
  }

  const remaining = Math.max(0, FREE_LIMIT_PER_DAY - current);
  return {
    allowed: true,
    remaining,
    isPaid: false,
    total: FREE_LIMIT_PER_DAY,
  };
}

export async function consumeOne(deviceId: string): Promise<{ remaining: number; isPaid: boolean }> {
  const paid = await checkIsPaidUserMySQL(deviceId);

  if (paid) {
    const remaining = await consumePaidUsageMySQL(deviceId);
    return { remaining, isPaid: true };
  }

  await incrementFreeCount(deviceId);
  const current = await getFreeCount(deviceId);
  const remaining = Math.max(0, FREE_LIMIT_PER_DAY - current);
  return { remaining, isPaid: false };
}