import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isMySQLAvailable } from "../lib/db";
import type { LaborReport } from "../lib/labor-reports";

beforeEach(() => {
  vi.stubEnv("MYSQL_HOST", "");
  vi.stubEnv("MYSQL_USER", "");
  vi.stubEnv("MYSQL_PASSWORD", "");
  vi.stubEnv("MYSQL_DATABASE", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("labor-reports — 无 MySQL 环境降级", () => {
  it("测试环境应无 MySQL 配置", () => {
    expect(isMySQLAvailable()).toBe(false);
  });

  const cases: {
    desc: string;
    op: () => Promise<unknown>;
    want: unknown;
  }[] = [
    {
      desc: "listLaborReportsByUid 返回空数组",
      op: async () => {
        const { listLaborReportsByUid } = await import("../lib/labor-reports");
        return listLaborReportsByUid("uid-1");
      },
      want: [],
    },
    {
      desc: "getLaborReport 返回 null",
      op: async () => {
        const { getLaborReport } = await import("../lib/labor-reports");
        return getLaborReport("r1", "uid-1");
      },
      want: null,
    },
  ];

  cases.forEach((c) => {
    it(c.desc, async () => {
      await expect(c.op()).resolves.toEqual(c.want);
    });
  });

  it("saveLaborReport 无 MySQL 时返回 skipped 显式告知", async () => {
    const { saveLaborReport } = await import("../lib/labor-reports");
    const report: LaborReport = {
      id: "r1",
      uid: "uid-1",
      comp: {
        monthlyAvgWage: 15000,
        hiredAt: "2020-01-01",
        firedAt: "2023-01-01",
        city: "北京",
        dismissalType: "illegal",
      },
      intakeAnswers: { 目前的情况: "公司通知裁员" },
      narrative: "公司以架构调整为由口头通知离职",
      computation: {
        severanceN: 60000,
        illegalExtra: 60000,
        noticePay: 0,
        overtimePay: 0,
        annualLeavePay: 0,
        total: 120000,
        lines: ["经济补偿 N：60000 元", "违法辞退 2N 赔偿金：60000 元"],
        warnings: [],
      },
      reply: "## 一、赔偿明细核对\n...",
      createdAt: Date.now(),
    };
    await expect(saveLaborReport(report, "uid-1")).resolves.toBe("skipped");
  });

  it("deleteLaborReport 无 MySQL 时不抛错（no-op）", async () => {
    const { deleteLaborReport } = await import("../lib/labor-reports");
    await expect(deleteLaborReport("r1", "uid-1")).resolves.toBeUndefined();
  });
});

describe("LaborReport 数据契约", () => {
  it("必填字段：uid/comp/narrative/computation/reply/createdAt", () => {
    const base: LaborReport = {
      id: "r1",
      uid: "uid-1",
      comp: {
        monthlyAvgWage: 15000,
        hiredAt: "2020-01-01",
        firedAt: "2023-01-01",
        city: "北京",
        dismissalType: "illegal",
      },
      intakeAnswers: {},
      narrative: "n",
      computation: {
        severanceN: 0,
        illegalExtra: 0,
        noticePay: 0,
        overtimePay: 0,
        annualLeavePay: 0,
        total: 0,
        lines: [],
        warnings: [],
      },
      reply: "reply",
      createdAt: 1700000000000,
    };
    expect(base.id).toBeTypeOf("string");
    expect(base.uid).toBeTypeOf("string");
    expect(base.comp.monthlyAvgWage).toBeTypeOf("number");
    expect(base.computation.total).toBeTypeOf("number");
    expect(base.reply).toBeTypeOf("string");
    expect(base.createdAt).toBeTypeOf("number");
  });
});
