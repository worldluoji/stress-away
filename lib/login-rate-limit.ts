// 登录失败限流（进程内存 Map）：进程重启即失效、多实例部署各自独立。
// 无 Redis，这是已接受的权衡——目标只是抬高撞库/枚举成本，
// 真正兜底是 scrypt 慢哈希 + 管理员发放制账号。

export const MAX_ATTEMPTS = 5;
export const WINDOW_MINUTES = 15;
export const LOCK_MINUTES = 15;
// 防用户名随机化撑爆内存：超量时惰性清扫过期条目
const MAX_TRACKED_KEYS = 1000;

type AttemptEntry = {
  count: number;
  windowStart: number;
  lockedUntil: number;
};

const attempts = new Map<string, AttemptEntry>();

function normalize(username: string): string {
  return username.toLowerCase();
}

function sweepExpired(now: number): void {
  if (attempts.size <= MAX_TRACKED_KEYS) return;
  for (const [key, entry] of attempts) {
    const locked = entry.lockedUntil > now;
    const stale = now - entry.windowStart > WINDOW_MINUTES * 60_000;
    if (!locked && stale) attempts.delete(key);
  }
}

/** 该账号是否处于锁定期（锁定期满自动视为可重试） */
export function isLoginLocked(username: string): boolean {
  const entry = attempts.get(normalize(username));
  return entry !== undefined && entry.lockedUntil > Date.now();
}

export function recordLoginFailure(username: string): void {
  const now = Date.now();
  sweepExpired(now);
  const key = normalize(username);
  let entry = attempts.get(key);
  if (
    !entry ||
    // 锁定期满或计数窗口滑出：视为新窗口重新计
    (entry.lockedUntil > 0 && now >= entry.lockedUntil) ||
    now - entry.windowStart > WINDOW_MINUTES * 60_000
  ) {
    entry = { count: 0, windowStart: now, lockedUntil: 0 };
  }
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCK_MINUTES * 60_000;
  }
  attempts.set(key, entry);
}

/** 登录成功清零，避免历史失败误伤正常使用 */
export function clearLoginFailures(username: string): void {
  attempts.delete(normalize(username));
}

export function resetLoginRateLimitForTesting(): void {
  attempts.clear();
}
