import { describe, it, expect } from "vitest";
import {
  computeSeveranceMonths,
  computeCompensation,
  localTodayISO,
  type CompInput,
} from "../lib/compensation";
import {
  getSocialWageCap,
  getSocialWageContext,
  SOCIAL_WAGE_MONTHLY_CAP,
  SOCIAL_WAGE_DATA_AS_OF,
  CITY_WAGE_TABLE,
} from "../lib/social-wage";
import { CITY_TO_PROVINCE, PROVINCE_CAPITAL } from "../lib/cities";

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

describe("localTodayISO — 本地 yyyy-mm-dd", () => {
  const cases: { date: Date; want: string; desc: string }[] = [
    { date: new Date(2026, 0, 5), want: "2026-01-05", desc: "月/日补零" },
    { date: new Date(2026, 8, 30), want: "2026-09-30", desc: "单位数月+双位日" },
    { date: new Date(2025, 11, 31), want: "2025-12-31", desc: "年末" },
  ];
  cases.forEach((c) => {
    it(c.desc, () => {
      expect(localTodayISO(c.date)).toBe(c.want);
    });
  });
});

describe("getSocialWageContext — 三级查表链", () => {
  const cases: {
    city: string;
    userOverride?: number | null;
    want: { wage: number | null; source: "city" | "province" | "user" | "uncovered"; resolvedCity: string };
    desc: string;
  }[] = [
    {
      city: "北京",
      want: { wage: SOCIAL_WAGE_MONTHLY_CAP["北京"], source: "city", resolvedCity: "北京" },
      desc: "直辖市命中 city",
    },
    {
      city: "温州",
      want: { wage: SOCIAL_WAGE_MONTHLY_CAP["杭州"], source: "province", resolvedCity: "杭州" },
      desc: "浙江省非省会 → province 代理杭州",
    },
    {
      city: "无锡",
      want: { wage: SOCIAL_WAGE_MONTHLY_CAP["南京"], source: "province", resolvedCity: "南京" },
      desc: "江苏省非省会 → province 代理南京",
    },
    {
      city: "佛山",
      want: { wage: SOCIAL_WAGE_MONTHLY_CAP["广州"], source: "province", resolvedCity: "广州" },
      desc: "广东省非省会 → province 代理广州",
    },
    {
      city: "苏州",
      want: { wage: SOCIAL_WAGE_MONTHLY_CAP["苏州"], source: "city", resolvedCity: "苏州" },
      desc: "江苏省苏州已在 CITY_WAGE_TABLE → city 命中（不走 fallback）",
    },
    {
      city: "深圳",
      want: { wage: SOCIAL_WAGE_MONTHLY_CAP["深圳"], source: "city", resolvedCity: "深圳" },
      desc: "广东省深圳已在 CITY_WAGE_TABLE → city 命中（不走 fallback）",
    },
    {
      city: "拉萨",
      want: { wage: null, source: "uncovered", resolvedCity: "拉萨" },
      desc: "省会也无数据 → uncovered（fail-open）",
    },
    {
      city: "  北京  ",
      want: { wage: SOCIAL_WAGE_MONTHLY_CAP["北京"], source: "city", resolvedCity: "北京" },
      desc: "trim 前后空格",
    },
    {
      city: "北京",
      userOverride: 15000,
      want: { wage: 15000, source: "user", resolvedCity: "北京" },
      desc: "user override 优先于 city 命中",
    },
    {
      city: "拉萨",
      userOverride: 12000,
      want: { wage: 12000, source: "user", resolvedCity: "拉萨" },
      desc: "user override 可救活 uncovered",
    },
    {
      city: "温州",
      userOverride: 9500,
      want: { wage: 9500, source: "user", resolvedCity: "温州" },
      desc: "user override 优先于 province fallback",
    },
  ];
  cases.forEach((c) => {
    it(c.desc, () => {
      const ctx = getSocialWageContext(c.city, c.userOverride);
      expect(ctx.wage).toBe(c.want.wage);
      expect(ctx.source).toBe(c.want.source);
      expect(ctx.resolvedCity).toBe(c.want.resolvedCity);
    });
  });

  it("province 分支的 fallbackNote 包含城市名/省份名/省会代理值", () => {
    const ctx = getSocialWageContext("温州");
    expect(ctx.fallbackNote).toContain("温州");
    expect(ctx.fallbackNote).toContain("浙江");
    expect(ctx.fallbackNote).toContain("杭州");
    expect(ctx.record).not.toBeNull();
    expect(ctx.record?.wage).toBe(SOCIAL_WAGE_MONTHLY_CAP["杭州"]);
  });

  it("city 分支的 fallbackNote 为空字符串", () => {
    const ctx = getSocialWageContext("北京");
    expect(ctx.fallbackNote).toBe("");
    expect(ctx.record).not.toBeNull();
  });

  it("user 分支的 record 为 null（不假装有官方来源）", () => {
    const ctx = getSocialWageContext("北京", 15000);
    expect(ctx.record).toBeNull();
    expect(ctx.fallbackNote).toBe("");
  });

  it("uncovered 分支的 record 与 fallbackNote 都为空", () => {
    const ctx = getSocialWageContext("拉萨");
    expect(ctx.record).toBeNull();
    expect(ctx.fallbackNote).toBe("");
  });
});

