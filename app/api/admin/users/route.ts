import { NextResponse } from "next/server";
import {
  getCurrentUser,
  createUser,
  generateInitialPassword,
  adminResetPassword,
  listUsers,
  userExists,
  getUserById,
  setUserStatus,
  deleteUserCascade,
  type UserStatus,
} from "@/lib/user-auth";
import { grantUsageByUid } from "@/lib/subscriptions";

// 与 users.username VARCHAR(32) 对齐
const MAX_USERNAME_LENGTH = 32;
const DUPLICATE_ENTRY = "ER_DUP_ENTRY";

// 软删除可用状态（与 users.status 列取值一致）
const VALID_STATUSES: UserStatus[] = ["active", "disabled"];

// 单次发放/追加的报告次数边界
const MIN_GRANT_TIMES = 1;
const MAX_GRANT_TIMES = 999;

/** times/addTimes 参数解析：未传返回 null；非法返回 ok=false（只接受 JSON number） */
function parseGrantTimes(raw: unknown): { ok: boolean; times: number | null } {
  if (raw === undefined || raw === null) return { ok: true, times: null };
  if (
    typeof raw !== "number" ||
    !Number.isInteger(raw) ||
    raw < MIN_GRANT_TIMES ||
    raw > MAX_GRANT_TIMES
  ) {
    return { ok: false, times: null };
  }
  return { ok: true, times: raw };
}

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
  const parsed = parseGrantTimes(body.times);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: "invalid_times", message: `初始次数须为 ${MIN_GRANT_TIMES}-${MAX_GRANT_TIMES} 的整数` },
      { status: 400 }
    );
  }

  try {
    const password = generateInitialPassword();
    const id = await createUser(username, password, "user");
    let remaining = 0;
    if (parsed.times !== null) {
      try {
        remaining = await grantUsageByUid(id, parsed.times);
      } catch (error) {
        // 账号已建成功但发放失败：显式报错，管理员可对同账号重试追加（幂等于累加语义）
        console.error("[admin/users] grant failed after create:", error);
        return NextResponse.json(
          { error: "grant_failed", message: "账号已创建成功，但次数发放失败，请在列表中对该账号追加次数" },
          { status: 500 }
        );
      }
    }
    // 明文只在此响应中出现一次，不入库、不落日志
    return NextResponse.json({ id, username, password, remaining });
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

  // status 传入 = 禁用/启用（软删除）分支；与 addTimes/重置密码分支互斥，优先级最高
  if (body.status !== undefined) {
    const status = body.status as UserStatus;
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: "invalid_status", message: "status 仅支持 active/disabled" },
        { status: 400 }
      );
    }
    try {
      const target = await getUserById(userId);
      if (!target) {
        return NextResponse.json({ error: "user_not_found" }, { status: 404 });
      }
      if (target.role === "admin") {
        return NextResponse.json(
          { error: "admin_protected", message: "管理员账号不可禁用或删除" },
          { status: 403 }
        );
      }
      const result = await setUserStatus(userId, status);
      if (!result.ok) {
        return NextResponse.json({ error: "user_not_found" }, { status: 404 });
      }
      return NextResponse.json({ userId, status });
    } catch (error) {
      console.error("[admin/users] setStatus failed:", error);
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }
  }

  const parsed = parseGrantTimes(body.addTimes);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: "invalid_times", message: `追加次数须为 ${MIN_GRANT_TIMES}-${MAX_GRANT_TIMES} 的整数` },
      { status: 400 }
    );
  }

  // addTimes 传入 = 追加次数；未传 = 原重置密码语义
  if (parsed.times !== null) {
    try {
      // 先验账号存在：grant 是 upsert，直接发放会给不存在的 uid 留孤儿订阅行
      if (!(await userExists(userId))) {
        return NextResponse.json({ error: "user_not_found" }, { status: 404 });
      }
      const remaining = await grantUsageByUid(userId, parsed.times);
      return NextResponse.json({ userId, remaining });
    } catch (error) {
      console.error("[admin/users] grant failed:", error);
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }
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

/**
 * 硬删除账号：连带清除内容数据（对话/报告/收藏/额度/会话），埋点保留。
 * 事务失败返 500——绝不允许半删状态；管理员可安全重试。
 */
export async function DELETE(request: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const userId = String(body.userId ?? "").trim();
  if (userId.length === 0) {
    return NextResponse.json({ error: "missing_user_id" }, { status: 400 });
  }

  try {
    const target = await getUserById(userId);
    if (!target) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }
    if (target.role === "admin") {
      return NextResponse.json(
        { error: "admin_protected", message: "管理员账号不可禁用或删除" },
        { status: 403 }
      );
    }
    await deleteUserCascade(userId);
    return NextResponse.json({ deleted: userId });
  } catch (error) {
    console.error("[admin/users] delete failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
