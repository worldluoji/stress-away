import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { kvGet } from '@/lib/kv';

export async function verifyAdminToken(request: NextRequest): Promise<NextResponse | null> {
  const cookie = request.cookies.get('admin_token');
  if (!cookie?.value || cookie.value.length !== 64) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const key = `admin:token:${crypto.createHash('sha256').update(cookie.value).digest('hex')}`;
  const exists = await kvGet<string>(key);
  if (!exists) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
  return null; // Valid token
}