describe("getSocialWageContext — userSocialWage 边界", () => {
  const ignoreCases: { v: unknown; desc: string }[] = [
    { v: 0, desc: "0" },
    { v: -1, desc: "负数" },
    { v: Number.NaN, desc: "NaN" },
    { v: Number.POSITIVE_INFINITY, desc: "Infinity" },
    { v: null, desc: "null" },
    { v: undefined, desc: "undefined" },
  ];
  ignoreCases.forEach((c) => {
    it(`非法值 ${c.desc} 应忽略并回退到 city`, () => {
      const ctx = getSocialWageContext("北京", c.v as number | null);
      expect(ctx.source).toBe("city");
      expect(ctx.wage).toBe(SOCIAL_WAGE_MONTHLY_CAP["北京"]);
    });
  });
});

describe("computeCompensation — 警告文本随 source 变化", () => {
  it("city 高薪：警告含封顶与12年，不含代理/未收录", () => {
    const r = computeCompensation(
      baseInput({ monthlyAvgWage: 100000, hiredAt: "2005-01-01", firedAt: "2023-01-01", city: "北京" })
    );
    expect(r.warnings.join("|")).toMatch(/触发第47条双封顶/);
    expect(r.warnings.join("|")).toMatch(/12年|年限最多/);
    expect(r.warnings.join("|")).not.toMatch(/代理/);
    expect(r.warnings.join("|")).not.toMatch(/未收录「北京」/);
  });

  it("province 高薪：警告含未收录城市名 + 代理信息 + 封顶", () => {
    const r = computeCompensation(
      baseInput({ monthlyAvgWage: 100000, hiredAt: "2005-01-01", firedAt: "2023-01-01", city: "温州" })
    );
    const w = r.warnings.join("|");
    expect(w).toMatch(/未收录「温州」/);
    expect(w).toMatch(/浙江省|浙江/);
    expect(w).toMatch(/杭州/);
    expect(w).toMatch(/封顶/);
  });

  it("user 高薪：警告含「用户输入」+ 封顶", () => {
    const r = computeCompensation(
      baseInput({
        monthlyAvgWage: 100000,
        hiredAt: "2005-01-01",
        firedAt: "2023-01-01",
        city: "北京",
        userSocialWage: 12000,
      })
    );
    const w = r.warnings.join("|");
    expect(w).toMatch(/用户输入/);
    expect(w).toMatch(/12000/);
    expect(w).toMatch(/封顶/);
  });

  it("uncovered（无 override）：警告含未收录 + 自行核实 + 不封顶", () => {
    const r = computeCompensation(baseInput({ city: "拉萨" }));
    const w = r.warnings.join("|");
    expect(w).toMatch(/未收录「拉萨」/);
    expect(w).toMatch(/核实/);
    expect(r.severanceN).toBe(60000);
  });
});

