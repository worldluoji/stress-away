import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/user-auth", () => ({
  getCurrentUser: vi.fn(),
  listUsers: vi.fn(),
  createUser: vi.fn(),
  generateInitialPassword: vi.fn(() => "jk mn qw ef".replace(/ /g, "") + "-2345-6789-abcd"),
  adminResetPassword: vi.fn(),
}));

import { GET, POST, PATCH } from "@/app/api/admin/users/route";
import {
  getCurrentUser,
  listUsers,
  createUser,
  generateInitialPassword,
  adminResetPassword,
} from "@/lib/user-auth";

const ADMIN = { id: "a1", username: "root", role: "admin" as const };
const NORMAL_USER = { id: "u2", username: "bob", role: "user" as const };
const GENERATED = "abcd-efgh-jkmn-pqrs";

function jsonReq(body: unknown, method = "POST") {
  return new Request("http://localhost/api/admin/users", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue(ADMIN);
  vi.mocked(generateInitialPassword).mockReturnValue(GENERATED);
  vi.mocked(createUser).mockResolvedValue("u9");
  vi.mocked(listUsers).mockResolvedValue([]);
});

describe("POST /api/admin/users — 建号", () => {
  const table: {
    desc: string;
    login?: { id: string; username: string; role: "admin" | "user" } | null;
    body: unknown;
    setup?: () => void;
    status: number;
    error?: string;
  }[] = [
    { desc: "未登录 → 401", login: null, body: { username: "alice" }, status: 401, error: "unauthorized" },
    { desc: "非 admin 登录 → 403", login: NORMAL_USER, body: { username: "alice" }, status: 403, error: "not_admin" },
    { desc: "缺 username → 400", body: {}, status: 400, error: "invalid_username" },
    { desc: "空白 username → 400", body: { username: "   " }, status: 400, error: "invalid_username" },
    { desc: "超 32 字符 → 400", body: { username: "u".repeat(33) }, status: 400, error: "invalid_username" },
    {
      desc: "重名 → 409",
      body: { username: "alice" },
      setup: () =>
        vi.mocked(createUser).mockRejectedValue(Object.assign(new Error("dup"), { code: "ER_DUP_ENTRY" })),
      status: 409,
      error: "username_taken",
    },
    {
      desc: "DB 异常 → 500",
      body: { username: "alice" },
      setup: () => vi.mocked(createUser).mockRejectedValue(new Error("db down")),
      status: 500,
      error: "server_error",
    },
  ];

  it.each(table)("$desc", async ({ login, body, setup, status, error }) => {
    if (login !== undefined) vi.mocked(getCurrentUser).mockResolvedValue(login);
    setup?.();
    const res = await POST(jsonReq(body));
    expect(res.status).toBe(status);
    expect((await res.json()).error).toBe(error);
  });

  it("成功 → 一次性明文密码 + role 固定 user", async () => {
    const res = await POST(jsonReq({ username: " alice " }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "u9", username: "alice", password: GENERATED });
    expect(createUser).toHaveBeenCalledWith("alice", GENERATED, "user");
  });

  it("明文密码只在响应出现一次（入库的是哈希）", async () => {
    await POST(jsonReq({ username: "alice" }));
    const passedToCreate = vi.mocked(createUser).mock.calls[0];
    expect(passedToCreate[1]).toBe(GENERATED); // 交给 createUser 哈希后入库
  });
});

describe("PATCH /api/admin/users — 重置密码", () => {
  const table: {
    desc: string;
    login?: { id: string; username: string; role: "admin" | "user" } | null;
    body: unknown;
    setup?: () => void;
    status: number;
    error?: string;
  }[] = [
    { desc: "未登录 → 401", login: null, body: { userId: "u9" }, status: 401, error: "unauthorized" },
    { desc: "非 admin → 403", login: NORMAL_USER, body: { userId: "u9" }, status: 403, error: "not_admin" },
    { desc: "缺 userId → 400", body: {}, status: 400, error: "missing_user_id" },
    {
      desc: "用户不存在 → 404",
      body: { userId: "u404" },
      setup: () => vi.mocked(adminResetPassword).mockResolvedValue({ ok: false, reason: "user_not_found" }),
      status: 404,
      error: "user_not_found",
    },
  ];

  it.each(table)("$desc", async ({ login, body, setup, status, error }) => {
    if (login !== undefined) vi.mocked(getCurrentUser).mockResolvedValue(login);
    setup?.();
    const res = await PATCH(jsonReq(body, "PATCH"));
    expect(res.status).toBe(status);
    expect((await res.json()).error).toBe(error);
  });

  it("成功 → 新一次性密码，且委托 adminResetPassword（其内部清会话）", async () => {
    vi.mocked(adminResetPassword).mockResolvedValue({ ok: true, password: GENERATED });
    const res = await PATCH(jsonReq({ userId: "u9" }, "PATCH"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: "u9", password: GENERATED });
    expect(adminResetPassword).toHaveBeenCalledWith("u9");
  });

  it("内部异常 → 500", async () => {
    vi.mocked(adminResetPassword).mockRejectedValue(new Error("db down"));
    const res = await PATCH(jsonReq({ userId: "u9" }, "PATCH"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("server_error");
  });
});

describe("GET /api/admin/users — 账号列表", () => {
  it("未登录 → 401", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("成功 → users 数组透传", async () => {
    const rows = [{ id: "u9", username: "alice", role: "user" as const }];
    vi.mocked(listUsers).mockResolvedValue(rows);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ users: rows });
  });
});
