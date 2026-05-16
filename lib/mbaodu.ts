const MBAODU_APP_KEY = process.env.MBAODU_APP_KEY || '';
const MBAODU_ORDER_QUERY_URL = 'https://x.mbd.pub/api/order-detail';

export interface MbaoduOrderDetail {
  order_id: string;
  status: 'success' | 'cancel' | 'invalid';
  paid_at: number;
  expire_at: number;
  rounds: number;
  orderamount?: number;
}

export async function queryOrder(orderId: string): Promise<MbaoduOrderDetail | null> {
  if (!MBAODU_APP_KEY) {
    throw new Error('Mbaodu not configured');
  }

  const url = `${MBAODU_ORDER_QUERY_URL}?order_id=${encodeURIComponent(orderId)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-token': MBAODU_APP_KEY,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Mbaodu API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.code !== 200) {
    return null;
  }

  return {
    order_id: data.result.orderid,
    status: data.result.state,
    paid_at: data.result.ordertime,
    expire_at: data.result.expire_at,
    rounds: data.result.rounds,
    orderamount: data.result.orderamount,
  };
}

export function generateActivationCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 12; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}