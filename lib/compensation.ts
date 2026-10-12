import { getSocialWageContext, SOCIAL_WAGE_DATA_AS_OF, type WageSource } from "./social-wage";

// 《劳动合同法》第47条：每满一年支付一个月工资；六个月以上不满一年按一年；不满六个月支付半个月。
// 第87条：违法解除按经济补偿标准的二倍支付赔偿金（2N 替代 N）。
// 第40条：无过失性辞退未提前30日书面通知时，额外支付一个月工资（代通知金，基数为上月工资）。
// 《工资支付暂行规定》：月计薪天数 21.75 天；加班费 150%/200%/300%。
// 《职工带薪年休假条例》第5条：未休年假按日工资300%支付，其中100%为正常出勤工资，补发200%。

export type DismissalType =
  | "mutual"          // 协商解除（第36条）
  | "no-fault-40"     // 无过失性辞退（第40条）
  | "illegal"         // 违法解除（第87条，2N）
  | "expired"         // 合同到期单位不续签/降低条件
  | "forced-resign";  // 单位过错致被迫离职（第38条）

export interface CompInput {
  monthlyAvgWage: number;
  lastMonthWage?: number;
  hiredAt: string; // yyyy-mm-dd
  firedAt: string; // yyyy-mm-dd
  city: string;
  dismissalType: DismissalType;
  noAdvanceNotice?: boolean;
  overtimeHours?: { weekday: number; weekend: number; holiday: number };
  unusedAnnualLeaveDays?: number;
  /** 用户手动提供的当地社平工资（月，元）。非正数/null/undefined 时忽略。 */
  userSocialWage?: number | null;
}

/** 封顶基数来源展示用。Form 渲染时把它放在结果卡里。 */
export interface WageSourceInfo {
  source: WageSource;
  label: string;
  effectiveDate: string;
  sourceUrl: string;
}

export interface CompBreakdown {
  severanceN: number;
  illegalExtra: number;
  noticePay: number;
  overtimePay: number;
  annualLeavePay: number;
  total: number;
  lines: string[];
  warnings: string[];
  /** 封顶基数来源；失败兜底（uncovered）时字段全空 */
  wageSource?: WageSourceInfo;
}

