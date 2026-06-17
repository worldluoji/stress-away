import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  console.log(`Middleware request for: ${pathname}, basePath: ${basePath}`);

  // Only expose Swagger docs in development mode
  if (pathname.startsWith('/docs/') && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // 如果请求路径以 /api 开头，且不包含 basePath，则重写路径
  if (pathname.startsWith('/api/') && basePath !== '' && !pathname.startsWith(basePath)) {
    const newPathname = `${basePath}${pathname}`;
    const url = request.nextUrl.clone();
    url.pathname = newPathname;
    // 直接重写并返回，不再执行后续逻辑（因为路径已修正，无需再处理）
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/docs/:path*',
    '/api/:path*'
  ],
};
