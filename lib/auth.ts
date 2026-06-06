/**
 * TCB Auth - Backend session verification
 *
 * TCB sends session info as a cookie (tcb_session).
 * We use TCB secret key to verify the session and extract uid.
 *
 * The TCB session cookie format: base64 encoded JSON containing
 * { session: { openId, uid, ... }, appId, envId, timestamp }
 * It's signed by TCB - we verify the signature.
 */

import crypto from 'crypto';

interface TCBSessionData {
  openId?: string;
  uid?: string;
  user?: {
    id: string;
    username?: string;
    email?: string;
    phone?: string;
  };
  accessToken?: string;
}

interface DecodedSession {
  session: TCBSessionData;
  appId: string;
  envId: string;
  timestamp: number;
}

/**
 * Decode and verify TCB session cookie.
 * The cookie value is: base64(tcb_session_json) + '.' + signature
 * We verify the signature using the TCB secret key.
 */
export function verifyTCBSession(cookieValue: string): DecodedSession | null {
  const secretKey = process.env.TCB_SECRET_KEY;
  if (!secretKey) return null;

  try {
    const lastDot = cookieValue.lastIndexOf('.');
    if (lastDot === -1) return null;

    const payload = cookieValue.slice(0, lastDot);
    const signature = cookieValue.slice(lastDot + 1);

    // Verify HMAC-SHA256 signature
    const expectedSig = crypto
      .createHmac('sha256', secretKey)
      .update(payload)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    // Length check first — timingSafeEqual throws if buffers differ in length
    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length) {
      return null;
    }
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as DecodedSession;

    // Check timestamp (session expires in 2 hours)
    const maxAge = 2 * 60 * 60 * 1000;
    if (Date.now() - decoded.timestamp > maxAge) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

/**
 * Extract uid from TCB session cookie in request.
 * Returns null if not logged in.
 */
export function getUidFromRequest(
  cookies: Partial<Record<string, string>>
): string | null {
  const sessionCookie = cookies['tcb_session'];
  if (!sessionCookie) return null;

  const decoded = verifyTCBSession(sessionCookie);
  return decoded?.session?.uid || decoded?.session?.openId || null;
}

/**
 * Parse cookies from request headers string
 */
export function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, part) => {
    const [key, ...valueParts] = part.trim().split('=');
    if (key) acc[key.trim()] = valueParts.join('=');
    return acc;
  }, {} as Record<string, string>);
}