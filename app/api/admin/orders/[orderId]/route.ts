import { NextRequest, NextResponse } from 'next/server';
import { getActivationCodes, setActivationCodes } from '@/lib/redis';
import { generateActivationCode } from '@/lib/mbaodu';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

function verifyPassword(request: NextRequest): boolean {
  const cookie = request.cookies.get('admin_token');
  return cookie?.value === ADMIN_PASSWORD;
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
        codes.code1 ? { code: codes.code1.code, used: codes.code1.used } : null,
        codes.code2 ? { code: codes.code2.code, used: codes.code2.used } : null,
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
    const newCode1 = generateActivationCode();
    const newCode2 = generateActivationCode();
    await setActivationCodes(orderId, newCode1, newCode2);

    return NextResponse.json({
      orderId,
      success: true,
      codes: [
        { code: newCode1, used: false },
        { code: newCode2, used: false },
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