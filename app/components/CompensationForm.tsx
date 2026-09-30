"use client";

import { useEffect, useMemo, useState } from "react";
import {
  computeCompensation,
  localTodayISO,
  type CompInput,
  type DismissalType,
} from "@/lib/compensation";
import { SOCIAL_WAGE_MONTHLY_CAP, SOCIAL_WAGE_DATA_AS_OF } from "@/lib/social-wage";

const DISMISSAL_OPTIONS: { value: DismissalType; label: string }[] = [
  { value: "illegal", label: "公司违法辞退/强行裁员（2N）" },
  { value: "no-fault-40", label: "无过失辞退：医疗期/不胜任/客观情况变化（N或N+1）" },
  { value: "mutual", label: "协商解除（N）" },
  { value: "expired", label: "合同到期公司不续签（N）" },
  { value: "forced-resign", label: "因欠薪/不缴社保被迫离职（N）" },
];

const inputClass =
  "w-full rounded-xl bg-[--background-secondary] border border-[var(--card-border)] px-4 py-3 text-[15px] text-[--foreground] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30";
const labelClass = "block text-xs font-medium text-[--foreground-secondary] mb-1.5";

export function CompensationForm({
  onChangeComp,
}: {
  onChangeComp?: (comp: CompInput) => void;
}) {
  const [wage, setWage] = useState("");
  const [lastMonthWage, setLastMonthWage] = useState("");
  const [hiredAt, setHiredAt] = useState("");
  const [firedAt, setFiredAt] = useState("");
  const [city, setCity] = useState("北京");
  const [dismissalType, setDismissalType] = useState<DismissalType>("illegal");
  const [noAdvanceNotice, setNoAdvanceNotice] = useState(true);
  const [otWeekday, setOtWeekday] = useState("");
  const [otWeekend, setOtWeekend] = useState("");
  const [otHoliday, setOtHoliday] = useState("");
  const [leaveDays, setLeaveDays] = useState("");

  const wageNum = parseFloat(wage);
  const valid =
    Number.isFinite(wageNum) && wageNum > 0 && hiredAt !== "" &&
    (firedAt === "" || new Date(firedAt) >= new Date(hiredAt));

  const comp: CompInput | null = useMemo(() => {
    if (!valid) return null;
    return {
      monthlyAvgWage: wageNum,
      lastMonthWage: lastMonthWage ? parseFloat(lastMonthWage) : undefined,
      hiredAt,
      firedAt: firedAt || localTodayISO(),
      city: city.trim(),
      dismissalType,
      noAdvanceNotice: dismissalType === "no-fault-40" ? noAdvanceNotice : undefined,
      overtimeHours: {
        weekday: parseFloat(otWeekday) || 0,
        weekend: parseFloat(otWeekend) || 0,
        holiday: parseFloat(otHoliday) || 0,
      },
      unusedAnnualLeaveDays: parseFloat(leaveDays) || 0,
    };
  }, [valid, wageNum, lastMonthWage, hiredAt, firedAt, city, dismissalType, noAdvanceNotice, otWeekday, otWeekend, otHoliday, leaveDays]);

  useEffect(() => {
    if (comp) onChangeComp?.(comp);
  }, [comp, onChangeComp]);

  const breakdown = useMemo(
    () => (comp ? computeCompensation(comp) : null),
    [comp]
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>月平均工资（解除前12个月，元）</label>
          <input type="number" inputMode="decimal" value={wage}
            onChange={(e) => setWage(e.target.value)} placeholder="如 15000" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>工作城市</label>
          <input list="city-list" value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
          <datalist id="city-list">
            {Object.keys(SOCIAL_WAGE_MONTHLY_CAP).map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label className={labelClass}>入职日期</label>
          <input
            type="date"
            value={hiredAt}
            onChange={(e) => setHiredAt(e.target.value)}
            onClick={(e) => { try { e.currentTarget.showPicker(); } catch { /* 浏览器不支持 */ } }}
            className={`${inputClass} cursor-pointer`}
          />
        </div>
        <div>
          <label className={labelClass}>离职日期（尚未离职可留空，按今天估算）</label>
          <input
            type="date"
            value={firedAt}
            onChange={(e) => setFiredAt(e.target.value)}
            onClick={(e) => { try { e.currentTarget.showPicker(); } catch { /* 浏览器不支持 */ } }}
            className={`${inputClass} cursor-pointer`}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>解除情形</label>
        <select value={dismissalType}
          onChange={(e) => setDismissalType(e.target.value as DismissalType)}
          className={inputClass}>
          {DISMISSAL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {dismissalType === "no-fault-40" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>上月工资（代通知金基数，元，选填）</label>
            <input type="number" inputMode="decimal" value={lastMonthWage}
              onChange={(e) => setLastMonthWage(e.target.value)} placeholder="不填按月平均工资" className={inputClass} />
          </div>
          <label className="flex items-end gap-2 pb-3 text-sm text-[--foreground-secondary]">
            <input type="checkbox" checked={noAdvanceNotice}
              onChange={(e) => setNoAdvanceNotice(e.target.checked)}
              className="w-4 h-4 accent-[#007AFF]" />
            公司未提前30日书面通知（+1）
          </label>
        </div>
      )}

      <details className="rounded-xl border border-[var(--card-border)]">
        <summary className="px-4 py-3 text-sm font-medium text-[--foreground-secondary] cursor-pointer select-none">
          选填：加班时长与未休年假
        </summary>
        <div className="px-4 pb-4 grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>工作日加班（小时）</label>
            <input type="number" inputMode="numeric" value={otWeekday}
              onChange={(e) => setOtWeekday(e.target.value)} placeholder="0" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>休息日加班（小时）</label>
            <input type="number" inputMode="numeric" value={otWeekend}
              onChange={(e) => setOtWeekend(e.target.value)} placeholder="0" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>法定节假日加班（小时）</label>
            <input type="number" inputMode="numeric" value={otHoliday}
              onChange={(e) => setOtHoliday(e.target.value)} placeholder="0" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>未休年假（天）</label>
            <input type="number" inputMode="numeric" value={leaveDays}
              onChange={(e) => setLeaveDays(e.target.value)} placeholder="0" className={inputClass} />
          </div>
        </div>
      </details>

      {breakdown ? (
        <div className="rounded-2xl bg-gradient-to-br from-[#007AFF] to-[#5856D6] text-white p-5 shadow-lg animate-fade-in">
          <p className="text-xs opacity-80 mb-1">你大概率可以主张</p>
          <p className="text-3xl font-bold tracking-tight">
            ¥ {breakdown.total.toLocaleString("zh-CN")}
          </p>
          <ul className="mt-3 space-y-1.5 text-sm opacity-95">
            {breakdown.lines.map((l, i) => (
              <li key={i}>· {l}</li>
            ))}
          </ul>
          {breakdown.warnings.length > 0 && (
            <ul className="mt-3 pt-3 border-t border-white/20 space-y-1 text-xs opacity-80">
              {breakdown.warnings.map((w, i) => (
                <li key={i}>⚠️ {w}</li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs opacity-70">
            估算依据 {SOCIAL_WAGE_DATA_AS_OF} 社平标准与《劳动合同法》第40/47/87条，最终以劳动仲裁认定为准。
          </p>
        </div>
      ) : (
        <p className="text-sm text-[--foreground-tertiary] text-center py-4">
          填写工资与入职日期，实时估算你可主张的法定赔偿
        </p>
      )}
    </div>
  );
}
