/**
 * /api/subscription/mbaodu/activate
 *
 * DEPRECATED: mbaodu orders are now claimed directly via /api/orders/claim
 * This endpoint redirects users to the new claim flow.
 *
 * If uid (logged in): tell them to use "认领订单"
 * If no uid: tell them to login first
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { checkRateLimit, checkDeviceIdSpoofing, RATE_LIMITS, extractClientInfo } from '@/lib/ratelimit';

export async function POST(request: NextRequest) {
  try {
    const { uid, deviceId } = getAuthContext(request);

    if (!deviceId) {
      return NextResponse.json({ error: 'Device ID required' }, { status: 400 });
    }

    const { ip } = extractClientInfo(request, deviceId);
    await checkRateLimit(deviceId, ip, RATE_LIMITS.activate);

    const deviceIdCheck = await checkDeviceIdSpoofing(ip, deviceId);
    if (!deviceIdCheck.allowed) {
      return NextResponse.json({ error: 'device_id_rejected' }, { status: 403 });
    }

    if (uid) {
      return NextResponse.json({
        success: false,
        error: 'use_claim_instead',
        message: '面包多订单请使用"认领订单"功能，无需激活码',
        hint: 'login_required_for_claim',
      }, { status: 400 });
    }

    return NextResponse.json({
      success: false,
      error: 'login_required',
      message: '请先登录账号，再认领面包多订单',
    }, { status: 401 });
  } catch (error) {

    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}