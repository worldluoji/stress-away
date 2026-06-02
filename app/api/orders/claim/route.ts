/**
 * POST /api/orders/claim
 *
 * User submits order ID → we verify with MBAODU API → claim if valid
 *
 * Body: { order_id: string }
 *
 * Flow:
 * 1. Verify user is logged in (uid from TCB session)
 * 2. Query MBAODU API for order status
 * 3. Check order is paid + within 3 days + not already claimed
 * 4. Write to subscriptions (uid + 100 times) and orders (claimed=true)
 * 5. Return remaining usage
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { query, execute, isMySQLAvailable } from '@/lib/db';
import { queryOrder } from '@/lib/mbaodu';

// 3 days in milliseconds
const CLAIM_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

interface OrderRow {
  order_id: string;
  payment_status: string;
  payment_time: number | null;
  claimed: boolean;
  claimed_uid: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const auth = getAuthContext(request);
    if (!auth.uid) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const orderId = String(body.order_id || '').trim();

    if (!orderId) {
      return NextResponse.json({ error: 'order_id required' }, { status: 400 });
    }

    if (!isMySQLAvailable) {
      return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
    }

    // Step 1: Check if already claimed
    const [existingOrder] = await query<OrderRow>(
      'SELECT * FROM orders WHERE order_id = ?',
      [orderId]
    );

    if (existingOrder?.claimed && existingOrder.claimed_uid) {
      if (existingOrder.claimed_uid === auth.uid) {
        // User already claimed this order themselves
        return NextResponse.json({ error: 'already_claimed_by_you' }, { status: 400 });
      }
      return NextResponse.json({ error: 'already_claimed' }, { status: 400 });
    }

    // Step 2: Query MBAODU for order status
    const mbaoduOrder = await queryOrder(orderId);

    if (!mbaoduOrder) {
      return NextResponse.json({ error: 'invalid_order' }, { status: 400 });
    }

    // Check payment status (status: 'success' = paid)
    if (mbaoduOrder.status !== 'success') {
      return NextResponse.json({ error: 'order_not_paid' }, { status: 400 });
    }

    // Check 3-day window from payment time
    const paymentTime = mbaoduOrder.paid_at;

    const elapsed = Date.now() - paymentTime;
    if (elapsed > CLAIM_WINDOW_MS) {
      return NextResponse.json({ error: 'claim_window_expired' }, { status: 400 });
    }

    // Step 4: Claim - write to subscriptions and orders
    const uid = auth.uid;
    const now = Date.now();
    const totalUsage = 100;
    const remainingUsage = 100;

    // Upsert order record
    await execute(
      `INSERT INTO orders (order_id, payment_status, payment_time, claimed, claimed_uid, claimed_at)
       VALUES (?, 'paid', ?, TRUE, ?, ?)
       ON DUPLICATE KEY UPDATE
         payment_status = 'paid',
         payment_time = COALESCE(VALUES(payment_time), payment_time),
         claimed = TRUE,
         claimed_uid = VALUES(claimed_uid),
         claimed_at = VALUES(claimed_at)`,
      [orderId, paymentTime, uid, now]
    );

    // Upsert subscription (uid as primary key)
    await execute(
      `INSERT INTO subscriptions (uid, device_id, status, source, total_usage, remaining_usage, claimed_at, order_id)
       VALUES (?, ?, 'active', 'mbaodu', ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = 'active',
         source = 'mbaodu',
         total_usage = VALUES(total_usage),
         remaining_usage = VALUES(remaining_usage),
         claimed_at = VALUES(claimed_at),
         order_id = VALUES(order_id)`,
      [uid, auth.deviceId || null, totalUsage, remainingUsage, now, orderId]
    );

    return NextResponse.json({
      success: true,
      remaining: remainingUsage,
      total: totalUsage,
      claimed_at: now,
    });
  } catch (err) {
    console.error('[orders/claim] error:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

/**
 * GET /api/orders/claim
 *
 * Query claim status of an order (for checking if a user's order was already claimed)
 * Requires auth
 */
export async function GET(request: NextRequest) {
  try {
    const auth = getAuthContext(request);
    if (!auth.uid) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const orderId = new URL(request.url).searchParams.get('order_id')?.trim();
    if (!orderId) {
      return NextResponse.json({ error: 'order_id required' }, { status: 400 });
    }

    if (!isMySQLAvailable) {
      return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
    }

    const [order] = await query<OrderRow>(
      'SELECT * FROM orders WHERE order_id = ?',
      [orderId]
    );

    if (!order) {
      return NextResponse.json({ exists: false });
    }

    return NextResponse.json({
      exists: true,
      claimed: order.claimed,
      claimed_by_you: order.claimed_uid === auth.uid,
      claimed_uid: order.claimed_uid || null,
    });
  } catch (err) {
    console.error('[orders/claim GET] error:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}