import { NextResponse } from "next/server";
import { destroySession } from "@/lib/user-auth";

/** 登出：cookie 必清；DB 会话行删除失败时显式告知 sessionPurged:false */
export async function POST() {
  const sessionPurged = await destroySession();
  return NextResponse.json({ ok: true, sessionPurged });
}
