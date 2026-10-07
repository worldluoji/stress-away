import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/api-auth", () => ({ getAuthContext: vi.fn() }));
vi.mock("@/lib/subscriptions", () => ({
  isPaidUserByUid: vi.fn(),
  getRemainingUsageByUid: vi.fn(),
  consumeUsageByUid: vi.fn(),
}));
vi.mock("@/lib/models", () => ({ generateReport: vi.fn() }));
vi.mock("@/lib/labor-reports", () => ({ saveLaborReport: vi.fn() }));
vi.mock("@/lib/usage-events", () => ({ recordEvent: vi.fn() }));

import { POST } from "@/app/api/report/route";
import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/api-auth";
import {
  isPaidUserByUid,
  getRemainingUsageByUid,
  consumeUsageByUid,
} from "@/lib/subscriptions";
import { generateReport } from "@/lib/models";
import { saveLaborReport } from "@/lib/labor-reports";
import { recordEvent } from "@/lib/usage-events";

const VALID_COMP = {
  monthlyAvgWage: 15000,
  hiredAt: "2020-01-01",
  firedAt: "2023-01-01",
  city: "北京",
  dismissalType: "illegal",
};

function makeBody(overrides: Record<string, unknown> = {}) {
  return {
    comp: VALID_COMP,
    intakeAnswers: { 目前的情况: "公司通知裁员" },
    narrative: "公司以架构调整为由口头通知离职",
    confirmPaid: true,
    ...overrides,
  };
}

