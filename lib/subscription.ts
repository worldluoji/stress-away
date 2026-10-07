/**
 * Usage quota — 自建账号版
 *
 * 模型：购买次数（subscriptions.remaining_usage）是"报告货币"；
 * 对话为免费获客漏斗，登录用户每日 CHAT_FREE_PER_DAY 次免费，
 * 超出后付费用户确认消耗 1 次购买次数继续对话。
 */

import {
  isPaidUserByUid,
  getRemainingUsageByUid,
  consumeUsageByUid,
  TOTAL_USAGE,
} from './subscriptions';
import { getFreeCount, incrementFreeCount } from './free-count';
import { CHAT_FREE_PER_DAY, decideChatAction, type ChatAction } from './chat-quota';

export interface UsageStatus {
  allowed: boolean;
  remaining: number;
  isPaid: boolean;
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
  const isPaid = await isPaidUserByUid(uid);
  const remaining = isPaid ? await getRemainingUsageByUid(uid) : 0;

  return {
    allowed: chatFreeRemaining > 0 || remaining > 0,
    remaining,
    isPaid,
    total: isPaid ? TOTAL_USAGE : 0,
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
    isPaid = await isPaidUserByUid(uid);
    if (isPaid) paidRemaining = await getRemainingUsageByUid(uid);
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

/** AI 成功后结算：免费计数 +1 或扣 1 次购买次数 */
export async function settleChat(uid: string, action: ChatAction): Promise<void> {
  if (action === 'allow_paid') {
    await consumeUsageByUid(uid);
    return;
  }
  await incrementFreeCount(uid);
}
