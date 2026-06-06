import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { setAdminToken, checkAdminBlocked, recordAdminFailedAttempt, resetAdminFailedAttempts } from '@/lib/redis';
import { getClientIP } from '@/lib/ratelimit';
import { verifyTCBSession } from '@/lib/auth';

const ADMIN_UIDS = (process.env.ADMIN_UIDS || '').split(',').filter(Boolean);

// Verify session token (old way) or accept uid directly from X-User-Id header (new way)
function extractUid(request: NextRequest, body: { uid?: string; sessionToken?: string }): string | null {
  // New way: uid from body (verified by TCB SDK on frontend)
  if (body.uid) return body.uid;

  // Old way: tcb_session cookie token
  if (body.sessionToken) {
    const decoded = verifyTCBSession(body.sessionToken);
    return decoded?.session?.uid || null;
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    // Brute force protection
    const ip = getClientIP(request);
    const blockStatus = await checkAdminBlocked(ip);
    if (blockStatus.blocked) {
      return NextResponse.json(
        {
          error: 'admin_blocked',
          message: '登录尝试次数过多，请15分钟后再试',
          remainingSeconds: blockStatus.remainingSeconds,
        },
        {
          status: 429,
          headers: { 'Retry-After': blockStatus.remainingSeconds.toString() },
        }
      );
    }

    const uid = extractUid(request, body);
    if (!uid) {
      await recordAdminFailedAttempt(ip);
      return NextResponse.json({ error: 'invalid_session' }, { status: 401 });
    }

    // Check if uid is in admin whitelist
    if (ADMIN_UIDS.length > 0 && !ADMIN_UIDS.includes(uid)) {
      await recordAdminFailedAttempt(ip);
      return NextResponse.json({ error: 'not_admin' }, { status: 403 });
    }

    // Success - clear failed attempts and generate admin token
    await resetAdminFailedAttempts(ip);
    const rawToken = crypto.randomBytes(32).toString('hex');
    await setAdminToken(rawToken);

    const response = NextResponse.json({ success: true });
    response.cookies.set('admin_token', rawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 2, // 2 hours
      path: '/',
    });

    return response;
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}