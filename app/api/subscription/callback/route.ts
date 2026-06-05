// ============================================================
// Guard: keep this file as a valid module even when fully commented out
export {};
// import { NextRequest, NextResponse } from 'next/server';
// import { generateActivationCode } from '@/lib/mbaodu';
// import { checkRateLimit, RATE_LIMITS, getClientIP } from '@/lib/ratelimit';
//
// interface CallbackBody {
//   order_id: string;
//   state: number;
// }
//
// function isValidOrderId(orderId: string): boolean {
//   // Mbaodu order IDs are typically 32 character hex strings
//   return /^[a-f0-9]{32}$/i.test(orderId);
// }
//
// /**
//  * @swagger
//  * /api/subscription/callback:
//  *   post:
//  *     summary: 支付回调 [已禁用]
//  *     tags: [Subscription]
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             required:
//  *               - order_id
//  *               - state
//  *             properties:
//  *               order_id:
//  *                 type: string
//  *               state:
//  *                 type: number
//  *     responses:
//  *       200:
//  *         description: 回调处理成功
//  *       400:
//  *         description: 支付未完成或缺少参数
//  *       500:
//  *         description: 服务器内部错误
//  */
// export async function POST(request: NextRequest) {
//   try {
//     // Rate limit check by IP only (callback has no deviceId)
//     const ip = getClientIP(request);
//     const rateLimitResult = await checkRateLimit(ip, ip, RATE_LIMITS.callback);
//
//     if (!rateLimitResult.allowed) {
//       return NextResponse.json(
//         { error: 'rate_limit_exceeded', message: '请求过于频繁，请稍后再试' },
//         { status: 429 }
//       );
//     }
//
//     const body: CallbackBody = await request.json();
//     const { order_id, state } = body;
//
//     if (!order_id || !isValidOrderId(order_id)) {
//       return NextResponse.json({ error: 'Invalid order_id' }, { status: 400 });
//     }
//
//     if (state !== 1) {
//       return NextResponse.json({ error: 'Payment not completed' }, { status: 400 });
//     }
//
//     const alreadyActivated = await isOrderActivated(order_id);
//     if (alreadyActivated) {
//       return NextResponse.json({ success: true, message: 'Already processed' });
//     }
//
//     const code1 = generateActivationCode();
//     const code2 = generateActivationCode();
//
//     await setActivationCodes(order_id, code1, code2);
//     await markOrderActivated(order_id);
//     await setOrderCreatedTime(order_id, Date.now());
//
//     return NextResponse.json({ success: true });
//   } catch (error) {
//     console.error('Mbaodu callback error:', error);
//     return NextResponse.json(
//       { error: 'Internal server error' },
//       { status: 500 }
//     );
//   }
// }
// ============================================================