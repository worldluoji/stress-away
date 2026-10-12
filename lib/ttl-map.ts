interface Entry {
  value: unknown;
  expiresAt: number;
}

// 进程内 TTL 存储：用于限流/防爆破等短生命周期计数，以及 kv 的无 MySQL 降级
export class TtlMap {
  private readonly store = new Map<string, Entry>();
  private readonly maxEntries: number;

  constructor(opts: { maxEntries?: number } = {}) {
    this.maxEntries = opts.maxEntries ?? 10_000;
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    if (this.store.size > this.maxEntries) this.pruneExpired();
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  del(key: string): void {
    this.store.delete(key);
  }

  // 键不存在或已过期时重置为 1 并应用新 TTL；已存在时只累加、不延长 TTL
  incr(key: string, ttlMs: number): number {
    const now = Date.now();
    const entry = this.store.get(key);
    if (!entry || now >= entry.expiresAt) {
      this.set(key, 1, ttlMs);
      return 1;
    }
    const next = (entry.value as number) + 1;
    this.store.set(key, { value: next, expiresAt: entry.expiresAt });
    return next;
  }

  rawSize(): number {
    return this.store.size;
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now >= entry.expiresAt) this.store.delete(key);
    }
  }
}
