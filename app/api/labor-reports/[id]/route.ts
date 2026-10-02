import { NextRequest, NextResponse } from "next/server";
import { getLaborReport, deleteLaborReport } from "@/lib/labor-reports";
import { getAuthContext } from "@/lib/api-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { uid } = getAuthContext(request);
    if (!uid) {
      return NextResponse.json({ error: "login_required" }, { status: 401 });
    }
    const { id } = await params;
    const report = await getLaborReport(id, uid);
    if (!report) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ report });
  } catch (err) {
    console.error("[labor-reports/:id GET]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { uid } = getAuthContext(request);
    if (!uid) {
      return NextResponse.json({ error: "login_required" }, { status: 401 });
    }
    const { id } = await params;
    await deleteLaborReport(id, uid);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[labor-reports/:id DELETE]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
