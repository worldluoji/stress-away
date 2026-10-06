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

  it("无 MySQL 配置时各漏斗步骤返回全 0", async () => {
    const { getReportFunnel } = await import("../lib/usage-events");
    const funnel = await getReportFunnel();
    expect(funnel).toEqual({
      calculator: emptyStep,
      paywallView: emptyStep,
      paywallConfirm: emptyStep,
      paywallCancel: emptyStep,
      reportGenerate: emptyStep,
      reportDownload: emptyStep,
    });
  });
});
