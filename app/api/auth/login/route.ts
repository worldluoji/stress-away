import { NextResponse } from "next/server";
import {
  createSession,
  DUMMY_PASSWORD_HASH,
  ensureAdminUser,
  findUserByUsername,
  verifyPassword,
} from "@/lib/user-auth";
import {
  clearLoginFailures,
  isLoginLocked,
  LOCK_MINUTES,
  recordLoginFailure,
} from "@/lib/login-rate-limit";

/**
 * 用户名+密码登录。账号由管理员在后台发放，无自助注册。
 * 成功建立 httpOnly 会话 cookie；uid 即 users.id。
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const username =
    typeof body?.username === "string" ? body.username.trim() : "";
  const password =
    typeof body?.password === "string" ? body.password : "";
  if (!username || !password) {
    return NextResponse.json(
      { error: "missing_credentials", message: "请输入用户名和密码" },
      { status: 400 }
    );
  }

  if (isLoginLocked(username)) {
    return NextResponse.json(
      {
        error: "too_many_attempts",
        message: `登录失败次数过多，请 ${LOCK_MINUTES} 分钟后再试`,
      },
      { status: 429 }
    );
  }

  try {
    await ensureAdminUser();
    const user = await findUserByUsername(username);
    // 用户不存在与密码错误返回同一响应，避免用户名枚举；
    // 不存在的用户也拿假哈希走完 scrypt，两条路径计算耗时一致
    const valid = await verifyPassword(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH
    );
    if (!user || !valid) {
      recordLoginFailure(username);
      return NextResponse.json(
        { error: "invalid_credentials", message: "用户名或密码错误" },
        { status: 401 }
      );
    }
    clearLoginFailures(username);
    // 禁用检查必须在密码验证之后：提前返回会让「禁用号」成为用户名枚举 oracle
    if (user.status === "disabled") {
      return NextResponse.json(
        { error: "account_disabled", message: "账号已被禁用，请联系管理员" },
        { status: 403 }
      );
    }
    await createSession(user.id);
    return NextResponse.json({ ok: true, username: user.username, role: user.role });
  } catch (error) {
    console.error("[auth/login] failed:", error);
    return NextResponse.json(
      { error: "server_error", message: "登录失败，请稍后再试" },
      { status: 500 }
    );
  }
}
