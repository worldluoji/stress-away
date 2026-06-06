import { NextRequest, NextResponse } from 'next/server';

// Callback route disabled — payment flow uses /api/subscription/mbaodu/activate instead.
// This endpoint intentionally returns 410 Gone to indicate it's no longer in use.
export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { error: 'endpoint_discontinued', message: '此接口已停用，请使用激活页面激活' },
    { status: 410 }
  );
}