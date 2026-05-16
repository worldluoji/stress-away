import { NextRequest, NextResponse } from 'next/server';
import { getActivationCode, consumeActivationCode, setSubscription, getSubscription, PAID_LIMIT } from '@/lib/redis';
import { checkRateLimit, RATE_LIMITS, extractClientInfo } from '@/lib/ratelimit';

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

    const { order_id, activation_code } = body;

    if (!order_id || !activation_code) {
      return NextResponse.json({ error: 'Missing order_id or activation_code' }, { status: 400 });
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

    if (code1 && code1.code === activation_code) {
      matchIndex = 1;
    } else if (code2 && code2.code === activation_code) {
      matchIndex = 2;
    }

    if (matchIndex === null) {
      return NextResponse.json({ success: false, error: 'invalid_code' });
    }

    const consumeResult = await consumeActivationCode(order_id, matchIndex, deviceId);
    if (!consumeResult.success) {
      return NextResponse.json({ success: false, error: consumeResult.error });
    }

    await setSubscription(deviceId, {
      status: 'active',
      remainingCodes: PAID_LIMIT,
      activatedAt: Date.now(),
    });

    return NextResponse.json(
      {
        success: true,
        remaining_codes: consumeResult.remainingCodes ?? 0,
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
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}