// 本地时区的 yyyy-mm-dd（不能用 toISOString，UTC 会在东八区早8点前偏移一天）
export function localTodayISO(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const MONTHLY_WORK_DAYS = 21.75;
const HOURS_PER_WORKDAY = 8;
const OVERTIME_RATE_WEEKDAY = 1.5;
const OVERTIME_RATE_WEEKEND = 2;
const OVERTIME_RATE_HOLIDAY = 3;
const ANNUAL_LEAVE_PREMIUM_RATE = 2;
const HIGH_EARNER_CAP_MULTIPLIER = 3;
const HIGH_EARNER_YEARS_CAP = 12;
const HALF_MONTH = 0.5;
const FULL_MONTH = 1;
const MONTHS_PER_YEAR = 12;
const REMAINDER_FULL_YEAR_THRESHOLD_MONTHS = 6;

function diffInMonths(hiredAt: string, firedAt: string): number {
  const h = new Date(hiredAt);
  const f = new Date(firedAt);
  let months =
    (f.getFullYear() - h.getFullYear()) * MONTHS_PER_YEAR +
    (f.getMonth() - h.getMonth());
  let extraDays = f.getDate() - h.getDate();
  if (extraDays < 0) {
    months -= 1;
    // 折算为上一个离职月的天数近似值，不足一月按一个月计（对劳动者有利口径）
    extraDays += new Date(f.getFullYear(), f.getMonth(), 0).getDate();
  }
  if (months < 0) return 0;
  return months + (extraDays > 0 ? 1 : 0);
}

export function computeSeveranceMonths(hiredAt: string, firedAt: string): number {
  const totalMonths = diffInMonths(hiredAt, firedAt);
  if (totalMonths < REMAINDER_FULL_YEAR_THRESHOLD_MONTHS) return HALF_MONTH;
  const fullYears = Math.floor(totalMonths / MONTHS_PER_YEAR);
  const remainder = totalMonths % MONTHS_PER_YEAR;
  if (remainder === 0) return fullYears;
  if (remainder >= REMAINDER_FULL_YEAR_THRESHOLD_MONTHS) return fullYears + FULL_MONTH;
  return fullYears + HALF_MONTH;
}

export function computeCompensation(input: CompInput): CompBreakdown {
  const warnings: string[] = [];
  const lines: string[] = [];

  const monthsRaw = computeSeveranceMonths(input.hiredAt, input.firedAt);
  const ctx = getSocialWageContext(input.city, input.userSocialWage ?? null);

  const wageSource: WageSourceInfo = ctx.record
    ? {
        source: ctx.source,
        label: ctx.record.sourceLabel,
        effectiveDate: ctx.record.effectiveDate,
        sourceUrl: ctx.record.sourceUrl,
      }
    : ctx.source === "user"
    ? { source: "user", label: `用户输入 ${ctx.wage}`, effectiveDate: "", sourceUrl: "" }
    : { source: "uncovered", label: "", effectiveDate: "", sourceUrl: "" };

  let base = input.monthlyAvgWage;
  let months = monthsRaw;

  if (ctx.wage === null) {
    warnings.push(
      `未收录「${input.city}」的社平工资数据（截至${SOCIAL_WAGE_DATA_AS_OF}），也未匹配到所属省份的代理值，请自行核实当地标准。`
    );
  } else if (input.monthlyAvgWage > HIGH_EARNER_CAP_MULTIPLIER * ctx.wage) {
    base = HIGH_EARNER_CAP_MULTIPLIER * ctx.wage;
    if (months > HIGH_EARNER_YEARS_CAP) months = HIGH_EARNER_YEARS_CAP;

    if (ctx.source === "province") {
      warnings.push(
        `月薪超过当地社平工资${HIGH_EARNER_CAP_MULTIPLIER}倍，触发第47条双封顶：计算基数按 3×${ctx.fallbackNote}`
      );
    } else if (ctx.source === "user") {
      warnings.push(
        `月薪超过当地社平工资${HIGH_EARNER_CAP_MULTIPLIER}倍（按用户输入 ${ctx.wage} 元），触发第47条双封顶：计算基数按 3×该值、年限最多${HIGH_EARNER_YEARS_CAP}年。请确保所填社平与当地人社局一致。`
      );
    } else {
      warnings.push(
        `月薪超过当地社平工资${HIGH_EARNER_CAP_MULTIPLIER}倍，触发第47条双封顶：计算基数按3×社平、年限最多${HIGH_EARNER_YEARS_CAP}年。`
      );
    }
  }

  const severanceN = Math.round(base * months);
  const isIllegal = input.dismissalType === "illegal";
  const illegalExtra = isIllegal ? severanceN : 0;
  if (isIllegal) {
    lines.push(
      `经济补偿 N：${months} 个月 × 基数 ${base} 元 = ${severanceN} 元；违法解除按 2N 支付赔偿金 ${severanceN * 2} 元（第87条，2N 替代 N）。`
    );
  } else {
    lines.push(`经济补偿 N：${months} 个月 × 基数 ${base} 元 = ${severanceN} 元。`);
  }

  let noticePay = 0;
  if (input.dismissalType === "no-fault-40" && input.noAdvanceNotice) {
    noticePay = Math.round(input.lastMonthWage ?? input.monthlyAvgWage);
    lines.push(`代通知金 +1：按解除前上月工资 ${noticePay} 元（第40条，未提前30日书面通知）。`);
  }

  let overtimePay = 0;
  const ot = input.overtimeHours;
  if (ot && (ot.weekday > 0 || ot.weekend > 0 || ot.holiday > 0)) {
    const hourly = input.monthlyAvgWage / MONTHLY_WORK_DAYS / HOURS_PER_WORKDAY;
    overtimePay = Math.round(
      hourly *
        (ot.weekday * OVERTIME_RATE_WEEKDAY +
          ot.weekend * OVERTIME_RATE_WEEKEND +
          ot.holiday * OVERTIME_RATE_HOLIDAY)
    );
    lines.push(
      `加班费：工作日${ot.weekday}h×150% + 休息日${ot.weekend}h×200% + 法定节假日${ot.holiday}h×300% = ${overtimePay} 元（时薪 ${hourly.toFixed(2)} 元）。`
    );
    warnings.push("休息日加班若已安排补休则不支持 200% 部分，请按实际情况核减。");
  }

  let annualLeavePay = 0;
  const leaveDays = input.unusedAnnualLeaveDays ?? 0;
  if (leaveDays > 0) {
    const daily = input.monthlyAvgWage / MONTHLY_WORK_DAYS;
    annualLeavePay = Math.round(daily * leaveDays * ANNUAL_LEAVE_PREMIUM_RATE);
    lines.push(
      `未休年假折算：${leaveDays} 天 × 日工资 ${daily.toFixed(2)} 元 × 200%（300% 中扣除已发的正常出勤工资）= ${annualLeavePay} 元。`
    );
  }

  const total = severanceN + illegalExtra + noticePay + overtimePay + annualLeavePay;

  if (ctx.record) {
    const proxyClause = ctx.source === "province" ? `，${ctx.resolvedCity} 代理 ${input.city}` : "";
    warnings.push(
      `封顶基数依据${ctx.record.sourceLabel} ${ctx.record.effectiveDate} 公布的"全口径城镇单位就业人员月平均工资"（${ctx.wage} 元${proxyClause}），实际以劳动仲裁/法院认定为准。`
    );
  } else if (ctx.source === "user") {
    warnings.push(
      `封顶基数依据用户输入（${ctx.wage} 元），请确保与当地人社局公布口径一致；实际以劳动仲裁/法院认定为准。`
    );
  } else {
    warnings.push(
      `赔偿估算依据 ${SOCIAL_WAGE_DATA_AS_OF} 前后公布的社平标准（本次未命中任何城市/省份代理值），实际以劳动仲裁/法院认定为准。`
    );
  }

  return {
    severanceN,
    illegalExtra,
    noticePay,
    overtimePay,
    annualLeavePay,
    total,
    lines,
    warnings,
    wageSource,
  };
}
