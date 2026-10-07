import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/api-auth", () => ({ getAuthContext: vi.fn() }));
vi.mock("@/lib/subscriptions", () => ({
  consumeAdminActivationCode: vi.fn(),
  getSubscriptionByUid: vi.fn(),
}));
vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, resetAt: 0 })),
  checkDeviceIdSpoofing: vi.fn(async () => ({ allowed: true })),
  RATE_LIMITS: { activate: { max: 5, windowMs: 60_000 } },
  extractClientInfo: vi.fn(() => ({ ip: "10.0.0.1" })),
}));
vi.mock("@/lib/activation-security", () => ({
  checkActivationBlockedAsync: vi.fn(async () => ({ blocked: false })),
  recordFailedAttemptAsync: vi.fn(async () => {}),
  resetFailedAttemptsAsync: vi.fn(async () => {}),
  getRemainingAttempts: vi.fn(() => 4),
}));
vi.mock("@/lib/activation-codes", () => ({ isValidActivationCode: vi.fn(() => true) }));
vi.mock("@/lib/usage-events", () => ({ recordEvent: vi.fn() }));

import { POST } from "@/app/api/subscription/admin/activate/route";
import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/api-auth";
import {
  consumeAdminActivationCode,
  getSubscriptionByUid,
} from "@/lib/subscriptions";
import { recordEvent } from "@/lib/usage-events";

function makeReq(code = "AAAA-BBBB-CCCC-DD") {
  return new NextRequest("http://localhost/api/subscription/admin/activate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-device-id": "dev-1" },
    body: JSON.stringify({ code }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
    uid: "u1",
    deviceId: "dev-1",
    isLoggedIn: true,
  });
  (getSubscriptionByUid as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  (consumeAdminActivationCode as ReturnType<typeof vi.fn>).mockResolvedValue({
    success: true,
    remainingCodes: 10,
    expiresAt: 123,
  });
});

describe("POST /api/subscription/admin/activate — activate_success 埋点", () => {
  it("兑换成功 → recordEvent(activate_success, uid)", async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(recordEvent).toHaveBeenCalledTimes(1);
    const arg = (recordEvent as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg).toMatchObject({ eventType: "activate_success", uid: "u1", deviceId: "dev-1" });
  });

  it("同码重复兑换短路返回 → 不重复计数", async () => {
    (getSubscriptionByUid as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "active",
      source: "admin",
      activationCode: "AAAA-BBBB-CCCC-DD",
      remainingUsage: 10,
      expiresAt: 123,
    });
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(consumeAdminActivationCode).not.toHaveBeenCalled();
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it("兑换失败 → 400 且不记录", async () => {
    (consumeAdminActivationCode as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: "expired_code",
    });
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it("未登录 → 401 且不记录", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      uid: null,
      deviceId: "dev-1",
      isLoggedIn: false,
    });
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(recordEvent).not.toHaveBeenCalled();
  });
});
