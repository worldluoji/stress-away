import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("db pool 错误监听", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("MYSQL_HOST", "127.0.0.1");
    vi.stubEnv("MYSQL_USER", "u");
    vi.stubEnv("MYSQL_PASSWORD", "p");
    vi.stubEnv("MYSQL_DATABASE", "d");
    vi.stubEnv("MYSQL_PORT", "1"); // 不实际连接，仅建池
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("getPool 注册的池带 error 监听器，避免空闲连接报错成 unhandled error", async () => {
    const { getPool } = await import("../lib/db");
    const pool = getPool();
    expect(pool.listenerCount("error")).toBe(1);
    await pool.end();
  });
});
