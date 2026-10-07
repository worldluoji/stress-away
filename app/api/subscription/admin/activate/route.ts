import { NextRequest, NextResponse } from 'next/server';
import { consumeAdminActivationCode, getSubscriptionByUid } from '@/lib/subscriptions';
import { getAuthContext } from '@/lib/api-auth';
import { checkRateLimit, checkDeviceIdSpoofing, RATE_LIMITS, extractClientInfo } from '@/lib/ratelimit';
import {
  checkActivationBlockedAsync,
  recordFailedAttemptAsync,
  resetFailedAttemptsAsync,
  getRemainingAttempts,
} from '@/lib/activation-security';
import { isValidActivationCode } from '@/lib/activation-codes';
import { recordEvent } from '@/lib/usage-events';

export async function POST(request: NextRequest) {
  try {
    const { uid, deviceId } = await getAuthContext(request);

    if (!deviceId) {
      return NextResponse.json({ error: 'Device ID required' }, { status: 400 });
    }

    const { ip } = extractClientInfo(request, deviceId);
    const rateLimitResult = await checkRateLimit(deviceId, ip, RATE_LIMITS.activate);

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'rate_limit_exceeded', message: '请求过于频繁，请稍后再试', resetAt: rateLimitResult.resetAt },
        { status: 429, headers: { 'Retry-After': Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000).toString() } }
      );
    }

    const blockStatus = await checkActivationBlockedAsync(ip, deviceId);
    if (blockStatus.blocked) {
      return NextResponse.json(
        { error: 'activation_blocked', message: '激活尝试次数过多，请15分钟后再试', remainingSeconds: blockStatus.remainingSeconds },
        { status: 429 }
      );
    }

    const deviceIdCheck = await checkDeviceIdSpoofing(ip, deviceId);
    if (!deviceIdCheck.allowed) {
      return NextResponse.json({ error: 'device_id_rejected', message: '请求异常，已被拒绝' }, { status: 403 });
    }

    const { code } = await request.json().catch(() => ({}));
    if (!code) {
      return NextResponse.json({ error: 'Missing activation code' }, { status: 400 });
    }

    const normalizedCode = code.trim().toUpperCase();
    if (!isValidActivationCode(normalizedCode)) {
      await recordFailedAttemptAsync(ip, deviceId);
      return NextResponse.json(
        { success: false, error: 'invalid_code', remainingAttempts: getRemainingAttempts(ip, deviceId) },
        { status: 400 }
      );
    }

    // If logged in (uid), use uid-based activation (account mode)
    if (uid) {
      // Check if already activated with same code
      const existingSub = await getSubscriptionByUid(uid);
      if (existingSub?.status === 'active' && existingSub.source === 'admin' && existingSub.activationCode === normalizedCode) {
        return NextResponse.json({
          success: true,
          remainingCodes: existingSub.remainingUsage,
          expiresAt: existingSub.expiresAt,
        });
      }

      const consumeResult = await consumeAdminActivationCode(normalizedCode, uid, deviceId);
      if (!consumeResult.success) {
        await recordFailedAttemptAsync(ip, deviceId);
        const ERROR_MAP: Record<string, string> = {
          mysql_not_configured: 'system_error',
          invalid_code: 'invalid_code',
          expired_code: 'expired_code',
          code_already_used: 'invalid_code',
        };
        return NextResponse.json(
          {
            success: false,
            error: ERROR_MAP[consumeResult.error ?? ''] ?? 'system_error',
            remainingAttempts: getRemainingAttempts(ip, deviceId),
          },
          { status: 400 }
        );
      }

      await resetFailedAttemptsAsync(ip, deviceId);
      // 仅计首次兑换；同码重复兑换走上方短路分支，不在此列（防重复计数）
      await recordEvent({ uid, deviceId, eventType: "activate_success" });
      return NextResponse.json({
        success: true,
        remainingCodes: consumeResult.remainingCodes,
        expiresAt: consumeResult.expiresAt,
      });
    }

    // Not logged in - device-based mode (backward compat, just reject with redirect to login)
    return NextResponse.json(
      { success: false, error: 'login_required', message: '请先登录账号再激活' },
      { status: 401 }
    );
  } catch (error) {

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}