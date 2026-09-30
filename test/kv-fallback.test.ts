import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { kvSet, kvGet, kvIncr, kvDel } from "../lib/kv";
import { isMySQLAvailable } from "../lib/db";

// 无 MySQL 环境下，kv 应降级为进程内存储
beforeEach(() => {
  vi.stubEnv("MYSQL_HOST", "");
  vi.stubEnv("MYSQL_USER", "");
  vi.stubEnv("MYSQL_PASSWORD", "");
  vi.stubEnv("MYSQL_DATABASE", "");
  vi.useFakeTimers();
  vi.setSystemTime(1000);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("kv 内存降级 — 前提", () => {
  it("测试环境应无 MySQL 配置", () => {
    expect(isMySQLAvailable()).toBe(false);
  });
});

describe("kv 内存降级 — set/get/del", () => {
  const cases: {
    desc: string;
    key: string;
    value: unknown;
    ttlMs: number;
    advanceMs: number;
    want: unknown;
  }[] = [
    { desc: "写入后未过期可读回", key: "k1", value: { a: 1 }, ttlMs: 1000, advanceMs: 500, want: { a: 1 } },
    { desc: "过期后读不到", key: "k2", value: { a: 1 }, ttlMs: 1000, advanceMs: 1500, want: null },
    { desc: "未写入的键返回 null", key: "never-set", value: null, ttlMs: 1000, advanceMs: 0, want: null },
  ];

  cases.forEach((c) => {
    it(c.desc, async () => {
      if (c.key !== "never-set") await kvSet(c.key, c.value, c.ttlMs);
      await vi.advanceTimersByTimeAsync(c.advanceMs);
      expect(await kvGet(c.key)).toEqual(c.want);
    });
  });

  it("kvDel 删除后读不到", async () => {
    await kvSet("d1", 1, 60_000);
    await kvDel("d1");
    expect(await kvGet("d1")).toBeNull();
  });
});

describe("kv 内存降级 — incr", () => {
  const cases: { desc: string; ops: { advanceMs: number }[]; want: number }[] = [
    { desc: "首次返回 1", ops: [{}], want: 1 },
    { desc: "连续累加", ops: [{}, {}, {}], want: 3 },
    { desc: "过期后重新从 1 开始", ops: [{}, { advanceMs: 1500 }], want: 1 },
  ];

  cases.forEach((c) => {
    it(c.desc, async () => {
      const key = `incr:${c.desc}`;
      let result = 0;
      for (const op of c.ops) {
        await vi.advanceTimersByTimeAsync(op.advanceMs ?? 0);
        result = await kvIncr(key, 1000);
      }
      expect(result).toBe(c.want);
    });
  });
});
