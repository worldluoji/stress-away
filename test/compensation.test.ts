import { describe, it, expect } from "vitest";
import {
  computeSeveranceMonths,
  computeCompensation,
  type CompInput,
} from "../lib/compensation";
import { getSocialWageCap, SOCIAL_WAGE_MONTHLY_CAP } from "../lib/social-wage";

const BEIJING_CAP = SOCIAL_WAGE_MONTHLY_CAP["北京"];

describe("computeSeveranceMonths — 《劳动合同法》第47条取整", () => {
  const cases: { hiredAt: string; firedAt: string; want: number; desc: string }[] = [
    { hiredAt: "2020-01-01", firedAt: "2023-01-01", want: 3, desc: "3年整→3" },
    { hiredAt: "2020-01-01", firedAt: "2023-06-01", want: 3.5, desc: "3年5个月→3.5" },
    { hiredAt: "2020-01-01", firedAt: "2023-07-01", want: 4, desc: "3年6个月→4（六个月以上按一年）" },
    { hiredAt: "2020-01-01", firedAt: "2023-08-15", want: 4, desc: "3年7个月15天→4" },
    { hiredAt: "2020-01-01", firedAt: "2020-05-01", want: 0.5, desc: "不满6个月→0.5" },
    { hiredAt: "2020-01-01", firedAt: "2020-07-01", want: 1, desc: "恰好6个月→1" },
    { hiredAt: "2020-01-01", firedAt: "2020-01-01", want: 0.5, desc: "同一天→最低0.5" },
    { hiredAt: "2020-01-01", firedAt: "2035-01-01", want: 15, desc: "15年→15（年限封顶只在高薪时适用，此处不截断）" },
  ];
  cases.forEach((c) => {
    it(c.desc, () => {
      expect(computeSeveranceMonths(c.hiredAt, c.firedAt)).toBe(c.want);
    });
  });
});

function baseInput(overrides: Partial<CompInput>): CompInput {
  return {
    monthlyAvgWage: 20000,
    lastMonthWage: undefined,
    hiredAt: "2020-01-01",
    firedAt: "2023-01-01",
    city: "北京",
    dismissalType: "mutual",
    ...overrides,
  };
}

describe("computeCompensation — 各解除情形金额", () => {
  const cases: { input: Partial<CompInput>; want: { severanceN: number; illegalExtra: number; noticePay: number; overtimePay: number; annualLeavePay: number; total: number }; desc: string }[] = [
    {
      desc: "协商解除：3年×20000=60000",
      input: {},
      want: { severanceN: 60000, illegalExtra: 0, noticePay: 0, overtimePay: 0, annualLeavePay: 0, total: 60000 },
    },
    {
      desc: "违法解除：2N 替代 N，总额翻倍（第87条）",
      input: { dismissalType: "illegal" },
      want: { severanceN: 60000, illegalExtra: 60000, noticePay: 0, overtimePay: 0, annualLeavePay: 0, total: 120000 },
    },
    {
      desc: "第40条无过失解除且未提前30日通知：N + 代通知金（按上月工资15000，非12月平均12000）",
      input: {
        dismissalType: "no-fault-40",
        monthlyAvgWage: 12000,
        lastMonthWage: 15000,
        noAdvanceNotice: true,
      },
      want: { severanceN: 36000, illegalExtra: 0, noticePay: 15000, overtimePay: 0, annualLeavePay: 0, total: 51000 },
    },
    {
      desc: "第40条已提前30日书面通知：无代通知金",
      input: { dismissalType: "no-fault-40", noAdvanceNotice: false },
      want: { severanceN: 60000, illegalExtra: 0, noticePay: 0, overtimePay: 0, annualLeavePay: 0, total: 60000 },
    },
    {
      desc: "高薪双封顶：10万月薪北京，基数=3×社平，年限18年截为12",
      input: {
        monthlyAvgWage: 100000,
        hiredAt: "2005-01-01",
        firedAt: "2023-01-01",
      },
      want: {
        severanceN: Math.round(3 * BEIJING_CAP * 12),
        illegalExtra: 0,
        noticePay: 0,
        overtimePay: 0,
        annualLeavePay: 0,
        total: Math.round(3 * BEIJING_CAP * 12),
      },
    },
    {
      desc: "加班费：时薪=8700÷21.75÷8=50；1.5×10h + 2×8h + 3×4h = 2150（叠加0.5个月基数N=4350）",
      input: {
        monthlyAvgWage: 8700,
        hiredAt: "2022-06-01",
        firedAt: "2022-09-01",
        overtimeHours: { weekday: 10, weekend: 8, holiday: 4 },
      },
      want: { severanceN: 4350, illegalExtra: 0, noticePay: 0, overtimePay: 2150, annualLeavePay: 0, total: 6500 },
    },
    {
      desc: "未休年假5天：日薪=8700÷21.75=400，补发200%部分=400×5×2=4000",
      input: {
        monthlyAvgWage: 8700,
        hiredAt: "2022-06-01",
        firedAt: "2022-09-01",
        unusedAnnualLeaveDays: 5,
      },
      want: { severanceN: 4350, illegalExtra: 0, noticePay: 0, overtimePay: 0, annualLeavePay: 4000, total: 8350 },
    },
    {
      desc: "被迫离职（第38条欠薪）：N + 加班费/年假照常累计",
      input: {
        dismissalType: "forced-resign",
        monthlyAvgWage: 8700,
        hiredAt: "2022-06-01",
        firedAt: "2022-09-01",
        unusedAnnualLeaveDays: 5,
      },
      want: { severanceN: 4350, illegalExtra: 0, noticePay: 0, overtimePay: 0, annualLeavePay: 4000, total: 8350 },
    },
  ];

  cases.forEach((c) => {
    it(c.desc, () => {
      const r = computeCompensation(baseInput(c.input));
      expect(r).toMatchObject(c.want);
    });
  });
});

describe("computeCompensation — 警示与兜底", () => {
  it("触发高薪封顶时 warnings 提及封顶/12年", () => {
    const r = computeCompensation(
      baseInput({ monthlyAvgWage: 100000, hiredAt: "2005-01-01", firedAt: "2023-01-01" })
    );
    expect(r.warnings.join("|")).toMatch(/封顶|12年/);
  });

  it("未收录城市：不封顶计算，但 warnings 提示社平标准需自行核实", () => {
    const r = computeCompensation(baseInput({ city: "拉萨" }));
    expect(getSocialWageCap("拉萨")).toBeNull();
    expect(r.warnings.join("|")).toMatch(/社平|核实/);
    expect(r.severanceN).toBe(60000);
  });

  it("代通知金只适用于第40条，违法解除时强制为0", () => {
    const r = computeCompensation(
      baseInput({ dismissalType: "illegal", noAdvanceNotice: true })
    );
    expect(r.noticePay).toBe(0);
  });

  it("lines 至少为每个非零科目生成一条说明", () => {
    const r = computeCompensation(
      baseInput({ dismissalType: "no-fault-40", noAdvanceNotice: true, unusedAnnualLeaveDays: 3 })
    );
    expect(r.lines.length).toBeGreaterThanOrEqual(3);
  });
});
