import { NextResponse } from "next/server";
import {
  getCurrentUser,
  createUser,
  generateInitialPassword,
  adminResetPassword,
  listUsers,
} from "@/lib/user-auth";

// 与 users.username VARCHAR(32) 对齐
const MAX_USERNAME_LENGTH = 32;
const DUPLICATE_ENTRY = "ER_DUP_ENTRY";

async function guardAdmin(): Promise<NextResponse | null> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "not_admin" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const denied = await guardAdmin();
  if (denied) return denied;
  try {
    return NextResponse.json({ users: await listUsers() });
  } catch (error) {
    console.error("[admin/users] list failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const username = String(body.username ?? "").trim();
  if (username.length === 0 || username.length > MAX_USERNAME_LENGTH) {
    return NextResponse.json({ error: "invalid_username" }, { status: 400 });
  }

  try {
    const password = generateInitialPassword();
    const id = await createUser(username, password, "user");
    // 明文只在此响应中出现一次，不入库、不落日志
    return NextResponse.json({ id, username, password });
  } catch (error) {
    if ((error as { code?: string }).code === DUPLICATE_ENTRY) {
      return NextResponse.json({ error: "username_taken" }, { status: 409 });
    }
    console.error("[admin/users] create failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const userId = String(body.userId ?? "").trim();
  if (userId.length === 0) {
    return NextResponse.json({ error: "missing_user_id" }, { status: 400 });
  }

  try {
    const result = await adminResetPassword(userId);
    if (!result.ok) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }
    return NextResponse.json({ userId, password: result.password });
  } catch (error) {
    console.error("[admin/users] reset failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
