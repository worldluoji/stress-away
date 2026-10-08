/**
 * 自建账号体系：scrypt 密码哈希 + sessions 表会话（token 只存 SHA-256）+ httpOnly cookie。
 * uid 即 users.id（crypto.randomUUID()），业务表（subscriptions/labor_reports 等）
 * 的 uid 列直接引用它。替代原腾讯云 TCB 客户端登录。
 */
import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { query, execute, queryWithLimit } from "./db";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: string,
  keyLength: number
) => Promise<Buffer>;

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_SALT_LENGTH = 16;
const HASH_VERSION = "v1";

export const SESSION_COOKIE = "session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

// 去除易混淆字符（0/o/1/l/i）后的可读密码字符集，仅管理员建号时使用
const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const PASSWORD_GROUP_LENGTH = 4;
const PASSWORD_GROUP_COUNT = 3;

// 假哈希（格式合法、内容全零）：用户名不存在时同样跑一次 scrypt，
// 使「用户不存在」与「密码错误」的计算耗时一致，堵时序侧信道枚举
export const DUMMY_PASSWORD_HASH = `v1:${"00".repeat(SCRYPT_SALT_LENGTH)}:${"00".repeat(SCRYPT_KEY_LENGTH * 2)}`;

export function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_LENGTH).toString("hex");
  return scrypt(password, salt, SCRYPT_KEY_LENGTH).then((derived) =>
    [HASH_VERSION, salt, derived.toString("hex")].join(":")
  );
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== HASH_VERSION) return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  if (expected.length !== SCRYPT_KEY_LENGTH) return false;
  const derived = await scrypt(password, salt, SCRYPT_KEY_LENGTH);
  return timingSafeEqual(derived, expected);
}

export function generateInitialPassword(): string {
  const groups: string[] = [];
  for (let i = 0; i < PASSWORD_GROUP_COUNT; i++) {
    let group = "";
    for (let j = 0; j < PASSWORD_GROUP_LENGTH; j++) {
      group += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join("-");
}

export type UserRole = "admin" | "user";

export type SessionUser = {
  id: string;
  username: string;
  role: UserRole;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await execute(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
    [hashToken(token), userId, expiresAt]
  );
  // 机会式清理过期会话，避免 MySQL 里堆积僵尸行
  await execute("DELETE FROM sessions WHERE expires_at < NOW()");
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

interface UserRow {
  id: string;
  username: string;
  role: string;
  password_hash?: string;
  remaining_usage?: number | null;
  total_usage?: number | null;
}

function rowToSessionUser(row: UserRow): SessionUser {
  return {
    id: String(row.id),
    username: String(row.username),
    role: row.role === "admin" ? "admin" : "user",
  };
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await query<UserRow>(
    `SELECT u.id, u.username, u.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > NOW()
      LIMIT 1`,
    [hashToken(token)]
  );
  if (rows.length === 0) return null;
  return rowToSessionUser(rows[0]);
}

export async function requireAdmin(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return null;
  return user;
}

/**
 * 按 username 查用户（含 password_hash），仅服务端调用。
 */
export async function findUserByUsername(
  username: string
): Promise<(SessionUser & { passwordHash: string }) | null> {
  const rows = await query<UserRow>(
    "SELECT id, username, role, password_hash FROM users WHERE username = ? LIMIT 1",
    [username]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    ...rowToSessionUser(row),
    passwordHash: String(row.password_hash),
  };
}

export async function createUser(
  username: string,
  password: string,
  role: UserRole = "user"
): Promise<string> {
  const id = randomUUID();
  const passwordHash = await hashPassword(password);
  await execute(
    "INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)",
    [id, username, passwordHash, role]
  );
  return id;
}

/**
 * 幂等地用 ADMIN_USERNAME/ADMIN_PASSWORD 环境变量初始化管理员账号。
 * 环境变量缺失时静默跳过（例如本地未配置管理端的环境）。
 */
export async function ensureAdminUser(): Promise<void> {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) return;
  const existing = await findUserByUsername(username);
  if (existing) {
    if (existing.role !== "admin") {
      await execute("UPDATE users SET role = 'admin' WHERE id = ?", [existing.id]);
    }
    return;
  }
  await createUser(username, password, "admin");
}

/**
 * 退出登录：cookie 恒先清除（本机退出必须有保证），再删服务端会话行。
 * DB 删除失败返回 false——token 最长还能活 7 天，调用方需把结果显式带给用户。
 */
export async function destroySession(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return true;
  store.delete(SESSION_COOKIE);
  try {
    await execute("DELETE FROM sessions WHERE token_hash = ?", [hashToken(token)]);
    return true;
  } catch (e) {
    console.error("[user-auth] 清理会话失败：本机已退出，服务端 token 仍有效", e);
    return false;
  }
}

/**
 * 管理员重置密码：生成新的随机可读密码，清空该用户全部会话强制重新登录。
 * 明文密码只在本返回值中出现一次。
 */
export type AdminResetResult =
  | { ok: true; password: string }
  | { ok: false; reason: "user_not_found" };

export async function adminResetPassword(
  userId: string
): Promise<AdminResetResult> {
  const rows = await query<{ id: string }>(
    "SELECT id FROM users WHERE id = ? LIMIT 1",
    [userId]
  );
  if (rows.length === 0) return { ok: false, reason: "user_not_found" };
  const password = generateInitialPassword();
  const passwordHash = await hashPassword(password);
  await execute("UPDATE users SET password_hash = ? WHERE id = ?", [
    passwordHash,
    userId,
  ]);
  await execute("DELETE FROM sessions WHERE user_id = ?", [userId]);
  return { ok: true, password };
}

const USER_LIST_LIMIT = 200;

export type UserSummary = {
  id: string;
  username: string;
  role: UserRole;
  /** 剩余报告次数（subscriptions，无记录为 0） */
  remainingUsage: number;
  /** 累计发放次数 */
  totalUsage: number;
};

export async function userExists(userId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    "SELECT id FROM users WHERE id = ? LIMIT 1",
    [userId]
  );
  return rows.length > 0;
}

export async function listUsers(): Promise<UserSummary[]> {
  // mysql2 prepare 协议不支持 LIMIT ?（ER_WRONG_ARGUMENTS），须走 queryWithLimit 数值内联
  const rows = await queryWithLimit<UserRow>(
    `SELECT u.id, u.username, u.role,
            COALESCE(s.remaining_usage, 0) AS remaining_usage,
            COALESCE(s.total_usage, 0) AS total_usage
       FROM users u
       LEFT JOIN subscriptions s ON s.uid = u.id
      ORDER BY u.created_at DESC`,
    USER_LIST_LIMIT,
    0
  );
  return rows.map((r) => ({
    id: String(r.id),
    username: String(r.username),
    role: r.role === "admin" ? "admin" : "user",
    remainingUsage: Number(r.remaining_usage ?? 0),
    totalUsage: Number(r.total_usage ?? 0),
  }));
}
