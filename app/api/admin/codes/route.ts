import { NextRequest, NextResponse } from 'next/server';
import { createAdminActivationCode, listAdminActivationCodes, getAdminActivationCode } from '@/lib/subscriptions';
import { generateActivationCode } from '@/lib/mbaodu';
import { verifyAdminToken } from '@/app/api/admin/verify';

export async function POST(request: NextRequest) {
  try {
    const authError = await verifyAdminToken(request);
    if (authError) return authError;

    const body = await request.json().catch(() => ({}));
    const times = parseInt(body.times, 10) || 50;

    const code = generateActivationCode();
    const adminCode = await createAdminActivationCode(code, times);

    return NextResponse.json({
      code: adminCode.code,
      expiresAt: adminCode.expiresAt,
      totalTimes: adminCode.totalTimes,
    });
  } catch (error) {
    console.error('Admin create code error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const authError = await verifyAdminToken(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    if (code) {
      const adminCode = await getAdminActivationCode(code);
      if (!adminCode) {
        return NextResponse.json({ error: 'Code not found' }, { status: 404 });
      }
      return NextResponse.json(adminCode);
    }

    const result = await listAdminActivationCodes(page, limit);
    return NextResponse.json({
      codes: result.codes,
      total: result.total,
      page,
    });
  } catch (error) {
    console.error('Admin list codes error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}