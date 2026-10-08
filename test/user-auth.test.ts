import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash } from "node:crypto";

vi.mock("@/lib/db", () => ({
  query: vi.fn(),
  execute: vi.fn(),
  queryWithLimit: vi.fn(),
  isMySQLAvailable: vi.fn(() => true),
  withTransaction: vi.fn((fn: (conn: unknown) => Promise<unknown>) => fn({})),
  txExecute: vi.fn(),
}));

const { cookieJar, lastCookieOpts } = vi.hoisted(() => ({
  cookieJar: new Map<string, string>(),
  lastCookieOpts: { value: {} as Record<string, unknown> },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined,
    set: (name: string, value: string, opts: Record<string, unknown>) => {
      cookieJar.set(name, value);
      lastCookieOpts.value = opts;
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

import { query, execute, queryWithLimit, withTransaction, txExecute } from "@/lib/db";
import {
  hashPassword,
  verifyPassword,
  generateInitialPassword,
  createSession,
  getCurrentUser,
  destroySession,
  ensureAdminUser,
  findUserByUsername,
  requireAdmin,
  listUsers,
  getUserById,
  setUserStatus,
  deleteUserCascade,
  SESSION_COOKIE,
  DUMMY_PASSWORD_HASH,
} from "@/lib/user-auth";
import {
  isLoginLocked,
  recordLoginFailure,
  clearLoginFailures,
  resetLoginRateLimitForTesting,
  MAX_ATTEMPTS,
} from "@/lib/login-rate-limit";

beforeEach(() => {
  cookieJar.clear();
  lastCookieOpts.value = {};
  vi.mocked(query).mockReset();
  vi.mocked(execute).mockReset();
  vi.mocked(queryWithLimit).mockReset();
  resetLoginRateLimitForTesting();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("hashPassword / verifyPassword — scrypt 往返", () => {
  it("往返成功，格式 v1:<salt>:<hash>", async () => {
    const hash = await hashPassword("s3cret");
    expect(hash.split(":")).toHaveLength(3);
    expect(hash.startsWith("v1:")).toBe(true);
    await expect(verifyPassword("s3cret", hash)).resolves.toBe(true);
  });

  it("相同密码两次哈希盐值不同", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toBe(b);
    await expect(verifyPassword("same", b)).resolves.toBe(true);
  });

  it("错误密码返回 false", async () => {
    const hash = await hashPassword("right");
    await expect(verifyPassword("wrong", hash)).resolves.toBe(false);
  });

  const corrupt: { desc: string; stored: string }[] = [
    { desc: "段数不足", stored: "v1:abc" },
    { desc: "版本号未知", stored: `v2:${"00".repeat(16)}:${"00".repeat(128)}` },
    { desc: "空 salt", stored: `v1::${"00".repeat(128)}` },
    { desc: "hash 长度不对", stored: `v1:${"00".repeat(16)}:${"00".repeat(4)}` },
  ];
  it.each(corrupt)("损坏格式拒绝：$desc", async ({ stored }) => {
    await expect(verifyPassword("anything", stored)).resolves.toBe(false);
  });

  it("DUMMY_PASSWORD_HASH 格式合法可走完 scrypt 不抛错", async () => {
    await expect(
      verifyPassword("whatever", DUMMY_PASSWORD_HASH)
    ).resolves.toBe(false);
  });
});

describe("generateInitialPassword — 可读随机密码", () => {
  const samples = Array.from({ length: 5 }, () => generateInitialPassword());
  it.each(samples.map((p, i) => ({ i, p })))(
    "样例 #$i 形如 xxxx-xxxx-xxxx 且无易混淆字符",
    ({ p }) => {
      expect(p).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/);
      expect(p).not.toMatch(/[01il]/);
    }
  );
});

describe("createSession / getCurrentUser / destroySession — 会话生命周期", () => {
  it("createSession：入库的是 token 的 SHA-256 而非明文", async () => {
    await createSession("user-1");
    const [sql, params] = vi
      .mocked(execute)
      .mock.calls.find((c) => String(c[0]).includes("INSERT INTO sessions"))!;
    expect(sql).toContain("INSERT INTO sessions");
    const tokenHash = String(params![0]);
    expect(tokenHash).toHaveLength(64);
    expect(cookieJar.get(SESSION_COOKIE)).toBeDefined();
    expect(
      createHash("sha256").update(cookieJar.get(SESSION_COOKIE)!).digest("hex")
    ).toBe(tokenHash);
  });

  it("createSession：cookie 属性 httpOnly/lax/path=/maxAge=7d", async () => {
    await createSession("user-1");
    expect(lastCookieOpts.value).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });
  });

  it("getCurrentUser：无 cookie → null", async () => {
    await expect(getCurrentUser()).resolves.toBe(null);
    expect(query).not.toHaveBeenCalled();
  });

  it("getCurrentUser：cookie 有效 → 返回会话用户（SQL 必须过滤禁用号）", async () => {
    await createSession("user-1");
    vi.mocked(query).mockResolvedValueOnce([
      { id: "user-1", username: "alice", role: "user", status: "active" },
    ]);
    const user = await getCurrentUser();
    expect(user).toEqual({
      id: "user-1",
      username: "alice",
      role: "user",
      status: "active",
    });
    const [sql, params] = vi.mocked(query).mock.calls[0];
    expect(String(sql)).toContain("u.status = 'active'");
    expect(String(params![0])).toHaveLength(64);
  });

  it("getCurrentUser：禁用号即使会话行残留 → 查不到 → null（防御纵深）", async () => {
    cookieJar.set(SESSION_COOKIE, "tok");
    vi.mocked(query).mockResolvedValueOnce([]);
    await expect(getCurrentUser()).resolves.toBe(null);
  });

  it("getCurrentUser：查库无行（过期/撤销）→ null", async () => {
    cookieJar.set(SESSION_COOKIE, "tok");
    vi.mocked(query).mockResolvedValueOnce([]);
    await expect(getCurrentUser()).resolves.toBe(null);
  });

  it("destroySession：清 cookie + 删库行", async () => {
    cookieJar.set(SESSION_COOKIE, "tok");
    await expect(destroySession()).resolves.toBe(true);
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
    expect(
      vi.mocked(execute).mock.calls.some((c) =>
        String(c[0]).includes("DELETE FROM sessions")
      )
    ).toBe(true);
  });

  it("destroySession：无 cookie 幂等返回 true", async () => {
    await expect(destroySession()).resolves.toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it("destroySession：DB 删除失败 → false（cookie 已清）", async () => {
    cookieJar.set(SESSION_COOKIE, "tok");
    vi.mocked(execute).mockRejectedValueOnce(new Error("db down"));
    await expect(destroySession()).resolves.toBe(false);
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
  });
});

describe("requireAdmin", () => {
  it("未登录 → null", async () => {
    await expect(requireAdmin()).resolves.toBe(null);
  });
  it("role=user → null；role=admin → 用户", async () => {
    cookieJar.set(SESSION_COOKIE, "tok");
    vi.mocked(query).mockResolvedValueOnce([
      { id: "u2", username: "bob", role: "user", status: "active" },
    ]);
    await expect(requireAdmin()).resolves.toBe(null);
    vi.mocked(query).mockResolvedValueOnce([
      { id: "u1", username: "alice", role: "admin", status: "active" },
    ]);
    await expect(requireAdmin()).resolves.toEqual({
      id: "u1",
      username: "alice",
      role: "admin",
      status: "active",
    });
  });
});

describe("ensureAdminUser — 环境变量幂等引导", () => {
  const cases: {
    desc: string;
    env: { ADMIN_USERNAME?: string; ADMIN_PASSWORD?: string };
    existing: unknown[] | null;
    wantInsert: boolean;
    wantUpdateRole: boolean;
  }[] = [
    {
      desc: "env 缺失 → 静默跳过",
      env: {},
      existing: null,
      wantInsert: false,
      wantUpdateRole: false,
    },
    {
      desc: "不存在 → 插入 admin",
      env: { ADMIN_USERNAME: "root", ADMIN_PASSWORD: "pw12345678" },
      existing: [],
      wantInsert: true,
      wantUpdateRole: false,
    },
    {
      desc: "已存在且是 admin → 不动",
      env: { ADMIN_USERNAME: "root", ADMIN_PASSWORD: "pw12345678" },
      existing: [{ id: "u1", username: "root", role: "admin", password_hash: "v1:a:b" }],
      wantInsert: false,
      wantUpdateRole: false,
    },
    {
      desc: "已存在但 role=user → 升级为 admin",
      env: { ADMIN_USERNAME: "root", ADMIN_PASSWORD: "pw12345678" },
      existing: [{ id: "u1", username: "root", role: "user", password_hash: "v1:a:b" }],
      wantInsert: false,
      wantUpdateRole: true,
    },
  ];

  it.each(cases)("$desc", async ({ env, existing, wantInsert, wantUpdateRole }) => {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v ?? "");
    if (existing !== null) vi.mocked(query).mockResolvedValueOnce(existing as never[]);
    await ensureAdminUser();
    const didInsert = vi
      .mocked(execute)
      .mock.calls.some((c) => String(c[0]).includes("INSERT INTO users"));
    const didUpdate = vi
      .mocked(execute)
      .mock.calls.some((c) => /UPDATE users SET role/.test(String(c[0])));
    expect(didInsert).toBe(wantInsert);
    expect(didUpdate).toBe(wantUpdateRole);
  });
});

describe("findUserByUsername", () => {
  it("命中 → 含 passwordHash 与 status；未命中 → null", async () => {
    vi.mocked(query).mockResolvedValueOnce([
      { id: "u1", username: "alice", role: "user", password_hash: "v1:x:y", status: "disabled" },
    ]);
    const u = await findUserByUsername("alice");
    expect(u).toMatchObject({
      id: "u1",
      username: "alice",
      passwordHash: "v1:x:y",
      status: "disabled",
    });
    vi.mocked(query).mockResolvedValueOnce([]);
    await expect(findUserByUsername("ghost")).resolves.toBe(null);
  });
});

describe("getUserById / setUserStatus / deleteUserCascade — 账号生命周期", () => {
  it("getUserById：命中 → 含 role/status；未命中 → null", async () => {
    vi.mocked(query).mockResolvedValueOnce([
      { id: "u1", username: "alice", role: "admin", status: "active" },
    ]);
    await expect(getUserById("u1")).resolves.toEqual({
      id: "u1",
      username: "alice",
      role: "admin",
      status: "active",
    });
    vi.mocked(query).mockResolvedValueOnce([]);
    await expect(getUserById("ghost")).resolves.toBe(null);
  });

  it("setUserStatus disabled：UPDATE + 立即清该用户全部会话", async () => {
    vi.mocked(execute).mockResolvedValue({ affectedRows: 1 } as never);
    const r = await setUserStatus("u2", "disabled");
    expect(r).toEqual({ ok: true, status: "disabled" });
    const calls = vi.mocked(execute).mock.calls;
    expect(String(calls[0][0])).toContain("UPDATE users SET status");
    expect(calls[0][1]).toEqual(expect.arrayContaining(["disabled", "u2"]));
    expect(String(calls[1][0])).toContain("DELETE FROM sessions WHERE user_id");
  });

  it("setUserStatus active：只 UPDATE，不清会话", async () => {
    vi.mocked(execute).mockResolvedValue({ affectedRows: 1 } as never);
    const r = await setUserStatus("u2", "active");
    expect(r).toEqual({ ok: true, status: "active" });
    expect(vi.mocked(execute)).toHaveBeenCalledTimes(1);
  });

  it("setUserStatus 目标不存在（affectedRows=0）→ user_not_found", async () => {
    vi.mocked(execute).mockResolvedValue({ affectedRows: 0 } as never);
    await expect(setUserStatus("ghost", "disabled")).resolves.toEqual({
      ok: false,
      reason: "user_not_found",
    });
  });

  it("deleteUserCascade：事务内逐表清理，messages 先于 conversations，绝不碰 usage_events", async () => {
    await deleteUserCascade("u9");
    expect(withTransaction).toHaveBeenCalledTimes(1);
    const sqls = vi.mocked(txExecute).mock.calls.map((c) => String(c[1]));
    const joined = sqls.join("\n");
    expect(joined).toContain("DELETE m FROM messages");
    expect(joined).toContain("conversations");
    expect(joined).toContain("message_reactions");
    expect(joined).toContain("saved_messages");
    expect(joined).toContain("labor_reports");
    expect(joined).toContain("subscriptions");
    expect(joined).toContain("DELETE FROM sessions");
    expect(joined).toMatch(/DELETE FROM users WHERE id/);
    expect(joined).not.toContain("usage_events");
    expect(sqls.findIndex((s) => s.includes("DELETE m FROM messages"))).toBeLessThan(
      sqls.findIndex((s) => /DELETE FROM conversations/.test(s))
    );
  });
});

describe("login-rate-limit — 5 次锁定", () => {
  it("未达阈值不锁、达阈值锁定、成功清零（大小写不敏感）", () => {
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) recordLoginFailure("Alice");
    expect(isLoginLocked("alice")).toBe(false);
    recordLoginFailure("ALICE");
    expect(isLoginLocked("alice")).toBe(true);
    clearLoginFailures("alice");
    expect(isLoginLocked("alice")).toBe(false);
  });
});

describe("listUsers — mysql2 LIMIT ? 回归 + usage 联查", () => {
  const rows = [
    { id: "u2", username: "bob", role: "user", status: "disabled", remaining_usage: 3, total_usage: 8 },
    { id: "u1", username: "alice", role: "admin", status: "active", remaining_usage: 0, total_usage: 0 },
  ];

  it("必须走 queryWithLimit 数值内联，绝不向 prepare 协议传 LIMIT ?", async () => {
    vi.mocked(queryWithLimit).mockResolvedValue(rows);
    const users = await listUsers();
    expect(query).not.toHaveBeenCalled();
    expect(queryWithLimit).toHaveBeenCalledTimes(1);
    const [sql, limit, offset] = vi.mocked(queryWithLimit).mock.calls[0];
    expect(sql).not.toContain("LIMIT ?");
    expect(sql).toContain("LEFT JOIN subscriptions");
    expect(sql).toContain("u.status");
    expect(limit).toBe(200);
    expect(offset).toBe(0);
    expect(users).toEqual([
      { id: "u2", username: "bob", role: "user", status: "disabled", remainingUsage: 3, totalUsage: 8 },
      { id: "u1", username: "alice", role: "admin", status: "active", remainingUsage: 0, totalUsage: 0 },
    ]);
  });
});
