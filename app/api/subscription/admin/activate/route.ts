import { NextRequest, NextResponse } from 'next/server';
import { consumeAdminActivationCode, setSubscription, getSubscription } from '@/lib/subscriptions';
import { checkRateLimit, checkDeviceIdSpoofing, RATE_LIMITS, extractClientInfo } from '@/lib/ratelimit';
import { checkActivationBlocked, recordFailedAttempt, resetFailedAttempts, getRemainingAttempts } from '@/lib/activation-security';
import { isValidActivationCode } from '@/lib/mbaodu';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const deviceId = request.headers.get('x-device-id');

    if (!deviceId) {
      return NextResponse.json({ error: 'Device ID required' }, { status: 400 });
    }

    // Rate limit check
    const { ip } = extractClientInfo(request, deviceId);
    const rateLimitResult = await checkRateLimit(deviceId, ip, RATE_LIMITS.activate);

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: 'rate_limit_exceeded',
          message: '请求过于频繁，请稍后再试',
          resetAt: rateLimitResult.resetAt,
        },
        {
          status: 429,
          headers: {
            'Retry-After': Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000).toString(),
          },
        }
      );
    }

    // Check if blocked due to failed attempts
    const blockStatus = checkActivationBlocked(ip, deviceId);
    if (blockStatus.blocked) {
      return NextResponse.json(
        {
          error: 'activation_blocked',
          message: '激活尝试次数过多，请15分钟后再试',
          remainingSeconds: blockStatus.remainingSeconds,
        },
        { status: 429 }
      );
    }

    // Device ID anti-spoofing check
    const deviceIdCheck = await checkDeviceIdSpoofing(ip, deviceId);
    if (!deviceIdCheck.allowed) {
      return NextResponse.json(
        { error: 'device_id_rejected', message: '请求异常，已被拒绝' },
        { status: 403 }
      );
    }

    const { code } = body;
    if (!code) {
      return NextResponse.json({ error: 'Missing activation code' }, { status: 400 });
    }

    // Validate activation code format and check digit
    const normalizedCode = code.trim().toUpperCase();
    if (!isValidActivationCode(normalizedCode)) {
      recordFailedAttempt(ip, deviceId);
      const remaining = getRemainingAttempts(ip, deviceId);
      return NextResponse.json(
        { success: false, error: 'invalid_code', remainingAttempts: remaining },
        { status: 400 }
      );
    }

    const existingSub = await getSubscription(deviceId);
    if (existingSub && existingSub.status === 'active' && existingSub.source === 'admin') {
      // Already activated with admin code - check if same code
      if (existingSub.activationCode === normalizedCode) {
        return NextResponse.json({
          success: true,
          remainingCodes: existingSub.remainingCodes,
          expiresAt: existingSub.expiresAt,
        });
      }
      // Different admin code - need to handle device switch
    }

    // Consume the admin activation code
    const consumeResult = await consumeAdminActivationCode(normalizedCode, deviceId);
    if (!consumeResult.success) {
      recordFailedAttempt(ip, deviceId);
      const remaining = getRemainingAttempts(ip, deviceId);
      return NextResponse.json(
        { success: false, error: consumeResult.error, remainingAttempts: remaining },
        { status: 400 }
      );
    }

    // Success - reset failed attempts
    resetFailedAttempts(ip, deviceId);

    // Set subscription
    await setSubscription(deviceId, {
      status: 'active',
      source: 'admin',
      remainingCodes: consumeResult.remainingCodes ?? 50,
      activationTime: Date.now(),
      expiresAt: consumeResult.expiresAt,
      activationCode: normalizedCode,
    });

    return NextResponse.json({
      success: true,
      remainingCodes: consumeResult.remainingCodes,
      expiresAt: consumeResult.expiresAt,
    });
  } catch (error) {
    console.error('Admin activate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}