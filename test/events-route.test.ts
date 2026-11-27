import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/api-auth", () => ({ getAuthContext: vi.fn() }));
vi.mock("@/lib/usage-events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/usage-events")>()),
  recordEvent: vi.fn(),
}));

import { POST } from "@/app/api/events/route";
import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/api-auth";
import { recordEvent } from "@/lib/usage-events";

// mock 只替换 recordEvent，CLIENT_EVENT_TYPES 走真实模块（route 的白名单校验以单一来源为准）
let ipSeq = 0;
function makeReq(body: unknown, opts: { deviceId?: string | null } = {}) {
  ipSeq += 1;
  const headers = new Headers({
    "Content-Type": "application/json",
    "x-forwarded-for": `10.1.0.${ipSeq}`,
    "x-user-id": "u1",
  });
  const deviceId = opts.deviceId === undefined ? `dev-${ipSeq}` : opts.deviceId;
  if (deviceId) headers.set("x-device-id", deviceId);
  return new NextRequest("http://localhost/api/events", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  (getAuthContext as ReturnType<typeof vi.fn>).mockImplementation((r: Request) => {
    const deviceId = r.headers.get("x-device-id");
    return { uid: r.headers.get("x-user-id"), deviceId, isLoggedIn: !!r.headers.get("x-user-id") };
  });
  (recordEvent as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

describe("POST /api/events（表格驱动）", () => {
  const cases: {
    desc: string;
    body: unknown;
    deviceId?: string | null;
    wantStatus: number;
    wantRecorded: boolean;
  }[] = [
    { desc: "合法 paywall_confirm → 204 且落库", body: { eventType: "paywall_confirm" }, wantStatus: 204, wantRecorded: true },
    { desc: "合法 calculator 带 meta → 204", body: { eventType: "calculator", meta: { city: "北京" } }, wantStatus: 204, wantRecorded: true },
    { desc: "合法 report_download → 204", body: { eventType: "report_download" }, wantStatus: 204, wantRecorded: true },
    { desc: "合法 login_gate → 204", body: { eventType: "login_gate" }, wantStatus: 204, wantRecorded: true },
    { desc: "伪造 report_generate → 400 不落库", body: { eventType: "report_generate" }, wantStatus: 400, wantRecorded: false },
    { desc: "伪造 chat → 400（非客户端白名单）", body: { eventType: "chat" }, wantStatus: 400, wantRecorded: false },
    { desc: "伪造 paywall_block → 400（服务端埋点，客户端不可报）", body: { eventType: "paywall_block" }, wantStatus: 400, wantRecorded: false },
    { desc: "未在白名单的 activate_success → 400", body: { eventType: "activate_success" }, wantStatus: 400, wantRecorded: false },
    { desc: "未知 eventType → 400", body: { eventType: "whatever" }, wantStatus: 400, wantRecorded: false },
    { desc: "缺 eventType → 400", body: {}, wantStatus: 400, wantRecorded: false },
    { desc: "缺 deviceId → 400 不落库", body: { eventType: "paywall_view" }, deviceId: null, wantStatus: 400, wantRecorded: false },
  ];

  cases.forEach((c) => {
    it(c.desc, async () => {
      const res = await POST(makeReq(c.body, { deviceId: c.deviceId }));
      expect(res.status).toBe(c.wantStatus);
      if (c.wantRecorded) {
        expect(recordEvent).toHaveBeenCalledTimes(1);
        const arg = (recordEvent as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(arg.eventType).toBe((c.body as { eventType: string }).eventType);
        expect(arg.uid).toBe("u1");
      } else {
        expect(recordEvent).not.toHaveBeenCalled();
      }
    });
  });
});
