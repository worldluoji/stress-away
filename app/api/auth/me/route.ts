import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user-auth";

/** 当前登录用户（供前端 useAuth 拉取会话态） */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ uid: user.id, username: user.username, role: user.role });
}
