/**
 * 对话额度决策（纯函数，零 IO）
 *
 * 模型：对话是免费获客漏斗，登录用户每日 CHAT_FREE_PER_DAY 次免费；
 * 超出后付费用户可确认消耗 1 次购买次数（报告货币）继续对话。
 */

export const CHAT_FREE_PER_DAY = parseInt(process.env.CHAT_FREE_PER_DAY || '10', 10);

export type ChatAction =
  | 'allow_free'
  | 'allow_paid'
  | 'need_confirm'
  | 'blocked_not_logged_in'
  | 'blocked_not_paid'
  | 'blocked_paid_exhausted';

export interface ChatActionInput {
  loggedIn: boolean;
  freeUsed: number;
  chatFreeLimit: number;
  isPaid: boolean;
  paidRemaining: number;
  confirmPaid: boolean;
}

export function decideChatAction(input: ChatActionInput): ChatAction {
  if (!input.loggedIn) return 'blocked_not_logged_in';

  if (input.freeUsed < input.chatFreeLimit) return 'allow_free';

  if (!input.isPaid) return 'blocked_not_paid';
  if (input.paidRemaining <= 0) return 'blocked_paid_exhausted';

  return input.confirmPaid ? 'allow_paid' : 'need_confirm';
}
