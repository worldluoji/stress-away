import { NextRequest, NextResponse } from 'next/server';
import { getActivationCodes, setActivationCode } from '@/lib/subscriptions';
import { generateActivationCode } from '@/lib/mbaodu';
import { verifyAdminToken } from '@/app/api/admin/verify';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const authError = await verifyAdminToken(request);
  if (authError) return authError;

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
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const authError = await verifyAdminToken(request);
  if (authError) return authError;

  const { orderId } = await params;

  try {
    const currentCodes = await getActivationCodes(orderId);
    const inheritedCodes1 = currentCodes.code1?.remainingCodes ?? 50;
    const inheritedCodes2 = currentCodes.code2?.remainingCodes ?? 50;

    const newCode1 = generateActivationCode();
    const newCode2 = generateActivationCode();

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
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}