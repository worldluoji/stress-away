import { describe, it, expect } from "vitest";
import { decideChatAction, CHAT_FREE_PER_DAY, type ChatActionInput } from "../lib/chat-quota";

describe("decideChatAction — 对话额度决策", () => {
  const cases: { desc: string; input: ChatActionInput; want: string }[] = [
    {
      desc: "未登录一律拒绝",
      input: { loggedIn: false, freeUsed: 0, chatFreeLimit: CHAT_FREE_PER_DAY, isPaid: false, paidRemaining: 0, confirmPaid: false },
      want: "blocked_not_logged_in",
    },
    {
      desc: "免费额度内直接放行",
      input: { loggedIn: true, freeUsed: 3, chatFreeLimit: CHAT_FREE_PER_DAY, isPaid: false, paidRemaining: 0, confirmPaid: false },
      want: "allow_free",
    },
    {
      desc: "免费额度边界(剩1次)仍放行",
      input: { loggedIn: true, freeUsed: 9, chatFreeLimit: CHAT_FREE_PER_DAY, isPaid: false, paidRemaining: 0, confirmPaid: false },
      want: "allow_free",
    },
    {
      desc: "免费用户超每日上限被阻",
      input: { loggedIn: true, freeUsed: 10, chatFreeLimit: CHAT_FREE_PER_DAY, isPaid: false, paidRemaining: 0, confirmPaid: false },
      want: "blocked_not_paid",
    },
    {
      desc: "有额度用户在免费额度内仍走免费",
      input: { loggedIn: true, freeUsed: 0, chatFreeLimit: CHAT_FREE_PER_DAY, isPaid: true, paidRemaining: 5, confirmPaid: false },
      want: "allow_free",
    },
    {
      desc: "有额度用户超限未确认需弹窗",
      input: { loggedIn: true, freeUsed: 10, chatFreeLimit: CHAT_FREE_PER_DAY, isPaid: true, paidRemaining: 5, confirmPaid: false },
      want: "need_confirm",
    },
    {
      desc: "有额度用户超限已确认扣次数",
      input: { loggedIn: true, freeUsed: 10, chatFreeLimit: CHAT_FREE_PER_DAY, isPaid: true, paidRemaining: 5, confirmPaid: true },
      want: "allow_paid",
    },
    {
      desc: "有额度但报告额度为0(已确认)仍拒绝",
      input: { loggedIn: true, freeUsed: 10, chatFreeLimit: CHAT_FREE_PER_DAY, isPaid: true, paidRemaining: 0, confirmPaid: true },
      want: "blocked_paid_exhausted",
    },
    {
      desc: "有额度但报告额度为0(未确认)不得误弹确认",
      input: { loggedIn: true, freeUsed: 10, chatFreeLimit: CHAT_FREE_PER_DAY, isPaid: true, paidRemaining: 0, confirmPaid: false },
      want: "blocked_paid_exhausted",
    },
    {
      desc: "有免费额度时 confirmPaid 不得跳免费直扣次数",
      input: { loggedIn: true, freeUsed: 2, chatFreeLimit: CHAT_FREE_PER_DAY, isPaid: true, paidRemaining: 5, confirmPaid: true },
      want: "allow_free",
    },
  ];

  cases.forEach((c) => {
    it(c.desc, () => {
      expect(decideChatAction(c.input)).toBe(c.want);
    });
  });
});
