/**
 * Usage quota — 自建账号版（管理端发放制）
 *
 * 模型：报告次数（subscriptions.remaining_usage）是演示额度，由部署者发放、永久有效；
 * 对话为免费获客漏斗，登录用户每日 CHAT_FREE_PER_DAY 次免费，
 * 超出后用户确认消耗 1 次演示额度继续对话。
 */

import {
  getSubscriptionByUid,
  consumeUsageByUid,
} from './subscriptions';
import { getFreeCount, incrementFreeCount } from './free-count';
import { CHAT_FREE_PER_DAY, decideChatAction, type ChatAction } from './chat-quota';

export interface UsageStatus {
  allowed: boolean;
  remaining: number;
  isPaid: boolean;
  /** 累计发放次数 */
  total: number;
  chatFreeRemaining: number;
  chatFreeTotal: number;
}

/** 展示用额度状态（/api/usage） */
export async function checkUsage(uid: string | null): Promise<UsageStatus> {
  const chatFreeTotal = CHAT_FREE_PER_DAY;

  if (!uid) {
    return {
      allowed: false,
      remaining: 0,
      isPaid: false,
      total: 0,
      chatFreeRemaining: 0,
      chatFreeTotal,
    };
  }

  const freeUsed = await getFreeCount(uid);
  const chatFreeRemaining = Math.max(0, chatFreeTotal - freeUsed);
  // 单次读订阅（60s 缓存）即可推出全部额度状态
  const sub = await getSubscriptionByUid(uid);
  const remaining = sub?.remainingUsage ?? 0;

  return {
    allowed: chatFreeRemaining > 0 || remaining > 0,
    remaining,
    isPaid: remaining > 0,
    total: sub?.totalUsage ?? 0,
    chatFreeRemaining,
    chatFreeTotal,
  };
}

export interface ChatQuotaResult {
  action: ChatAction;
  freeUsed: number;
  paidRemaining: number;
}

/** 对话额度决策（API 路由在 parse body 拿到 confirmPaid 后调用） */
export async function checkChatQuota(uid: string | null, confirmPaid: boolean): Promise<ChatQuotaResult> {
  const freeUsed = uid ? await getFreeCount(uid) : 0;

  let isPaid = false;
  let paidRemaining = 0;
  if (uid && freeUsed >= CHAT_FREE_PER_DAY) {
    const sub = await getSubscriptionByUid(uid);
    paidRemaining = sub?.remainingUsage ?? 0;
    isPaid = paidRemaining > 0;
  }

  const action = decideChatAction({
    loggedIn: !!uid,
    freeUsed,
    chatFreeLimit: CHAT_FREE_PER_DAY,
    isPaid,
    paidRemaining,
    confirmPaid,
  });

  return { action, freeUsed, paidRemaining };
}

/** AI 成功后结算：免费计数 +1 或扣 1 次演示额度 */
export async function settleChat(uid: string, action: ChatAction): Promise<void> {
  if (action === 'allow_paid') {
    await consumeUsageByUid(uid);
    return;
  }
  await incrementFreeCount(uid);
}
