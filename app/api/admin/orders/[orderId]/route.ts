import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getActivationCodes, setActivationCode } from '@/lib/subscriptions';
import { generateActivationCode } from '@/lib/mbaodu';
import { isRedisConfigured, getRedis } from '@/lib/redis';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

async function verifyPassword(request: NextRequest): Promise<boolean> {
  const cookie = request.cookies.get('admin_token');
  if (!cookie?.value || cookie.value.length !== 64) return false;
  if (!isRedisConfigured()) return false;
  const key = `admin:token:${crypto.createHash('sha256').update(cookie.value).digest('hex')}`;
  const exists = await getRedis().get<string>(key);
  return exists !== null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  if (!ADMIN_PASSWORD || !verifyPassword(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { orderId } = await params;

  try {
    const codes = await getActivationCodes(orderId);

    return NextResponse.json({
      orderId,
      codes: [
        codes.code1 ? { code: codes.code1.code, used: codes.code1.used, remainingCodes: codes.code1.remainingCodes } : null,
        codes.code2 ? { code: codes.code2.code, used: codes.code2.used, remainingCodes: codes.code2.remainingCodes } : null,
      ].filter(Boolean),
    });
  } catch (error) {
    console.error('Admin query error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  if (!ADMIN_PASSWORD || !verifyPassword(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { orderId } = await params;

  try {
    // Get current codes to inherit remainingCodes
    const currentCodes = await getActivationCodes(orderId);
    const inheritedCodes1 = currentCodes.code1?.remainingCodes ?? 50;
    const inheritedCodes2 = currentCodes.code2?.remainingCodes ?? 50;

    const newCode1 = generateActivationCode();
    const newCode2 = generateActivationCode();

    // Set new codes with inherited remainingCodes for each
    await setActivationCode(orderId, 1, newCode1, inheritedCodes1);
    await setActivationCode(orderId, 2, newCode2, inheritedCodes2);

    return NextResponse.json({
      orderId,
      success: true,
      codes: [
        { code: newCode1, used: false, remainingCodes: inheritedCodes1 },
        { code: newCode2, used: false, remainingCodes: inheritedCodes2 },
      ],
    });
  } catch (error) {
    console.error('Admin regenerate error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}