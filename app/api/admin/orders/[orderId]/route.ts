import { NextRequest, NextResponse } from 'next/server';
import { getActivationCodes, setActivationCode } from '@/lib/redis';
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