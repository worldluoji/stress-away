import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  query: vi.fn(),
  execute: vi.fn(),
  withTransaction: vi.fn(),
  txQuery: vi.fn(),
  txExecute: vi.fn(),
  isMySQLAvailable: vi.fn(() => true),
  queryWithLimit: vi.fn(),
}));

import {
  query,
  execute,
  withTransaction,
  txQuery,
  txExecute,
  isMySQLAvailable,
} from "@/lib/db";
import {
  grantUsageByUid,
  getSubscriptionByUid,
  isPaidUserByUid,
  getRemainingUsageByUid,
  consumeUsageByUid,
} from "@/lib/subscriptions";

beforeEach(() => {
  vi.mocked(query).mockReset();
  vi.mocked(execute).mockReset();
  vi.mocked(withTransaction).mockReset();
  vi.mocked(txQuery).mockReset();
  vi.mocked(txExecute).mockReset();
  vi.mocked(isMySQLAvailable).mockReset();
  vi.mocked(isMySQLAvailable).mockReturnValue(true);
  vi.mocked(withTransaction).mockImplementation(((fn: (conn: unknown) => Promise<number>) =>
    fn({})) as typeof withTransaction);
});

// 每次用独立 uid，避免 60s 读缓存跨用例污染
let seq = 0;
const uid = () => `u-${++seq}`;

describe("grantUsageByUid — 管理端发放次数", () => {
  it("原子 upsert 累加后回读剩余", async () => {
    vi.mocked(execute).mockResolvedValue({} as never);
    vi.mocked(query).mockResolvedValueOnce([{ remaining_usage: 8 }] as never);
    const u = uid();
    await expect(grantUsageByUid(u, 5)).resolves.toBe(8);
    const [sql, params] = vi.mocked(execute).mock.calls[0];
    expect(String(sql)).toContain("ON DUPLICATE KEY UPDATE");
    expect(String(sql)).toContain("remaining_usage + VALUES(remaining_usage)");
    expect(params).toEqual([u, 5, 5]);
  });

  it("发放后缓存失效：getSubscriptionByUid 重新查库", async () => {
    const u = uid();
    const subRow = [{ uid: u, device_id: null, total_usage: 3, remaining_usage: 3 }];
    vi.mocked(query)
      .mockResolvedValueOnce(subRow as never) // 第一次读 → 进缓存
      .mockResolvedValueOnce([{ remaining_usage: 6 }] as never) // grant 回读
      .mockResolvedValueOnce(subRow as never); // 第三次读（应重新查库而非缓存）
    await getSubscriptionByUid(u);
    await grantUsageByUid(u, 3);
    await getSubscriptionByUid(u);
    // SELECT * / SELECT remaining 都走 query：缓存未被失效则第三次 getSub 不会有新 query
    expect(vi.mocked(query).mock.calls.filter((c) => String(c[0]).includes("WHERE uid")).length).toBe(3);
  });

  const badCounts = [0, -3, 1.5, NaN, Infinity];
  for (const n of badCounts) {
    it(`非法次数拒绝：addTimes=${n}`, async () => {
      await expect(grantUsageByUid(uid(), n)).rejects.toThrow();
      expect(execute).not.toHaveBeenCalled();
    });
  }

  it("无 MySQL → 显式抛错（不静默成功）", async () => {
    vi.mocked(isMySQLAvailable).mockReturnValue(false);
    await expect(grantUsageByUid(uid(), 5)).rejects.toThrow();
  });

  it("DB 异常向上抛（路由据此 500）", async () => {
    vi.mocked(execute).mockRejectedValueOnce(new Error("db down"));
    await expect(grantUsageByUid(uid(), 5)).rejects.toThrow("db down");
  });
});

describe("consumeUsageByUid — 发放制新语义：无状态/过期概念", () => {
  const cases: {
    desc: string;
    rows: { uid: string; remaining_usage: number; status?: string; expires_at?: string }[];
    want: number;
    updated: boolean;
  }[] = [
    { desc: "无订阅行 → 0 不更新", rows: [], want: 0, updated: false },
    { desc: "remaining 0 → 0 不更新", rows: [{ uid: "u", remaining_usage: 0 }], want: 0, updated: false },
    { desc: "remaining 5 → 4", rows: [{ uid: "u", remaining_usage: 5 }], want: 4, updated: true },
    {
      desc: "旧 status=inactive 脏行照常扣（status 已作废）",
      rows: [{ uid: "u", remaining_usage: 2, status: "inactive" }],
      want: 1,
      updated: true,
    },
    {
      desc: "旧 expires_at 已过期脏行照常扣（过期概念已作废）",
      rows: [{ uid: "u", remaining_usage: 2, expires_at: "1000" }],
      want: 1,
      updated: true,
    },
  ];

  for (const c of cases) {
    it(c.desc, async () => {
      vi.mocked(txQuery).mockResolvedValueOnce(c.rows as never);
      const got = await consumeUsageByUid(uid());
      expect(got).toBe(c.want);
      expect(vi.mocked(txExecute).mock.calls.length).toBe(c.updated ? 1 : 0);
    });
  }

  it("DB 异常 throw（settle_failed 链路依赖此契约）", async () => {
    vi.mocked(txQuery).mockRejectedValueOnce(new Error("tx boom"));
    await expect(consumeUsageByUid(uid())).rejects.toThrow("tx boom");
  });

  it("无 MySQL → 返 0 不抛（与扣量非关键路径一致）", async () => {
    vi.mocked(isMySQLAvailable).mockReturnValue(false);
    await expect(consumeUsageByUid(uid())).resolves.toBe(0);
  });
});

describe("isPaidUserByUid / getRemainingUsageByUid — remaining>0 即有额度", () => {
  const cases: {
    desc: string;
    row: unknown[];
    wantPaid: boolean;
    wantRemaining: number;
  }[] = [
    { desc: "无订阅", row: [], wantPaid: false, wantRemaining: 0 },
    { desc: "remaining 0", row: [{ uid: "u", remaining_usage: 0, total_usage: 0 }], wantPaid: false, wantRemaining: 0 },
    { desc: "remaining 1", row: [{ uid: "u", remaining_usage: 1, total_usage: 9 }], wantPaid: true, wantRemaining: 1 },
    {
      desc: "remaining 1 但旧 expires_at 已过期 → 仍有额度",
      row: [{ uid: "u", remaining_usage: 1, total_usage: 9, expires_at: "1000" }],
      wantPaid: true,
      wantRemaining: 1,
    },
    {
      desc: "remaining 5 但旧 status=inactive → 仍可见",
      row: [{ uid: "u", remaining_usage: 5, total_usage: 5, status: "inactive" }],
      wantPaid: true,
      wantRemaining: 5,
    },
  ];

  for (const c of cases) {
    it(`${c.desc} → isPaid=${c.wantPaid}`, async () => {
      vi.mocked(query).mockResolvedValueOnce(c.row as never);
      await expect(isPaidUserByUid(uid())).resolves.toBe(c.wantPaid);
    });
    it(`${c.desc} → remaining=${c.wantRemaining}`, async () => {
      vi.mocked(query).mockResolvedValueOnce(c.row as never);
      await expect(getRemainingUsageByUid(uid())).resolves.toBe(c.wantRemaining);
    });
  }
});
