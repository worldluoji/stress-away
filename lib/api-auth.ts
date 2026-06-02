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
  const uid = getUidFromRequest(cookies);
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