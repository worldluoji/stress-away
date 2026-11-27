import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("MYSQL_HOST", "");
  vi.stubEnv("MYSQL_USER", "");
  vi.stubEnv("MYSQL_PASSWORD", "");
  vi.stubEnv("MYSQL_DATABASE", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getReportFunnel — 无 MySQL 降级", () => {
  const emptyStep = { count: 0, users: 0 };

  it("无 MySQL 配置时各漏斗步骤返回全 0（8 步）", async () => {
    const { getReportFunnel } = await import("../lib/usage-events");
    const funnel = await getReportFunnel();
    expect(funnel).toEqual({
      calculator: emptyStep,
      loginGate: emptyStep,
      paywallView: emptyStep,
      paywallBlock: emptyStep,
      paywallConfirm: emptyStep,
      paywallCancel: emptyStep,
      reportGenerate: emptyStep,
      reportDownload: emptyStep,
    });
  });
});

describe("recordEvent — 错误显式处理（宪法 3.1）", () => {
  it("落库失败时 console.error 且不向调用方抛出", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db", () => ({
      query: vi.fn(),
      execute: vi.fn(() => Promise.reject(new Error("insert failed"))),
      isMySQLAvailable: vi.fn(() => true),
    }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { recordEvent } = await import("../lib/usage-events");
      await expect(
        recordEvent({ deviceId: "d1", eventType: "login_gate" })
      ).resolves.toBeUndefined();
      expect(errSpy).toHaveBeenCalledWith(
        expect.stringContaining("recordEvent"),
        expect.any(Error)
      );
    } finally {
      errSpy.mockRestore();
      vi.doUnmock("@/lib/db");
    }
  });
});