describe("computeCompensation — CompBreakdown.wageSource 字段", () => {
  it("city 高薪：wageSource.source = city", () => {
    const r = computeCompensation(
      baseInput({ monthlyAvgWage: 100000, hiredAt: "2005-01-01", firedAt: "2023-01-01" })
    );
    expect(r.wageSource?.source).toBe("city");
    expect(r.wageSource?.effectiveDate).toBe(CITY_WAGE_TABLE["北京"].effectiveDate);
    expect(r.wageSource?.sourceUrl).toBe(CITY_WAGE_TABLE["北京"].sourceUrl);
    expect(r.wageSource?.label).toBe(CITY_WAGE_TABLE["北京"].sourceLabel);
  });

  it("province 高薪：wageSource.source = province，label/effectiveDate 沿用省会", () => {
    const r = computeCompensation(
      baseInput({ monthlyAvgWage: 100000, hiredAt: "2005-01-01", firedAt: "2023-01-01", city: "温州" })
    );
    expect(r.wageSource?.source).toBe("province");
    expect(r.wageSource?.effectiveDate).toBe(CITY_WAGE_TABLE["杭州"].effectiveDate);
    expect(r.wageSource?.sourceUrl).toBe(CITY_WAGE_TABLE["杭州"].sourceUrl);
  });

  it("user 高薪：wageSource.source = user，label 包含数值", () => {
    const r = computeCompensation(
      baseInput({
        monthlyAvgWage: 100000,
        hiredAt: "2005-01-01",
        firedAt: "2023-01-01",
        userSocialWage: 12000,
      })
    );
    expect(r.wageSource?.source).toBe("user");
    expect(r.wageSource?.label).toContain("12000");
    expect(r.wageSource?.effectiveDate).toBe("");
    expect(r.wageSource?.sourceUrl).toBe("");
  });

  it("uncovered（无 override）：wageSource.source = uncovered，字段全空", () => {
    const r = computeCompensation(baseInput({ city: "拉萨" }));
    expect(r.wageSource?.source).toBe("uncovered");
    expect(r.wageSource?.label).toBe("");
    expect(r.wageSource?.effectiveDate).toBe("");
    expect(r.wageSource?.sourceUrl).toBe("");
  });

  it("province fallback 数值正确：severanceN = 3 × 省会 wage × 12", () => {
    const r = computeCompensation(
      baseInput({ monthlyAvgWage: 100000, hiredAt: "2005-01-01", firedAt: "2023-01-01", city: "温州" })
    );
    const hangzhouCap = CITY_WAGE_TABLE["杭州"].wage;
    expect(r.severanceN).toBe(Math.round(3 * hangzhouCap * 12));
  });

  it("user override 数值正确：severanceN = 3 × userSocialWage × 12", () => {
    const r = computeCompensation(
      baseInput({
        monthlyAvgWage: 100000,
        hiredAt: "2005-01-01",
        firedAt: "2023-01-01",
        userSocialWage: 12000,
      })
    );
    expect(r.severanceN).toBe(Math.round(3 * 12000 * 12));
  });
});

describe("CITY_WAGE_TABLE — 全局不变量", () => {
  it("每条记录的 effectiveDate 格式 YYYY-MM 且不超过 SOCIAL_WAGE_DATA_AS_OF", () => {
    for (const [city, rec] of Object.entries(CITY_WAGE_TABLE)) {
      expect(rec.effectiveDate, `${city}.effectiveDate format`).toMatch(/^\d{4}-\d{2}$/);
      expect(rec.effectiveDate <= SOCIAL_WAGE_DATA_AS_OF, `${city} 不晚于全局 floor`).toBe(true);
    }
  });

  it("每条记录的 wage > 0 且 sourceUrl 非空", () => {
    for (const [city, rec] of Object.entries(CITY_WAGE_TABLE)) {
      expect(rec.wage, `${city}.wage`).toBeGreaterThan(0);
      expect(rec.sourceUrl, `${city}.sourceUrl`).not.toBe("");
      expect(rec.sourceLabel, `${city}.sourceLabel`).not.toBe("");
    }
  });

  it("BEIJING_CAP 派生值与 CITY_WAGE_TABLE 一致（防漂移）", () => {
    expect(SOCIAL_WAGE_MONTHLY_CAP["北京"]).toBe(CITY_WAGE_TABLE["北京"].wage);
  });

  it("CITY_TO_PROVINCE / PROVINCE_CAPITAL 内部一致", () => {
    for (const [city, province] of Object.entries(CITY_TO_PROVINCE)) {
      const capital = PROVINCE_CAPITAL[province];
      expect(capital, `${city} → ${province} 必须有省会`).toBeTruthy();
    }
  });

  it("省份省会必须落在 CITY_WAGE_TABLE 中（否则该省 fallback 等于 fail-open）", () => {
    for (const [province, capital] of Object.entries(PROVINCE_CAPITAL)) {
      expect(CITY_WAGE_TABLE[capital], `${province} 省会 ${capital} 必须在 CITY_WAGE_TABLE`).toBeDefined();
    }
  });
});
