import { NextRequest, NextResponse } from 'next/server';
import { consumeOne } from '@/lib/subscription';

export async function POST(request: NextRequest) {
  try {
    const deviceId = request.headers.get('x-device-id');

    if (!deviceId) {
      return NextResponse.json({ error: 'Device ID required' }, { status: 400 });
    }

    const result = await consumeOne(deviceId);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Consume error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}