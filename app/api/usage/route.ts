import { NextRequest, NextResponse } from 'next/server';
import { checkUsage } from '@/lib/subscription';

export async function GET(request: NextRequest) {
  try {
    const deviceId = request.headers.get('x-device-id');

    if (!deviceId) {
      return NextResponse.json({ error: 'Device ID required' }, { status: 400 });
    }

    const usage = await checkUsage(deviceId);

    return NextResponse.json(usage);
  } catch (error) {
    console.error('Usage check error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}