let ipSeq = 0;
function makeReq(body: unknown, opts: { uid?: string | null } = {}) {
  // 每个请求唯一 ip + deviceId，避免进程级限流/防伪状态跨用例污染
  ipSeq += 1;
  const ip = `10.0.0.${ipSeq}`;
  const deviceId = `dev-${ipSeq}`;
  const headers = new Headers({
    "Content-Type": "application/json",
    "x-forwarded-for": ip,
    "x-device-id": deviceId,
  });
  // opts.uid 省略 → 默认登录用户 u1；显式传 null → 未登录
  const uid = opts.uid === undefined ? "u1" : opts.uid;
  if (uid !== null) headers.set("x-user-id", uid);
  return {
    req: new NextRequest("http://localhost/api/report", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    ip,
    deviceId,
  };
}

function callPOST(body: unknown, opts: { uid?: string | null } = {}) {
  const { req } = makeReq(body, opts);
  return POST(req);
}

beforeEach(() => {
  vi.resetModules();
  // getAuthContext 从请求头读取，便于各用例通过 header 控制登录态
  (getAuthContext as ReturnType<typeof vi.fn>).mockImplementation((r: Request) => {
    const uid = r.headers.get("x-user-id");
    return { uid: uid || null, deviceId: r.headers.get("x-device-id"), isLoggedIn: !!uid };
  });
  (isPaidUserByUid as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  (getRemainingUsageByUid as ReturnType<typeof vi.fn>).mockResolvedValue(5);
  (consumeUsageByUid as ReturnType<typeof vi.fn>).mockResolvedValue(1);
  (generateReport as ReturnType<typeof vi.fn>).mockResolvedValue("报告正文");
  (saveLaborReport as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

describe("POST /api/report — 两段确认与门禁", () => {
  it("confirmPaid=false → 402 report_quota_confirm + paidRemaining", async () => {
    const res = await callPOST(makeBody({ confirmPaid: false }));
    expect(res.status).toBe(402);
    const data = await res.json();
    expect(data.error).toBe("report_quota_confirm");
    expect(data.paidRemaining).toBe(5);
    expect(consumeUsageByUid).not.toHaveBeenCalled();
  });

  it("未登录 → 403 login_required", async () => {
    const res = await callPOST(makeBody(), { uid: null });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("login_required");
  });

  it("非付费用户 → 403 paid_only", async () => {
    (isPaidUserByUid as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const res = await callPOST(makeBody());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("paid_only");
  });

  it("额度为 0 → 403 no_quota", async () => {
    (getRemainingUsageByUid as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    const res = await callPOST(makeBody());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("no_quota");
  });

  it("一段与二段之间额度归零（race）→ 403 no_quota", async () => {
    (getRemainingUsageByUid as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(0);
    const res = await callPOST(makeBody());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("no_quota");
  });
});

describe("POST /api/report — 输入校验（表格驱动）", () => {
  const cases: { desc: string; body: Record<string, unknown> }[] = [
    { desc: "narrative 缺失", body: { narrative: "" } },
    { desc: "narrative 超 600 字", body: { narrative: "x".repeat(601) } },
    { desc: "comp 缺失", body: { comp: undefined } },
    { desc: "月薪非法", body: { comp: { ...VALID_COMP, monthlyAvgWage: 0 } } },
    { desc: "离职早于入职", body: { comp: { ...VALID_COMP, firedAt: "2019-01-01" } } },
    { desc: "解除类型非法", body: { comp: { ...VALID_COMP, dismissalType: "quit" } } },
    { desc: "日期格式非法", body: { comp: { ...VALID_COMP, hiredAt: "2020/01/01" } } },
    { desc: "加班时长超范围", body: { comp: { ...VALID_COMP, overtimeHours: { weekday: 100000, weekend: 0, holiday: 0 } } } },
    { desc: "基本情况回答过长", body: { intakeAnswers: { 目前的情况: "y".repeat(201) } } },
  ];
  cases.forEach((c) => {
    it(`${c.desc} → 400`, async () => {
      const res = await callPOST(makeBody(c.body));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("invalid_input");
    });
  });
});

describe("POST /api/report — AI 失败不扣量", () => {
  it("generateReport reject → 500，consume 未调用", async () => {
    (generateReport as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    const res = await callPOST(makeBody());
    expect(res.status).toBe(500);
    expect(consumeUsageByUid).not.toHaveBeenCalled();
  });

  it("AbortError → 500 超时文案", async () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    (generateReport as ReturnType<typeof vi.fn>).mockRejectedValue(err);
    const res = await callPOST(makeBody());
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe("AI 生成超时，请稍后再试");
  });
});

describe("POST /api/report — 成功 / settle_failed / saveWarning / self-heal", () => {
  it("成功 → 200，reply 含免责声明，consume 调用一次", async () => {
    (generateReport as ReturnType<typeof vi.fn>).mockResolvedValue("策略正文");
    // 成功路径 getRemaining 被调用 3 次：paidRemaining/finalRemaining/afterRemaining
    let calls = 0;
    (getRemainingUsageByUid as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      calls += 1;
      return calls <= 2 ? 5 : 4; // after=4，与 paidRemaining-1 相等 → 不触发自愈告警
    });
    const res = await callPOST(makeBody());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.reply).toContain("策略正文");
    expect(data.reply).toContain("本报告由 AI 生成");
    expect(data.warning).toBeFalsy();
    expect(consumeUsageByUid).toHaveBeenCalledTimes(1);
    expect(saveLaborReport).toHaveBeenCalledTimes(1);
  });

  it("settle_failed（consume 抛错）→ 500 且带 reply，与成功分支同输入剥离一致（固化 A1）", async () => {
    const raw = "结论在前  正文在后";
    (generateReport as ReturnType<typeof vi.fn>).mockResolvedValue(raw);

    // 基准：成功分支产出
    let c1 = 0;
    (getRemainingUsageByUid as ReturnType<typeof vi.fn>).mockImplementation(async () => (++c1 <= 2 ? 5 : 4));
    const okData = await (await callPOST(makeBody())).json();

    // settle_failed 分支：consume 抛错
    (consumeUsageByUid as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("db down"));
    let c2 = 0;
    (getRemainingUsageByUid as ReturnType<typeof vi.fn>).mockImplementation(async () => (++c2 <= 2 ? 5 : 4));
    const failRes = await callPOST(makeBody());
    expect(failRes.status).toBe(500);
    const failData = await failRes.json();
    expect(failData.error).toBe("settle_failed");
    expect(failData.reply).toBeDefined();
    // 两条路径对同一 rawReply 的 think 剥离结果必须一致
    expect(failData.reply).toBe(okData.reply);
    // 孤立闭合标签不应吞掉前面的正文
    expect(failData.reply).toContain("结论在前");
  });

  it("saveWarning（落库失败）→ 200 + warning（固化 A4）", async () => {
    (saveLaborReport as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("insert fail"));
    let calls = 0;
    (getRemainingUsageByUid as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      calls += 1;
      return calls <= 2 ? 5 : 4;
    });
    const res = await callPOST(makeBody());
    expect(res.status).toBe(200);
    expect((await res.json()).warning).toContain("无法找回");
  });

  it("self-heal（consume 后额度未减）→ 200 + 未扣除告警", async () => {
    (getRemainingUsageByUid as ReturnType<typeof vi.fn>).mockResolvedValue(5); // after=5=paidRemaining → 5>4 触发
    const res = await callPOST(makeBody());
    expect(res.status).toBe(200);
    expect((await res.json()).warning).toContain("未正确扣除");
  });
});

describe("POST /api/report — 限流", () => {
  function makeSender(ip: string, deviceId: string) {
    return (confirmPaid: boolean) =>
      POST(
        new NextRequest("http://localhost/api/report", {
          method: "POST",
          headers: new Headers({
            "Content-Type": "application/json",
            "x-forwarded-for": ip,
            "x-device-id": deviceId,
            "x-user-id": "u1",
          }),
          body: JSON.stringify(makeBody({ confirmPaid })),
        })
      );
  }

  it("同一 deviceId:ip 连打 6 次 confirmPaid=true → 第 6 次 429", async () => {
    // 复用同一 ip/deviceId 绕过唯一化，专测限流
    const send = makeSender("192.168.99.99", "ratelimit-dev");
    let last: Response | undefined;
    for (let i = 0; i < 6; i++) last = await send(true);
    expect((await last!.json()).error).toBe("rate_limit_exceeded");
  });

  it("同一 deviceId:ip 连打 6 次 confirmPaid=false 探测 → 均 402 不 429（探测不计限流）", async () => {
    const send = makeSender("192.168.99.98", "probe-dev");
    for (let i = 0; i < 6; i++) {
      const res = await send(false);
      expect(res.status).toBe(402);
    }
  });
});

describe("POST /api/report — 埋点事件", () => {
  it("成功生成 → recordEvent report_generate（不再走 incrementChatCount）", async () => {
    let calls = 0;
    (getRemainingUsageByUid as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      calls += 1;
      return calls <= 2 ? 5 : 4;
    });
    const res = await callPOST(makeBody());
    expect(res.status).toBe(200);
    expect(recordEvent).toHaveBeenCalledTimes(1);
    const arg = (recordEvent as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.eventType).toBe("report_generate");
    expect(arg.uid).toBe("u1");
  });

  it("402 探测 → 不记录 report_generate", async () => {
    await callPOST(makeBody({ confirmPaid: false }));
    expect(recordEvent).not.toHaveBeenCalled();
  });
});

describe("POST /api/report — paywall_block 埋点", () => {
  const table: { desc: string; setup: () => void; reason: string }[] = [
    {
      desc: "登录但未开通 → paid_only",
      setup: () => (isPaidUserByUid as ReturnType<typeof vi.fn>).mockResolvedValue(false),
      reason: "paid_only",
    },
    {
      desc: "已开通剩 0 次 → no_quota",
      setup: () => (getRemainingUsageByUid as ReturnType<typeof vi.fn>).mockResolvedValue(0),
      reason: "no_quota",
    },
  ];

  it.each(table)("$desc → recordEvent(paywall_block)", async ({ setup, reason }) => {
    setup();
    const res = await callPOST(makeBody());
    expect(res.status).toBe(403);
    expect(recordEvent).toHaveBeenCalledTimes(1);
    const arg = (recordEvent as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg).toMatchObject({ eventType: "paywall_block", uid: "u1", meta: { reason } });
  });

  it("402 探测（有额度）→ 不记录 paywall_block", async () => {
    await callPOST(makeBody({ confirmPaid: false }));
    expect(recordEvent).not.toHaveBeenCalled();
  });
});
