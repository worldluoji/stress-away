import { NextRequest, NextResponse } from 'next/server';
import { checkUsage } from '@/lib/subscription';
import { getAuthContext } from '@/lib/api-auth';
import { checkRateLimit, checkDeviceIdSpoofing, RATE_LIMITS, extractClientInfo } from '@/lib/ratelimit';

export async function POST(request: NextRequest) {
  try {
    const { uid, deviceId } = getAuthContext(request);

    if (!deviceId) {
      return NextResponse.json({ error: 'Device ID required' }, { status: 400 });
    }

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
            'Retry-After': Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000).toString(),
          },
        }
      );
    }

    const deviceIdCheck = await checkDeviceIdSpoofing(ip, deviceId);
    if (!deviceIdCheck.allowed) {
      return NextResponse.json(
        { error: 'device_id_rejected', message: '请求异常，已被拒绝' },
        { status: 403 }
      );
    }

    // Only check usage — do NOT consume here
    // Consumption happens ONLY in /api/chat after AI success
    const usage = await checkUsage(uid, deviceId);

    return NextResponse.json(usage, {
      headers: {
        'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        'X-RateLimit-Reset': rateLimitResult.resetAt.toString(),
      },
    });
  } catch (error) {

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}