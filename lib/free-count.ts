import { kvGet, kvSet } from './kv';

// Free count (daily) - use local date to match user's timezone
function getLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayKey(deviceId: string): string {
  return `device:${deviceId}:free:${getLocalDateString()}`;
}

// TTL until next local midnight (at least 60s)
function msUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.max(midnight.getTime() - now.getTime(), 60_000);
}

interface FreeCountData {
  count: number;
  date: string;
}

export async function getFreeCount(deviceId: string): Promise<number> {
  const data = await kvGet<FreeCountData>(getTodayKey(deviceId));
  if (!data || typeof data !== 'object' || data.date !== getLocalDateString()) return 0;
  return data.count ?? 0;
}

export async function incrementFreeCount(deviceId: string): Promise<number> {
  const current = await getFreeCount(deviceId);
  const next = current + 1;
  await kvSet(getTodayKey(deviceId), { count: next, date: getLocalDateString() }, msUntilMidnight());
  return next;
}

export async function decrementFreeCount(deviceId: string): Promise<number> {
  const current = await getFreeCount(deviceId);
  const next = Math.max(0, current - 1);
  await kvSet(getTodayKey(deviceId), { count: next, date: getLocalDateString() }, msUntilMidnight());
  return next;
}
