import { NextRequest, NextResponse } from 'next/server';
import { getLikedMessages } from '@/lib/reactions';
import { getAuthContext } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const { uid } = await getAuthContext(request);

    if (!uid) {
      return NextResponse.json({ error: 'login_required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 0, 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10) || 0;

    const messages = await getLikedMessages(uid, limit, offset);
    return NextResponse.json({ messages });
  } catch (error) {

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}