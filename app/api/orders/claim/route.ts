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
 *
 * Race condition fix: uses transaction + SELECT FOR UPDATE to prevent
 * two users claiming the same order simultaneously.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { query, execute, isMySQLAvailable, getConnection } from '@/lib/db';
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

  // Step 1: Query MBAODU for order status (outside transaction, read-only)
  const mbaoduOrder = await queryOrder(orderId);

  if (!mbaoduOrder) {
    return NextResponse.json({ error: 'invalid_order' }, { status: 400 });
  }

  if (mbaoduOrder.status !== 'success') {
    return NextResponse.json({ error: 'order_not_paid' }, { status: 400 });
  }

  const paymentTime = mbaoduOrder.paid_at;
  const elapsed = Date.now() - paymentTime;
  if (elapsed > CLAIM_WINDOW_MS) {
    return NextResponse.json({ error: 'claim_window_expired' }, { status: 400 });
  }

  // Step 2: Claim with transaction + row lock to prevent race condition
  const uid = auth.uid;
  const now = Date.now();
  const totalUsage = 100;
  const remainingUsage = 100;

  try {
    const conn = await getConnection();

    try {
      // Lock the row to prevent concurrent claims
      const [rows] = await conn.execute(
        'SELECT * FROM orders WHERE order_id = ? FOR UPDATE',
        [orderId]
      );
      const existingOrder = (rows as OrderRow[])[0];

      if (existingOrder?.claimed && existingOrder.claimed_uid) {
        if (existingOrder.claimed_uid === uid) {
          await conn.release();
          return NextResponse.json({ error: 'already_claimed_by_you' }, { status: 400 });
        }
        await conn.release();
        return NextResponse.json({ error: 'already_claimed' }, { status: 400 });
      }

      // Insert or update order record
      await conn.execute(
        `INSERT INTO orders (order_id, payment_status, payment_time, claimed, claimed_uid, claimed_at)
         VALUES (?, 'paid', ?, TRUE, ?, ?)
         ON DUPLICATE KEY UPDATE
           payment_status = 'paid',
           payment_time = COALESCE(payment_time, VALUES(payment_time)),
           claimed = TRUE,
           claimed_uid = VALUES(claimed_uid),
           claimed_at = VALUES(claimed_at)`,
        [orderId, paymentTime, uid, now]
      );

      // Upsert subscription (uid as primary key)
      await conn.execute(
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

      await conn.commit();
      await conn.release();

      return NextResponse.json({
        success: true,
        remaining: remainingUsage,
        total: totalUsage,
        claimed_at: now,
      });
    } catch (err) {
      await conn.rollback();
      await conn.release();
      throw err;
    }
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