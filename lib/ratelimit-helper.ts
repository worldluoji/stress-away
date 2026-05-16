import { NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS, extractClientInfo, RateLimitConfig } from './ratelimit';

export interface RateLimitOptions {
  limitKey: keyof typeof RATE_LIMITS;
  deviceId: string;
}

export async function withRateLimit(
  request: Request,
  options: RateLimitOptions,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const { deviceId } = options;
  const { ip } = extractClientInfo(request, deviceId);
  const config: RateLimitConfig = RATE_LIMITS[options.limitKey];

  const result = await checkRateLimit(deviceId, ip, config);

  if (!result.allowed) {
    return NextResponse.json(
      {
        error: 'rate_limit_exceeded',
        message: '请求过于频繁，请稍后再试',
        resetAt: result.resetAt,
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': result.resetAt.toString(),
          'Retry-After': Math.ceil((result.resetAt - Date.now()) / 1000).toString(),
        },
      }
    );
  }

  const response = await handler();
  response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
  response.headers.set('X-RateLimit-Reset', result.resetAt.toString());
  return response;
}

export function rateLimitError(retryAfter: number) {
  return NextResponse.json(
    {
      error: 'rate_limit_exceeded',
      message: '请求过于频繁，请稍后再试',
    },
    {
      status: 429,
      headers: {
        'Retry-After': retryAfter.toString(),
      },
    }
  );
}