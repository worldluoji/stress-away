import { kvGet, kvIncr } from './kv';

// 对话免费次数按 uid + 本地日期计数（本地日期匹配用户时区）
function getLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayKey(uid: string): string {
  return `uid:${uid}:chatfree:${getLocalDateString()}`;
}

// TTL 到下一个本地午夜（至少 60s）
function msUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.max(midnight.getTime() - now.getTime(), 60_000);
}

export async function getFreeCount(uid: string): Promise<number> {
  const count = await kvGet<number>(getTodayKey(uid));
  return typeof count === 'number' ? count : 0;
}

export async function incrementFreeCount(uid: string): Promise<number> {
  return kvIncr(getTodayKey(uid), msUntilMidnight());
}
