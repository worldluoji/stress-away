import { NextRequest, NextResponse } from "next/server";
import { listLaborReportsByUid } from "@/lib/labor-reports";
import { getAuthContext } from "@/lib/api-auth";
import { isMySQLAvailable } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { uid } = await getAuthContext(request);
    if (!uid) {
      return NextResponse.json({ error: "login_required" }, { status: 401 });
    }
    const reports = await listLaborReportsByUid(uid);
    // degraded=true 时前端区分"服务暂不可用"与"暂无历史"两种空态
    return NextResponse.json({ reports, degraded: !isMySQLAvailable() });
  } catch (err) {
    console.error("[labor-reports GET]", err);
    return NextResponse.json(
      { error: "Internal error", message: "加载报告历史失败" },
      { status: 500 }
    );
  }
}
