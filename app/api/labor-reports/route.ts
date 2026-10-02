import { NextRequest, NextResponse } from "next/server";
import { listLaborReportsByUid } from "@/lib/labor-reports";
import { getAuthContext } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    const { uid } = getAuthContext(request);
    if (!uid) {
      return NextResponse.json({ error: "login_required" }, { status: 401 });
    }
    const reports = await listLaborReportsByUid(uid);
    return NextResponse.json({ reports });
  } catch (err) {
    console.error("[labor-reports GET]", err);
    return NextResponse.json({ reports: [] });
  }
}
