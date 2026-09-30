import crypto from 'crypto';
import { kvSet, kvGet } from './kv';
import { TtlMap } from './ttl-map';

// Admin token management (hashed, stored in kv_store; verify in app/api/admin/verify.ts)
const ADMIN_TOKEN_PREFIX = 'admin:token:';
const ADMIN_TOKEN_TTL_MS = 60 * 60 * 2 * 1000; // 2 hours

/**
 * Store the hash of a raw admin token with TTL. Returns void;
 * the raw token is only ever sent to the client as a cookie.
 */
export async function setAdminToken(rawToken: string): Promise<void> {
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
  await kvSet(`${ADMIN_TOKEN_PREFIX}${hash}`, Date.now().toString(), ADMIN_TOKEN_TTL_MS);
}

// Admin login brute force protection (in-memory: short-lived, resets on restart)
const ADMIN_MAX_FAIL = 5;
const ADMIN_BLOCK_MS = 15 * 60 * 1000; // 15 minutes

interface AdminFailData {
  count: number;
  blockedUntil?: number;
}

const adminFailStore = new TtlMap();
const adminFailKey = (ip: string) => `admin:fail:${ip}`;

export async function checkAdminBlocked(ip: string): Promise<{ blocked: boolean; remainingSeconds: number }> {
  const key = adminFailKey(ip);
  const data = adminFailStore.get<AdminFailData>(key);
  if (!data || !data.blockedUntil) return { blocked: false, remainingSeconds: 0 };
  const now = Date.now();
  if (now < data.blockedUntil) {
    return { blocked: true, remainingSeconds: Math.ceil((data.blockedUntil - now) / 1000) };
  }
  adminFailStore.del(key);
  return { blocked: false, remainingSeconds: 0 };
}

export async function recordAdminFailedAttempt(ip: string): Promise<void> {
  const key = adminFailKey(ip);
  const data = adminFailStore.get<AdminFailData>(key) || { count: 0 };
  data.count++;
  if (data.count >= ADMIN_MAX_FAIL) {
    data.blockedUntil = Date.now() + ADMIN_BLOCK_MS;
  }
  adminFailStore.set(key, data, ADMIN_BLOCK_MS);
}

export async function resetAdminFailedAttempts(ip: string): Promise<void> {
  adminFailStore.del(adminFailKey(ip));
}
