import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { isRedisConfigured, getRedis } from '@/lib/redis';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

export async function verifyAdminToken(request: NextRequest): Promise<NextResponse | null> {
  const cookie = request.cookies.get('admin_token');
  if (!cookie?.value || cookie.value.length !== 64) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Admin not configured' }, { status: 500 });
  }

  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Redis not configured' }, { status: 500 });
  }

  const key = `admin:token:${crypto.createHash('sha256').update(cookie.value).digest('hex')}`;
  const exists = await getRedis().get<string>(key);
  if (!exists) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
  return null; // Valid token
}