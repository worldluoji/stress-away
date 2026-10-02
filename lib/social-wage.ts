import { CITY_TO_PROVINCE, PROVINCE_CAPITAL } from "./cities";

// 各城市"全口径城镇单位就业人员月平均工资"——用于《劳动合同法》第47条高薪双封顶。
// 数据由人工维护，规模 15 城（不自动 pipeline），年度更新。
// 每条记录含来源 URL + 生效日期；结果页可展示给用户自查。
//
// 注意：现有数值仍为近似值，上线前需逐城市对照当地人社局最新口径核对。
// 历史值见 `git log lib/social-wage.ts`，sourceUrl 需替换为各地人社局发布的
// "全口径城镇单位就业人员平均工资"具体公告链接。

/** 全局时效 floor：每条 WageRecord.effectiveDate 不得晚于此。年度人工更新。 */
export const SOCIAL_WAGE_DATA_AS_OF = "2025-06";

export interface WageRecord {
  /** 月平均工资（元），全口径城镇单位就业人员 */
  wage: number;
  /** 生效日期，YYYY-MM */
  effectiveDate: string;
  /** 人社局公告 URL；用于结果页给用户自查 */
  sourceUrl: string;
  /** 来源展示名，如 "北京市人社局" */
  sourceLabel: string;
}

export type WageSource = "city" | "province" | "user" | "uncovered";

export interface SocialWageContext {
  /** null 表示 fail-open（未收录 + 无省份代理） */
  wage: number | null;
  /** 命中路径：city / province（省会代理）/ user / uncovered */
  source: WageSource;
  /** province 分支的兜底说明（其它分支恒为空字符串） */
  fallbackNote: string;
  /** 命中或代理命中的 WageRecord；user / uncovered 时为 null */
  record: WageRecord | null;
  /** 实际代理到的城市名（province 分支专用）；其它分支与输入 city 相同 */
  resolvedCity: string;
}

/** 高频城市社平工资封顶表（单源数据，省份代理直接复用省会那一行）。 */
export const CITY_WAGE_TABLE: Record<string, WageRecord> = {
  北京: { wage: 11761, effectiveDate: "2025-06", sourceUrl: "https://rsj.beijing.gov.cn/", sourceLabel: "北京市人社局" },
  上海: { wage: 12307, effectiveDate: "2025-06", sourceUrl: "https://rsj.sh.gov.cn/", sourceLabel: "上海市人社局" },
  深圳: { wage: 13730, effectiveDate: "2025-06", sourceUrl: "http://hrss.sz.gov.cn/", sourceLabel: "深圳市人社局" },
  广州: { wage: 11451, effectiveDate: "2025-06", sourceUrl: "http://rsj.gz.gov.cn/", sourceLabel: "广州市人社局" },
  杭州: { wage: 10119, effectiveDate: "2025-06", sourceUrl: "https://hrss.hangzhou.gov.cn/", sourceLabel: "杭州市人社局" },
  南京: { wage: 10087, effectiveDate: "2025-06", sourceUrl: "https://rsj.nanjing.gov.cn/", sourceLabel: "南京市人社局" },
  苏州: { wage: 9625, effectiveDate: "2025-06", sourceUrl: "http://hrss.suzhou.gov.cn/", sourceLabel: "苏州市人社局" },
  成都: { wage: 9437, effectiveDate: "2025-06", sourceUrl: "http://cdhrss.chengdu.gov.cn/", sourceLabel: "成都市人社局" },
  武汉: { wage: 9228, effectiveDate: "2025-06", sourceUrl: "http://rsj.wuhan.gov.cn/", sourceLabel: "武汉市人社局" },
  西安: { wage: 8753, effectiveDate: "2025-06", sourceUrl: "http://rsj.xa.gov.cn/", sourceLabel: "西安市人社局" },
  天津: { wage: 9633, effectiveDate: "2025-06", sourceUrl: "https://hrss.tj.gov.cn/", sourceLabel: "天津市人社局" },
  长沙: { wage: 8536, effectiveDate: "2025-06", sourceUrl: "http://rsj.changsha.gov.cn/", sourceLabel: "长沙市人社局" },
  青岛: { wage: 8440, effectiveDate: "2025-06", sourceUrl: "http://rsj.qingdao.gov.cn/", sourceLabel: "青岛市人社局" },
  郑州: { wage: 8058, effectiveDate: "2025-06", sourceUrl: "http://rsj.zhengzhou.gov.cn/", sourceLabel: "郑州市人社局" },
  东莞: { wage: 8216, effectiveDate: "2025-06", sourceUrl: "http://hrss.dg.gov.cn/", sourceLabel: "东莞市人社局" },
  // 直辖市 重庆（计划 §9.1 提到通过自身代理受益；补全后省份代理链自洽）
  重庆: { wage: 8800, effectiveDate: "2025-06", sourceUrl: "http://rlsbj.cq.gov.cn/", sourceLabel: "重庆市人社局" },
  // 山东省会 济南（补全后 山东 province fallback 链可用：烟台/潍坊等可通过省会代理）
  济南: { wage: 9000, effectiveDate: "2025-06", sourceUrl: "http://jnhrss.jinan.gov.cn/", sourceLabel: "济南市人社局" },
};

/** 三级查表链：user override → city → province-capital → uncovered */
export function getSocialWageContext(city: string, userOverride?: number | null): SocialWageContext {
  const trimmed = city.trim();

  if (
    typeof userOverride === "number" &&
    Number.isFinite(userOverride) &&
    userOverride > 0
  ) {
    return {
      wage: userOverride,
      source: "user",
      fallbackNote: "",
      record: null,
      resolvedCity: trimmed,
    };
  }

  const direct = CITY_WAGE_TABLE[trimmed];
  if (direct) {
    return {
      wage: direct.wage,
      source: "city",
      fallbackNote: "",
      record: direct,
      resolvedCity: trimmed,
    };
  }

  const province = CITY_TO_PROVINCE[trimmed];
  if (province) {
    const capital = PROVINCE_CAPITAL[province];
    const proxy = capital ? CITY_WAGE_TABLE[capital] : undefined;
    if (proxy) {
      const showProvince = province === capital ? "" : province;
      return {
        wage: proxy.wage,
        source: "province",
        fallbackNote: `未收录「${trimmed}」的社平工资数据，使用${showProvince}省平均（${capital} ${proxy.wage} 元）作为封顶参考，实际以${trimmed}市人社局为准`,
        record: proxy,
        resolvedCity: capital,
      };
    }
  }

  return {
    wage: null,
    source: "uncovered",
    fallbackNote: "",
    record: null,
    resolvedCity: trimmed,
  };
}

/** 后向兼容：返回 wage 或 null（fail-open）。 */
export function getSocialWageCap(city: string): number | null {
  return getSocialWageContext(city).wage;
}

/** 后向兼容：number-only 派生视图，供 Form datalist 与测试 `BEIJING_CAP` 使用。 */
export const SOCIAL_WAGE_MONTHLY_CAP: Record<string, number> = Object.fromEntries(
  Object.entries(CITY_WAGE_TABLE).map(([k, v]) => [k, v.wage])
);
