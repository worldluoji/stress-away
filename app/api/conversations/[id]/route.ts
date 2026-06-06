import { NextRequest, NextResponse } from 'next/server';
import { deleteConversation } from '@/lib/conversations';
import { getAuthContext } from '@/lib/api-auth';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { uid } = await getAuthContext(request);

    if (!uid) {
      return NextResponse.json({ error: 'login_required' }, { status: 401 });
    }

    const { id } = await params;
    await deleteConversation(id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}