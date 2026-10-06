import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { chatWithAI, generateReport } from "../lib/models";

const CHAT_TIMEOUT_MS = 60_000;
const REPORT_TIMEOUT_MS = 180_000;

// 挂起的 fetch：仅在 signal abort 时 reject，模拟 AI 端点无响应
function makeHangingFetch() {
  return vi.fn((_url: string, init?: { signal?: AbortSignal }) =>
    new Promise<Response>((_, reject) => {
      if (!init?.signal) return; // 未传 signal 则永不 resolve，由测试超时兜底
      init.signal.addEventListener("abort", () => reject(new Error("The operation was aborted")));
    })
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("DEFAULT_MODEL", "deepseek");
  vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("callModel 超时保护", () => {
  const cases: {
    desc: string;
    call: () => Promise<string>;
    timeoutMs: number;
  }[] = [
    { desc: "chatWithAI 在 60s 超时报错而非永久挂起", call: () => chatWithAI([{ role: "user", content: "hi" }]), timeoutMs: CHAT_TIMEOUT_MS },
    { desc: "generateReport 在 180s 超时报错而非永久挂起", call: () => generateReport({ severanceN: 60000, illegalExtra: 0, noticePay: 0, overtimePay: 0, annualLeavePay: 0, total: 60000, lines: ["经济补偿 N：60000 元"], warnings: [] }, {}, "被口头辞退"), timeoutMs: REPORT_TIMEOUT_MS },
  ];

  cases.forEach((c) => {
    it(c.desc, async () => {
      const fetchMock = makeHangingFetch();
      vi.stubGlobal("fetch", fetchMock);
      const promise = c.call();
      // 先挂上拒绝处理器，再推进计时器触发 abort，避免拒绝在无人处理的窗口内被判为 unhandled rejection
      const assertion = expect(promise).rejects.toThrow(/abort|timeout/i);
      await vi.advanceTimersByTimeAsync(c.timeoutMs + 1000);
      await assertion;
      expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    });
  });

  it("未超时则正常返回内容", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "报告正文" } }] }), { status: 200 })
    ));
    const promise = chatWithAI([{ role: "user", content: "hi" }]);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toBe("报告正文");
  });
});
