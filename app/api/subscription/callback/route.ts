import { NextRequest, NextResponse } from 'next/server';
import { setActivationCodes, markOrderActivated, isOrderActivated } from '@/lib/redis';
import { generateActivationCode } from '@/lib/mbaodu';

interface CallbackBody {
  order_id: string;
  state: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: CallbackBody = await request.json();
    const { order_id, state } = body;

    if (!order_id) {
      return NextResponse.json({ error: 'Missing order_id' }, { status: 400 });
    }

    if (state !== 1) {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 400 });
    }

    const alreadyActivated = await isOrderActivated(order_id);
    if (alreadyActivated) {
      return NextResponse.json({ success: true, message: 'Already processed' });
    }

    const code1 = generateActivationCode();
    const code2 = generateActivationCode();

    await setActivationCodes(order_id, code1, code2);
    await markOrderActivated(order_id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Mbaodu callback error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}