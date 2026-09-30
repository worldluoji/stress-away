import { query, execute, isMySQLAvailable } from './db';
import { TtlMap } from './ttl-map';

const memoryFallback = new TtlMap();

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
let lastSweepAt = 0;

async function maybeSweep(): Promise<void> {
  const now = Date.now();
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  try {
    await execute('DELETE FROM kv_store WHERE expires_at < ?', [now]);
  } catch (error) {
    console.error('[kv] expired-row sweep failed:', error);
  }
}

export async function kvSet(key: string, value: unknown, ttlMs: number): Promise<void> {
  if (!isMySQLAvailable()) {
    memoryFallback.set(key, value, ttlMs);
    return;
  }
  await maybeSweep();
  const expiresAt = Date.now() + ttlMs;
  const json = JSON.stringify(value);
  await execute(
    'INSERT INTO kv_store (`key`, `value`, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `value` = ?, expires_at = ?',
    [key, json, expiresAt, json, expiresAt]
  );
}

export async function kvGet<T>(key: string): Promise<T | null> {
  if (!isMySQLAvailable()) {
    const value = memoryFallback.get<T>(key);
    return value === undefined ? null : value;
  }
  const rows = await query<{ value: string; expires_at: number }>(
    'SELECT `value`, expires_at FROM kv_store WHERE `key` = ?',
    [key]
  );
  if (rows.length === 0) return null;
  if (Number(rows[0].expires_at) < Date.now()) {
    await execute('DELETE FROM kv_store WHERE `key` = ?', [key]);
    return null;
  }
  return JSON.parse(rows[0].value) as T;
}

export async function kvIncr(key: string, ttlMs: number): Promise<number> {
  if (!isMySQLAvailable()) {
    return memoryFallback.incr(key, ttlMs);
  }
  await maybeSweep();
  const now = Date.now();
  const expiresAt = now + ttlMs;
  await execute(
    `INSERT INTO kv_store (\`key\`, \`value\`, expires_at) VALUES (?, '1', ?)
     ON DUPLICATE KEY UPDATE
       \`value\` = IF(expires_at < ?, '1', CAST(\`value\` AS UNSIGNED) + 1),
       expires_at = IF(expires_at < ?, ?, expires_at)`,
    [key, expiresAt, now, now, expiresAt]
  );
  const rows = await query<{ count: number }>(
    'SELECT CAST(`value` AS UNSIGNED) AS count FROM kv_store WHERE `key` = ?',
    [key]
  );
  if (rows.length === 0) {
    throw new Error(`kvIncr: row missing after upsert for key ${key}`);
  }
  return Number(rows[0].count);
}

export async function kvDel(key: string): Promise<void> {
  if (!isMySQLAvailable()) {
    memoryFallback.del(key);
    return;
  }
  await execute('DELETE FROM kv_store WHERE `key` = ?', [key]);
}
