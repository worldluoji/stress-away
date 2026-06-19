import { NextRequest, NextResponse } from 'next/server';
import { listConversationsByUid, listConversationsByDevice, saveConversationByUid } from '@/lib/conversations';
import { getAuthContext } from '@/lib/api-auth';
import type { ChatMessage } from '@/lib/models';

export async function GET(request: NextRequest) {
  try {
    const { uid, deviceId } = await getAuthContext(request);
    if (!uid) {
      return NextResponse.json({ error: 'login_required' }, { status: 401 });
    }
    const conversations = await listConversationsByUid(uid);
    // 兼容匿名期间创建的对话：尝试用 deviceId 补充查询
    if (deviceId) {
      const deviceConvs = await listConversationsByDevice(deviceId);
      // 合并去重（以 uid 记录优先，deviceId 记录补充进来）
      const uidIds = new Set(conversations.map(c => c.id));
      const merged = [
        ...conversations,
        ...deviceConvs.filter(c => !uidIds.has(c.id)),
      ];
      return NextResponse.json({ conversations: merged });
    }
    return NextResponse.json({ conversations });
  } catch {
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
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}