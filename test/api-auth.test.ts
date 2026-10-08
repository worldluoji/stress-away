import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/user-auth", () => ({ getCurrentUser: vi.fn() }));

import { getAuthContext } from "@/lib/api-auth";
import { getCurrentUser } from "@/lib/user-auth";

function req(deviceId?: string) {
  const headers = new Headers();
  if (deviceId) headers.set("x-device-id", deviceId);
  return new Request("http://localhost/api/any", { headers });
}

beforeEach(() => {
  vi.mocked(getCurrentUser).mockReset();
});

const cases: {
  desc: string;
  user: { id: string; username: string; role: "admin" | "user"; status: "active" | "disabled" } | null;
  deviceId?: string;
  want: { uid: string | null; deviceId: string | null; role: string | null; isLoggedIn: boolean };
}[] = [
  {
    desc: "无会话 → 全空",
    user: null,
    deviceId: "d1",
    want: { uid: null, deviceId: "d1", role: null, isLoggedIn: false },
  },
  {
    desc: "有效会话 → uid/role 来自用户表",
    user: { id: "u-42", username: "alice", role: "user", status: "active" },
    deviceId: "d1",
    want: { uid: "u-42", deviceId: "d1", role: "user", isLoggedIn: true },
  },
  {
    desc: "admin 会话",
    user: { id: "adm", username: "root", role: "admin", status: "active" },
    want: { uid: "adm", deviceId: null, role: "admin", isLoggedIn: true },
  },
  {
    desc: "x-user-id 头彻底失效：有头无会话仍为未登录",
    user: null,
    deviceId: undefined,
    want: { uid: null, deviceId: null, role: null, isLoggedIn: false },
  },
];

describe("getAuthContext — 会话验签（不再信任 x-user-id）", () => {
  it.each(cases)("$desc", async ({ user, deviceId, want }) => {
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const ctx = await getAuthContext(req(deviceId));
    expect(ctx).toEqual(want);
  });

  it("伪造的 x-user-id 头不会被读取", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const forged = new Request("http://localhost/api/any", {
      headers: { "x-user-id": "victim-uid" },
    });
    const ctx = await getAuthContext(forged);
    expect(ctx.uid).toBeNull();
  });
});
