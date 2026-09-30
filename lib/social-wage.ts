// 各城市"全口径城镇单位就业人员月平均工资"——用于《劳动合同法》第47条高薪双封顶。
// 数值为各人社局公布的近似值，上线前必须逐城市人工核对最新口径。
export const SOCIAL_WAGE_DATA_AS_OF = "2025-06";

export const SOCIAL_WAGE_MONTHLY_CAP: Record<string, number> = {
  北京: 11761,
  上海: 12307,
  深圳: 13730,
  广州: 11451,
  杭州: 10119,
  南京: 10087,
  苏州: 9625,
  成都: 9437,
  武汉: 9228,
  西安: 8753,
  天津: 9633,
  长沙: 8536,
  青岛: 8440,
  郑州: 8058,
  东莞: 8216,
};

export function getSocialWageCap(city: string): number | null {
  return SOCIAL_WAGE_MONTHLY_CAP[city] ?? null;
}
