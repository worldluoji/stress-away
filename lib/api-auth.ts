/**
 * API helper: extract uid from TCB session cookie
 * Used at the top of every API route that needs auth
 */
import { parseCookies, getUidFromRequest } from './auth';

export interface AuthContext {
  uid: string | null;
  deviceId: string | null;
  isLoggedIn: boolean;
}

/**
 * Extract auth context from Next.js request headers
 * Returns uid (from TCB session) and deviceId (from header)
 */
export function getAuthContext(request: Request): AuthContext {
  const cookieHeader = request.headers.get('cookie');
  const cookies = parseCookies(cookieHeader);

  // Prefer header (set by frontend after login) over cookie
  const headerUid = request.headers.get('x-user-id') || null;
  const cookieUid = getUidFromRequest(cookies);
  const uid = headerUid || cookieUid;

  const deviceId = request.headers.get('x-device-id') || null;

  return {
    uid,
    deviceId,
    isLoggedIn: !!uid,
  };
}

/**
 * Require auth - throws if not logged in
 */
export function requireAuth(ctx: AuthContext): string {
  if (!ctx.uid) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return ctx.uid;
}