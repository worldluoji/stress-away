import crypto from 'crypto';

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
    let errorText = '';
    try {
      const data = await response.json();
      errorText = JSON.stringify(data);
      console.error(`Mbaodu API error: HTTP ${response.status}, body: ${errorText}`);
    } catch {
      // Failed to parse JSON, get raw text
      errorText = await response.text().catch(() => 'unknown');
      console.error(`Mbaodu API error: HTTP ${response.status}, raw: ${errorText}`);
    }
    throw new MbaoduApiError(`Mbaodu API error: ${response.status}`, response.status);
  }

  let data;
  try {
    data = await response.json();
  } catch (e) {
    console.error('Failed to parse mbaodu response as JSON:', e);
    throw new MbaoduApiError('Invalid JSON response from Mbaodu', 500);
  }

  if (data.code !== 200) {
    // code 400 means bad request (missing order_id)
    // code 403 means auth failed
    console.error(`Mbaodu API error: code=${data.code}, error_info=${data.error_info || ''}`);
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

  // Generate 12 chars of random data (64 bits entropy)
  const bytes = crypto.randomBytes(12);
  let data = '';
  for (const byte of bytes) {
    data += chars[byte % chars.length];
  }

  // Calculate check digits using Mod 97 (ISO 7064)
  // Convert base-32 data to number for checksum
  let num = 0;
  for (const char of data) {
    const val = chars.indexOf(char);
    num = num * 32 + val;
  }
  const checkDigit = (98 - (num % 97)) % 97;
  const checkStr = checkDigit.toString().padStart(2, '0');

  // Format: XXXX-XXXX-XXXX-XX
  return `${data.slice(0, 4)}-${data.slice(4, 8)}-${data.slice(8, 12)}-${checkStr}`;
}

const ACTIVATION_CODE_REGEX = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[0-9]{2}$/;

export function isValidActivationCode(code: string): boolean {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  if (!ACTIVATION_CODE_REGEX.test(code)) {
    return false;
  }

  // Verify check digits
  const parts = code.split('-');
  const data = parts[0] + parts[1] + parts[2];
  const checkStr = parts[3];

  let num = 0;
  for (const char of data) {
    const val = chars.indexOf(char);
    if (val === -1) return false; // Invalid character
    num = num * 32 + val;
  }

  const expectedCheck = (98 - (num % 97)) % 97;
  return parseInt(checkStr, 10) === expectedCheck;
}