/**
 * 维权方案报告持久化（uid-scoped，付费用户专属）。
 * AI 成功 + consumeUsageByUid 后由 /api/report 写入；
 * 客户端 /labor 抽屉读取历史并复用 docx 下载。
 */

import type { CompInput, CompBreakdown } from "./compensation";
import { query, execute, isMySQLAvailable } from "./db";

export interface LaborReport {
  id: string;
  uid: string;
  comp: CompInput;
  intakeAnswers: Record<string, string>;
  narrative: string;
  computation: CompBreakdown;
  reply: string;
  createdAt: number;
}

interface LaborReportRow {
  id: string;
  uid: string;
  comp_json: string;
  intake_answers_json: string | null;
  narrative: string;
  computation_json: string;
  reply: string;
  created_at: string;
}

function rowToLaborReport(row: LaborReportRow): LaborReport {
  return {
    id: row.id,
    uid: row.uid,
    comp: JSON.parse(row.comp_json),
    intakeAnswers: row.intake_answers_json ? JSON.parse(row.intake_answers_json) : {},
    narrative: row.narrative,
    computation: JSON.parse(row.computation_json),
    reply: row.reply,
    createdAt: Number(row.created_at),
  };
}

export async function listLaborReportsByUid(uid: string): Promise<LaborReport[]> {
  if (!isMySQLAvailable()) return [];
  try {
    const rows = await query<LaborReportRow>(
      "SELECT * FROM labor_reports WHERE uid = ? ORDER BY created_at DESC LIMIT 50",
      [uid]
    );
    return rows.map(rowToLaborReport);
  } catch (err) {
    console.error("[labor-reports] listLaborReportsByUid failed:", err);
    return [];
  }
}

export async function saveLaborReport(report: LaborReport, uid: string): Promise<void> {
  if (!isMySQLAvailable()) return;
  try {
    await execute(
      `INSERT INTO labor_reports (id, uid, comp_json, intake_answers_json, narrative, computation_json, reply, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         comp_json = VALUES(comp_json),
         intake_answers_json = VALUES(intake_answers_json),
         narrative = VALUES(narrative),
         computation_json = VALUES(computation_json),
         reply = VALUES(reply)`,
      [
        report.id,
        uid,
        JSON.stringify(report.comp),
        JSON.stringify(report.intakeAnswers),
        report.narrative,
        JSON.stringify(report.computation),
        report.reply,
        report.createdAt,
      ]
    );
  } catch (err) {
    console.error("[labor-reports] saveLaborReport failed:", err);
  }
}

export async function getLaborReport(id: string, uid: string): Promise<LaborReport | null> {
  if (!isMySQLAvailable()) return null;
  try {
    const rows = await query<LaborReportRow>(
      "SELECT * FROM labor_reports WHERE id = ? AND uid = ?",
      [id, uid]
    );
    if (rows.length === 0) return null;
    return rowToLaborReport(rows[0]);
  } catch (err) {
    console.error("[labor-reports] getLaborReport failed:", err);
    return null;
  }
}

export async function deleteLaborReport(id: string, uid: string): Promise<void> {
  if (!isMySQLAvailable()) return;
  try {
    await execute("DELETE FROM labor_reports WHERE id = ? AND uid = ?", [id, uid]);
  } catch (err) {
    console.error("[labor-reports] deleteLaborReport failed:", err);
  }
}
