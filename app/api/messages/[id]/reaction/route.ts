import { NextRequest, NextResponse } from 'next/server';
import { addReaction, removeReaction } from '@/lib/reactions';
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

    await addReaction(uid, id);
    return NextResponse.json({ liked: true });
  } catch (error) {
    console.error('[reaction] POST error:', error);
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

    await removeReaction(uid, id);
    return NextResponse.json({ liked: false });
  } catch (error) {
    console.error('[reaction] DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}