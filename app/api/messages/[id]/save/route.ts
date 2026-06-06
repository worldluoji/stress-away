import { NextRequest, NextResponse } from 'next/server';
import { saveMessage, unsaveMessage } from '@/lib/reactions';
import { getAuthContext } from '@/lib/api-auth';
import { query } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { uid } = await getAuthContext(request);
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

    // Verify conversation belongs to this user (IDOR check)
    const convRows = await query<{ uid: string | null }>(
      'SELECT uid FROM conversations WHERE id = ?',
      [conversationId]
    );
    if (!convRows.length || (convRows[0].uid !== null && convRows[0].uid !== uid)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    await saveMessage(uid, id, conversationId, messageIndex, content || '', scenarioId);
    return NextResponse.json({ saved: true });
  } catch (error) {

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { uid } = await getAuthContext(request);
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

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}