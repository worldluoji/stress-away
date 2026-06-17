import { NextResponse } from 'next/server';


export function middleware() {
  
  // Only expose Swagger docs in development mode
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/docs/:path*',
  ],
};
