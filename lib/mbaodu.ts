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

export class MbaoduApiError extends Error {
  constructor(
    message: string,
    public code: number
  ) {
    super(message);
    this.name = 'MbaoduApiError';
  }
}

export async function queryOrder(orderId: string): Promise<MbaoduOrderDetail | null> {
  if (!MBAODU_APP_KEY) {
    throw new MbaoduApiError('Mbaodu not configured', 500);
  }

  const url = `${MBAODU_ORDER_QUERY_URL}?order_id=${encodeURIComponent(orderId)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-token': MBAODU_APP_KEY,
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 403) {
    throw new MbaoduApiError('Mbaodu authentication failed', 403);
  }

  if (response.status !== 200) {
    throw new MbaoduApiError(`Mbaodu API error: ${response.status}`, response.status);
  }

  const data = await response.json();

  if (data.code !== 200) {
    // code 400 means bad request (missing order_id)
    // code 403 means auth failed
    if (data.code === 400 || data.code === 403) {
      throw new MbaoduApiError(`Mbaodu API error: ${data.code}`, data.code);
    }
    return null;
  }

  const result = data.result;
  if (!result) {
    return null;
  }

  return {
    order_id: result.orderid,
    status: result.state,
    paid_at: result.ordertime,
    expire_at: result.expire_at,
    rounds: result.rounds,
    orderamount: result.orderamount,
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