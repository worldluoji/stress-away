import { describe, it, expect } from "vitest";
import { buildReportUserPrompt, buildReportSystemPrompt } from "../lib/models";
import { computeCompensation } from "../lib/compensation";

describe("buildReportUserPrompt", () => {
  it("计算结果的金额与明细必须原样出现在 prompt 中", () => {
    const breakdown = computeCompensation({
      monthlyAvgWage: 20000,
      hiredAt: "2020-01-01",
      firedAt: "2023-01-01",
      city: "北京",
      dismissalType: "illegal",
    });
    const prompt = buildReportUserPrompt(
      breakdown,
      { 目前的情况: "公司通知裁员" },
      "公司以架构调整为由口头通知我离职，不给书面文件。"
    );
    expect(prompt).toContain(String(breakdown.total));
    expect(prompt).toContain(String(breakdown.severanceN));
    breakdown.lines.forEach((line) => expect(prompt).toContain(line));
    expect(prompt).toContain("公司通知裁员");
    expect(prompt).toContain("口头通知");
  });

  it("system prompt 包含五段结构与金额一致性约束", () => {
    const sp = buildReportSystemPrompt();
    for (const section of ["一、赔偿明细核对", "二、证据清单", "三、仲裁流程与时间线", "四、仲裁申请书草稿", "五、风险与谈判策略"]) {
      expect(sp).toContain(section);
    }
    expect(sp).toContain("禁止自行重新计算");
    expect(sp).toContain("第47条"); // 素材注入 resignation-negotiation 的 lawRef
  });
});
