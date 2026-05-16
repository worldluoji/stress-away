import { NextRequest, NextResponse } from 'next/server';
import { getActivationCode, setActivationCodes, setUsedOrderTTL } from '@/lib/redis';
import { queryOrder, generateActivationCode } from '@/lib/mbaodu';

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

          return NextResponse.json({
            success: true,
            codes: [
              { code: maskCode(newCode1), used: false },
              { code: maskCode(newCode2), used: false },
            ],
          });
        }
      } catch (error) {
        console.error('Mbaodu query failed:', error);
        return NextResponse.json(
          { message: '订单已付款，激活码稍后生成，请稍后再试' },
          { status: 503 }
        );
      }

      return NextResponse.json({ error: 'Order not found or no codes generated' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      codes: [
        code1 ? { code: maskCode(code1.code), used: code1.used } : null,
        code2 ? { code: maskCode(code2.code), used: code2.used } : null,
      ].filter(Boolean),
    });
  } catch (error) {
    console.error('Query codes error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}