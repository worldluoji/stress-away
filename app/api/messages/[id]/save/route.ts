import { NextRequest, NextResponse } from 'next/server';
import { saveMessage, unsaveMessage } from '@/lib/reactions';
import { getAuthContext } from '@/lib/api-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { uid, deviceId } = await getAuthContext(request);
    const { id } = await params;

    if (!uid) {
      return NextResponse.json({ error: 'login_required' }, { status: 401 });
    }

    if (!id) {
      return NextResponse.json({ error: 'message_id required' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const { conversationId, messageIndex, content, scenarioId } = body;

    if (!conversationId || messageIndex === undefined) {
      return NextResponse.json({ error: 'conversationId and messageIndex required' }, { status: 400 });
    }

    await saveMessage(uid, id, conversationId, messageIndex, content || '', scenarioId);
    return NextResponse.json({ saved: true });
  } catch (error) {
    console.error('[save] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { uid, deviceId } = await getAuthContext(request);
    const { id } = await params;

    if (!uid) {
      return NextResponse.json({ error: 'login_required' }, { status: 401 });
    }

    if (!id) {
      return NextResponse.json({ error: 'message_id required' }, { status: 400 });
    }

    await unsaveMessage(uid, id);
    return NextResponse.json({ saved: false });
  } catch (error) {
    console.error('[save] DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}