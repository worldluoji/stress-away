import { NextRequest, NextResponse } from 'next/server';
import { consumeOne } from '@/lib/subscription';
import { checkRateLimit, RATE_LIMITS, extractClientInfo } from '@/lib/ratelimit';

/**
 * @swagger
 * /api/usage/consume:
 *   post:
 *     summary: 消费用量
 *     tags: [Usage]
 *     security:
 *       - DeviceId: []
 *     responses:
 *       200:
 *         description: 消费结果
 *       400:
 *         description: 缺少设备ID
 *       429:
 *         description: 请求过于频繁
 *       500:
 *         description: 服务器内部错误
 */
export async function POST(request: NextRequest) {
  try {
    const deviceId = request.headers.get('x-device-id');

    if (!deviceId) {
      return NextResponse.json({ error: 'Device ID required' }, { status: 400 });
    }

    // Rate limit check
    const { ip } = extractClientInfo(request, deviceId);
    const rateLimitResult = await checkRateLimit(deviceId, ip, RATE_LIMITS.usage);

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

    const result = await consumeOne(deviceId);

    return NextResponse.json(
      result,
      {
        headers: {
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          'X-RateLimit-Reset': rateLimitResult.resetAt.toString(),
        },
      }
    );
  } catch (error) {
    console.error('Consume error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}