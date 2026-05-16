import {
  isPaidUser,
  getFreeCount,
  incrementFreeCount,
  getRemainingUsage,
  consumeUsage,
  FREE_LIMIT_PER_DAY,
  PAID_LIMIT,
} from './redis';

export interface UsageStatus {
  allowed: boolean;
  remaining: number;
  isPaid: boolean;
  total: number;
}

export async function checkUsage(deviceId: string): Promise<UsageStatus> {
  const paid = await isPaidUser(deviceId);

  if (paid) {
    const remaining = await getRemainingUsage(deviceId);
    return {
      allowed: remaining > 0,
      remaining,
      isPaid: true,
      total: PAID_LIMIT,
    };
  }

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
  const paid = await isPaidUser(deviceId);

  if (paid) {
    const remaining = await consumeUsage(deviceId);
    return { remaining, isPaid: true };
  }

  await incrementFreeCount(deviceId);
  const current = await getFreeCount(deviceId);
  const remaining = Math.max(0, FREE_LIMIT_PER_DAY - current);
  return { remaining, isPaid: false };
}