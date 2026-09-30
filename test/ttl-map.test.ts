import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TtlMap } from "../lib/ttl-map";

describe("TtlMap — set/get/过期", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const cases: {
    desc: string;
    ttlMs: number;
    advanceMs: number;
    want: number | undefined;
  }[] = [
    { desc: "未过期返回原值", ttlMs: 1000, advanceMs: 500, want: 42 },
    { desc: "恰好到过期时间返回 undefined", ttlMs: 1000, advanceMs: 1000, want: undefined },
    { desc: "过期后返回 undefined", ttlMs: 1000, advanceMs: 2000, want: undefined },
    { desc: "从未写入返回 undefined", ttlMs: 1000, advanceMs: 0, want: undefined },
  ];

  cases.forEach((c) => {
    it(c.desc, () => {
      const map = new TtlMap();
      map.set("k", 42, c.ttlMs);
      if (c.desc === "从未写入返回 undefined") map.del("k");
      vi.advanceTimersByTime(c.advanceMs);
      expect(map.get<number>("k")).toBe(c.want);
    });
  });

  it("set 覆盖旧值并重置 TTL", () => {
    const map = new TtlMap();
    map.set("k", 1, 1000);
    vi.advanceTimersByTime(800);
    map.set("k", 2, 1000);
    vi.advanceTimersByTime(800);
    expect(map.get<number>("k")).toBe(2);
    vi.advanceTimersByTime(200);
    expect(map.get<number>("k")).toBeUndefined();
  });
});

describe("TtlMap — incr", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const cases: { desc: string; preCalls: number; advanceMs: number; want: number }[] = [
    { desc: "首次 incr 返回 1", preCalls: 0, advanceMs: 0, want: 1 },
    { desc: "连续 incr 累加", preCalls: 2, advanceMs: 0, want: 3 },
    { desc: "过期后重新从 1 开始", preCalls: 2, advanceMs: 1500, want: 1 },
  ];

  cases.forEach((c) => {
    it(c.desc, () => {
      const map = new TtlMap();
      for (let i = 0; i < c.preCalls; i++) map.incr("k", 1000);
      vi.advanceTimersByTime(c.advanceMs);
      expect(map.incr("k", 1000)).toBe(c.want);
    });
  });

  it("incr 不延长已存在键的过期时间", () => {
    const map = new TtlMap();
    map.incr("k", 1000); // 1，过期点 = T0+1000
    vi.advanceTimersByTime(600);
    map.incr("k", 5000); // 2，但 TTL 应保持 T0+1000
    vi.advanceTimersByTime(500); // T0+1100，已过期
    expect(map.get<number>("k")).toBeUndefined();
  });
});

describe("TtlMap — 超量清扫", () => {
  it("size 超过 maxEntries 时物理删除过期条目", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    try {
      const map = new TtlMap({ maxEntries: 5 });
      map.set("expired-1", 1, 100);
      map.set("expired-2", 2, 100);
      vi.advanceTimersByTime(200); // 上面两个过期
      map.set("alive-1", 3, 10000);
      map.set("alive-2", 4, 10000);
      map.set("alive-3", 5, 10000);
      map.set("alive-4", 6, 10000);
      map.set("alive-5", 7, 10000); // 第6次 set 超过 maxEntries=5，触发清扫
      expect(map.rawSize()).toBe(5);
      expect(map.get<number>("alive-1")).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
