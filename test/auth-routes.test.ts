import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/user-auth", () => ({
  ensureAdminUser: vi.fn(),
  findUserByUsername: vi.fn(),
  verifyPassword: vi.fn(),
  createSession: vi.fn(),
  getCurrentUser: vi.fn(),
  destroySession: vi.fn(),
  DUMMY_PASSWORD_HASH: "v1:dummy:hash",
}));
vi.mock("@/lib/login-rate-limit", () => ({
  isLoginLocked: vi.fn(() => false),
  recordLoginFailure: vi.fn(),
  clearLoginFailures: vi.fn(),
  LOCK_MINUTES: 15,
}));

import { POST as login } from "@/app/api/auth/login/route";
import { GET as me } from "@/app/api/auth/me/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import {
  findUserByUsername,
  verifyPassword,
  createSession,
  getCurrentUser,
  destroySession,
  ensureAdminUser,
} from "@/lib/user-auth";
import {
  isLoginLocked,
  recordLoginFailure,
  clearLoginFailures,
} from "@/lib/login-rate-limit";

function jsonReq(body: unknown) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.mocked(isLoginLocked).mockReturnValue(false);
  vi.mocked(findUserByUsername).mockReset();
  vi.mocked(verifyPassword).mockReset().mockResolvedValue(true);
  vi.mocked(createSession).mockResolvedValue(undefined);
  vi.mocked(getCurrentUser).mockReset();
  vi.mocked(destroySession).mockReset();
  vi.mocked(ensureAdminUser).mockResolvedValue(undefined);
});

describe("POST /api/auth/login", () => {
  const table: {
    desc: string;
    body: unknown;
    setup?: () => void;
    status: number;
    error?: string;
  }[] = [
    { desc: "缺用户名", body: { password: "p" }, status: 400, error: "missing_credentials" },
    { desc: "缺密码", body: { username: "alice" }, status: 400, error: "missing_credentials" },
    { desc: "空字符串凭证", body: { username: "  ", password: "" }, status: 400, error: "missing_credentials" },
    { desc: "非法 JSON body", body: "__raw__", status: 400, error: "missing_credentials" },
    { desc: "用户不存在 → 401 invalid_credentials", body: { username: "ghost", password: "p" },
      setup: () => vi.mocked(findUserByUsername).mockResolvedValue(null),
      status: 401, error: "invalid_credentials" },
    { desc: "密码错误 → 401", body: { username: "alice", password: "bad" },
      setup: () => {
        vi.mocked(findUserByUsername).mockResolvedValue({ id: "u1", username: "alice", role: "user", status: "active", passwordHash: "v1:s:h" });
        vi.mocked(verifyPassword).mockResolvedValue(false);
      },
      status: 401, error: "invalid_credentials" },
    { desc: "锁定中 → 429", body: { username: "alice", password: "p" },
      setup: () => vi.mocked(isLoginLocked).mockReturnValue(true),
      status: 429, error: "too_many_attempts" },
    { desc: "禁用号 + 密码正确 → 403 account_disabled", body: { username: "alice", password: "p" },
      setup: () => vi.mocked(findUserByUsername).mockResolvedValue(
        { id: "u1", username: "alice", role: "user", status: "disabled", passwordHash: "v1:s:h" }
      ),
      status: 403, error: "account_disabled" },
  ];

  it.each(table)("$desc", async ({ body, setup, status, error }) => {
    setup?.();
    const req =
      body === "__raw__"
        ? new Request("http://localhost/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{broken",
          })
        : jsonReq(body);
    const res = await login(req as never);
    expect(res.status).toBe(status);
    expect((await res.json()).error).toBe(error);
  });

  it("用户不存在也走一次假哈希（防时序枚举）", async () => {
    vi.mocked(findUserByUsername).mockResolvedValue(null);
    await login(jsonReq({ username: "ghost", password: "p" }) as never);
    expect(verifyPassword).toHaveBeenCalledWith("p", "v1:dummy:hash");
  });

  it("失败计数+成功清零", async () => {
    vi.mocked(findUserByUsername).mockResolvedValue(null);
    await login(jsonReq({ username: "ghost", password: "p" }) as never);
    expect(recordLoginFailure).toHaveBeenCalledWith("ghost");

    vi.mocked(findUserByUsername).mockResolvedValue({ id: "u1", username: "alice", role: "user", status: "active", passwordHash: "v1:s:h" });
    const res = await login(jsonReq({ username: " alice ", password: "p" }) as never);
    expect(res.status).toBe(200);
    expect(clearLoginFailures).toHaveBeenCalledWith("alice");
    expect(createSession).toHaveBeenCalledWith("u1");
  });

  it("禁用检查置于验密之后：密码错仍 401 invalid_credentials；密码对才 403 且不建会话", async () => {
    vi.mocked(findUserByUsername).mockResolvedValue(
      { id: "u1", username: "alice", role: "user", status: "disabled", passwordHash: "v1:s:h" }
    );
    vi.mocked(verifyPassword).mockResolvedValueOnce(false);
    const wrong = await login(jsonReq({ username: "alice", password: "bad" }) as never);
    expect(wrong.status).toBe(401);
    expect((await wrong.json()).error).toBe("invalid_credentials");

    const res = await login(jsonReq({ username: "alice", password: "p" }) as never);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("account_disabled");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("成功 → Set-Cookie + {ok,username,role}", async () => {
    vi.mocked(findUserByUsername).mockResolvedValue({ id: "u1", username: "alice", role: "admin", status: "active", passwordHash: "v1:s:h" });
    const res = await login(jsonReq({ username: "alice", password: "p" }) as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ ok: true, username: "alice", role: "admin" });
  });

  it("ensureAdminUser 在建会话前执行", async () => {
    await login(jsonReq({ username: "alice", password: "p" }) as never);
    expect(ensureAdminUser).toHaveBeenCalled();
  });

  it("DB 异常 → 500", async () => {
    vi.mocked(findUserByUsername).mockRejectedValue(new Error("db down"));
    const res = await login(jsonReq({ username: "alice", password: "p" }) as never);
    expect(res.status).toBe(500);
  });
});

describe("GET /api/auth/me", () => {
  it("未登录 → 401", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await me();
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("unauthorized");
  });

  it("已登录 → {uid, username, role}", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", username: "alice", role: "user", status: "active" });
    const res = await me();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ uid: "u1", username: "alice", role: "user" });
  });
});

describe("POST /api/auth/logout", () => {
  it("正常登出 → sessionPurged:true", async () => {
    vi.mocked(destroySession).mockResolvedValue(true);
    const res = await logout();
    expect(await res.json()).toEqual({ ok: true, sessionPurged: true });
  });

  it("DB 删除失败 → sessionPurged:false 显式告知", async () => {
    vi.mocked(destroySession).mockResolvedValue(false);
    const res = await logout();
    expect(await res.json()).toEqual({ ok: true, sessionPurged: false });
  });
});
