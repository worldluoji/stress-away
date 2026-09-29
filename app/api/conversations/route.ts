import { NextRequest, NextResponse } from 'next/server';
import { listConversationsByUid, saveConversationByUid } from '@/lib/conversations';
import { getAuthContext } from '@/lib/api-auth';
import type { ChatMessage } from '@/lib/models';

export async function GET(request: NextRequest) {
  try {
    const { uid } = await getAuthContext(request);
    if (!uid) {
      return NextResponse.json({ error: 'login_required' }, { status: 401 });
    }
    const conversations = await listConversationsByUid(uid);
    return NextResponse.json({ conversations });
  } catch (err) {
    console.error('[conversations GET]', err);
    return NextResponse.json({ conversations: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { uid, deviceId } = await getAuthContext(request);
    if (!uid) {
      return NextResponse.json({ error: 'login_required' }, { status: 401 });
    }
    const body = await request.json().catch(() => null);
    if (!body?.id) {
      return NextResponse.json({ error: 'missing id' }, { status: 400 });
    }
    const conv = {
      id: body.id,
      title: body.title || '',
      messages: body.messages || [],
      scenarioId: body.scenarioId,
      scenarioAnswers: body.scenarioAnswers,
      createdAt: body.createdAt || Date.now(),
      updatedAt: body.updatedAt || Date.now(),
      deviceId: deviceId || 'unknown',
    } as { id: string; title: string; messages: ChatMessage[]; scenarioId?: string; scenarioAnswers?: Record<string, string>; createdAt: number; updatedAt: number; deviceId: string };
    await saveConversationByUid(conv, uid);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[conversations POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}