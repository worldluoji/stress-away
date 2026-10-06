import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { checkRateLimit, checkDeviceIdSpoofing, RATE_LIMITS, extractClientInfo } from '@/lib/ratelimit';
import { recordEvent, CLIENT_EVENT_TYPES, type EventType } from '@/lib/usage-events';

// 客户端事件上报通道（漏斗埋点）；report_generate 等服务端事件不在白名单，防伪造
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
        { error: 'rate_limit_exceeded', message: '请求过于频繁，请稍后再试' },
        { status: 429 }
      );
    }

    const deviceIdCheck = await checkDeviceIdSpoofing(ip, deviceId);
    if (!deviceIdCheck.allowed) {
      return NextResponse.json({ error: 'device_id_rejected', message: '请求异常，已被拒绝' }, { status: 403 });
    }

    let body: { eventType?: string; meta?: Record<string, unknown> };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }

    const { eventType, meta } = body;
    if (!eventType || !(CLIENT_EVENT_TYPES as string[]).includes(eventType)) {
      return NextResponse.json({ error: 'invalid_event_type' }, { status: 400 });
    }

    await recordEvent({
      uid: uid ?? null,
      deviceId,
      eventType: eventType as EventType,
      meta,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[api/events] failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
