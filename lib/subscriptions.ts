/**
 * stress-away Subscriptions — 管理端发放制
 *
 * 订阅主键: uid (自建用户 ID，users.id)
 * 额度模型：部署者在后台给账号配置报告次数（grantUsageByUid），
 * 次数永久有效；有额度判定 = remaining_usage > 0。
 */

import { query, execute, withTransaction, txQuery, txExecute, isMySQLAvailable } from './db';
import { TtlMap } from './ttl-map';

// ==================== Types ====================

export interface Subscription {
  uid: string;
  deviceId?: string;
  totalUsage: number;
  remainingUsage: number;
}

interface SubscriptionRow {
  uid: string;
  device_id: string | null;
  total_usage: number;
  remaining_usage: number;
}

// ==================== Helpers ====================

const SUB_CACHE_TTL_MS = 60 * 1000;
const SUB_CACHE_KEY = (uid: string) => `sub:${uid}`;
const subCache = new TtlMap();

async function cacheSet(key: string, value: unknown): Promise<void> {
  subCache.set(key, value, SUB_CACHE_TTL_MS);
}

async function cacheGet<T>(key: string): Promise<T | null> {
  return subCache.get<T>(key) ?? null;
}

async function cacheDel(key: string): Promise<void> {
  subCache.del(key);
}

const SUB_COLUMNS = 'uid, device_id, total_usage, remaining_usage';

function rowToSubscription(row: SubscriptionRow): Subscription {
  return {
    uid: row.uid,
    deviceId: row.device_id ?? undefined,
    totalUsage: Number(row.total_usage),
    remainingUsage: Number(row.remaining_usage),
  };
}

// ==================== Subscriptions (uid-based) ====================

export async function getSubscriptionByUid(uid: string): Promise<Subscription | null> {
  const cached = await cacheGet<Subscription>(SUB_CACHE_KEY(uid));
  if (cached) return cached;

  if (!isMySQLAvailable()) return null;
  try {
    const rows = await query<SubscriptionRow>(
      `SELECT ${SUB_COLUMNS} FROM subscriptions WHERE uid = ?`,
      [uid]
    );
    if (rows.length === 0) return null;
    const sub = rowToSubscription(rows[0]);
    await cacheSet(SUB_CACHE_KEY(uid), sub);
    return sub;
  } catch (err) {
    console.error('[getSubscriptionByUid] failed:', err);
    return null;
  }
}

export async function getRemainingUsageByUid(uid: string): Promise<number> {
  const sub = await getSubscriptionByUid(uid);
  return sub?.remainingUsage ?? 0;
}

export async function isPaidUserByUid(uid: string): Promise<boolean> {
  const sub = await getSubscriptionByUid(uid);
  return (sub?.remainingUsage ?? 0) > 0;
}

// ==================== 发放 / 消耗 ====================

/**
 * 管理员发放 N 次报告额度（累加，永久有效）。
 * 返回发放后的剩余次数。参数非法 / 无 MySQL / DB 异常一律 throw，
 * 由调用方（管理端路由）转显式错误——发放是资金相关操作，绝不静默。
 */
export async function grantUsageByUid(uid: string, addTimes: number): Promise<number> {
  if (!Number.isInteger(addTimes) || addTimes <= 0) {
    throw new Error(`grantUsageByUid: addTimes 必须为正整数，收到 ${addTimes}`);
  }
  if (!isMySQLAvailable()) {
    throw new Error('grantUsageByUid: MySQL 不可用，无法发放额度');
  }
  await execute(
    `INSERT INTO subscriptions (uid, total_usage, remaining_usage)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       total_usage = total_usage + VALUES(total_usage),
       remaining_usage = remaining_usage + VALUES(remaining_usage)`,
    [uid, addTimes, addTimes]
  );
  await cacheDel(SUB_CACHE_KEY(uid));
  const rows = await query<{ remaining_usage: number }>(
    'SELECT remaining_usage FROM subscriptions WHERE uid = ?',
    [uid]
  );
  if (rows.length === 0) {
    throw new Error(`grantUsageByUid: 发放后未能回读 uid=${uid} 的订阅行`);
  }
  return Number(rows[0].remaining_usage);
}

export async function consumeUsageByUid(uid: string): Promise<number> {
  if (!isMySQLAvailable()) return 0;
  // 契约：业务校验失败（无记录 / 额度用完）返回 0，只有真正的
  // DB/连接/事务异常才 throw——调用方据此区分 no_quota 与 settle_failed。
  try {
    return await withTransaction(async (conn) => {
      const rows = await txQuery<SubscriptionRow>(
        conn,
        `SELECT ${SUB_COLUMNS} FROM subscriptions WHERE uid = ? FOR UPDATE`,
        [uid]
      );
      if (rows.length === 0 || rows[0].remaining_usage <= 0) {
        return 0;
      }

      const newCount = rows[0].remaining_usage - 1;
      await txExecute(
        conn,
        'UPDATE subscriptions SET remaining_usage = ? WHERE uid = ?',
        [newCount, uid]
      );

      // 事务内 sub 是 stale 快照，写缓存会带入错误值；失效让下次读取重读 MySQL。
      await cacheDel(SUB_CACHE_KEY(uid));
      return newCount;
    });
  } catch (err) {
    console.error('[consumeUsageByUid] failed:', err);
    throw err;
  }
}
