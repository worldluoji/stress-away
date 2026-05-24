import { NextRequest, NextResponse } from 'next/server';
import { getActivationCode, consumeActivationCode, setSubscription, getSubscription, PAID_LIMIT } from '@/lib/redis';
import { checkRateLimit, checkDeviceIdSpoofing, RATE_LIMITS, extractClientInfo } from '@/lib/ratelimit';
import { checkActivationBlocked, recordFailedAttempt, resetFailedAttempts, getRemainingAttempts } from '@/lib/activation-security';
import { isValidActivationCode } from '@/lib/mbaodu';

/**
 * @swagger
 * /api/subscription/mbaodu/activate:
 *   post:
 *     summary: 激活订阅
 *     tags: [Subscription]
 *     security:
 *       - DeviceId: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - order_id
 *               - activation_code
 *             properties:
 *               order_id:
 *                 type: string
 *               activation_code:
 *                 type: string
 *     responses:
 *       200:
 *         description: 激活成功
 *       400:
 *         description: 缺少参数或激活码无效
 *       429:
 *         description: 请求过于频繁或激活被阻止
 *       500:
 *         description: 服务器内部错误
 */
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
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimitResult.resetAt.toString(),
            'Retry-After': Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000).toString(),
          },
        }
      );
    }

    // Check if IP/device is blocked due to failed attempts
    const blockStatus = checkActivationBlocked(ip, deviceId);
    if (blockStatus.blocked) {
      return NextResponse.json(
        {
          error: 'activation_blocked',
          message: '激活尝试次数过多，请15分钟后再试',
          remainingSeconds: blockStatus.remainingSeconds,
        },
        {
          status: 429,
          headers: {
            'Retry-After': blockStatus.remainingSeconds.toString(),
          },
        }
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

    const { order_id, activation_code } = body;

    if (!order_id || !activation_code) {
      return NextResponse.json({ error: 'Missing order_id or activation_code' }, { status: 400 });
    }

    // Validate activation code format and check digit
    const normalizedCode = activation_code.trim().toUpperCase();
    if (!isValidActivationCode(normalizedCode)) {
      return NextResponse.json({ error: 'Invalid activation code format' }, { status: 400 });
    }

    const existingSub = await getSubscription(deviceId);
    if (existingSub && existingSub.status === 'active') {
      return NextResponse.json({
        success: false,
        error: 'device_already_activated',
      });
    }

    const code1 = await getActivationCode(order_id, 1);
    const code2 = await getActivationCode(order_id, 2);

    let matchIndex: 1 | 2 | null = null;

    if (code1 && code1.code === normalizedCode) {
      matchIndex = 1;
    } else if (code2 && code2.code === normalizedCode) {
      matchIndex = 2;
    }

    if (matchIndex === null) {
      // Record failed attempt
      recordFailedAttempt(ip, deviceId);
      const remaining = getRemainingAttempts(ip, deviceId);
      return NextResponse.json(
        { success: false, error: 'invalid_code', remainingAttempts: remaining },
        {
          status: 400,
          headers: remaining > 0 ? { 'X-Remaining-Attempts': remaining.toString() } : {},
        }
      );
    }

    // Success - reset failed attempts
    resetFailedAttempts(ip, deviceId);

    const consumeResult = await consumeActivationCode(order_id, matchIndex, deviceId);
    if (!consumeResult.success) {
      return NextResponse.json({ success: false, error: consumeResult.error });
    }

    await setSubscription(deviceId, {
      status: 'active',
      remainingCodes: consumeResult.remainingCodes ?? PAID_LIMIT,
      activationTime: Date.now(),
      activationCodeIndex: matchIndex,
      orderId: order_id,
    });

    return NextResponse.json(
      {
        success: true,
        remaining_codes: consumeResult.remainingCodes ?? PAID_LIMIT,
      },
      {
        headers: {
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          'X-RateLimit-Reset': rateLimitResult.resetAt.toString(),
        },
      }
    );
  } catch (error) {
    console.error('Activate error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}