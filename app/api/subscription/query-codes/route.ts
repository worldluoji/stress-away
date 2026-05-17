import { NextRequest, NextResponse } from 'next/server';
import { getActivationCode, setActivationCodes, setUsedOrderTTL, canQueryOrder } from '@/lib/redis';
import { queryOrder, generateActivationCode } from '@/lib/mbaodu';
import { checkRateLimit, RATE_LIMITS, extractClientInfo } from '@/lib/ratelimit';

function maskCode(code: string): string {
  if (code.length <= 4) return code;
  return code.slice(0, 2) + '****' + code.slice(-2);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { order_id } = body;

    if (!order_id) {
      return NextResponse.json({ error: 'Missing order_id' }, { status: 400 });
    }

    // Rate limit check - use IP and order_id for combined key
    const { ip, deviceId } = extractClientInfo(request, 'query-codes:' + order_id);
    const rateLimitResult = await checkRateLimit(deviceId, ip, RATE_LIMITS.queryCodes);

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

    // 48-hour query window check
    const queryStatus = await canQueryOrder(order_id);
    if (!queryStatus.allowed) {
      return NextResponse.json(
        {
          error: 'query_expired',
          message: `激活码查询窗口已过期（购买后48小时内可查询）`,
        },
        {
          status: 403,
        }
      );
    }

    const [code1, code2] = await Promise.all([
      getActivationCode(order_id, 1),
      getActivationCode(order_id, 2),
    ]);

    if (!code1 && !code2) {
      try {
        const orderDetail = await queryOrder(order_id);
        if (orderDetail && orderDetail.status === 'success') {
          const newCode1 = generateActivationCode();
          const newCode2 = generateActivationCode();
          await setActivationCodes(order_id, newCode1, newCode2);
          await setUsedOrderTTL(order_id, 30);

          return NextResponse.json(
            {
              success: true,
              codes: [
                { code: maskCode(newCode1), used: false },
                { code: maskCode(newCode2), used: false },
              ],
            },
            {
              headers: {
                'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
                'X-RateLimit-Reset': rateLimitResult.resetAt.toString(),
              },
            }
          );
        } else {
          // Order not found or not paid
          return NextResponse.json({ error: 'Order not found or payment not completed' }, { status: 404 });
        }
      } catch (error) {
        console.error('Mbaodu query failed:', error);
        // API call failed - don't assume order is paid
        return NextResponse.json(
          { error: 'mbaodu_api_error', message: '激活码服务暂不可用，请稍后再试' },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      {
        success: true,
        codes: [
          code1 ? { code: maskCode(code1.code), used: code1.used } : null,
          code2 ? { code: maskCode(code2.code), used: code2.used } : null,
        ].filter(Boolean),
      },
      {
        headers: {
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          'X-RateLimit-Reset': rateLimitResult.resetAt.toString(),
        },
      }
    );
  } catch (error) {
    console.error('Query codes error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}