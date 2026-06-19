import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hostname = request.headers.get('host') || '';

  // Match the custom subdomain
  if (hostname === 'book.sriswethaclinic.com') {
    // Rewrite root path to the clinic's booking path
    if (url.pathname === '/') {
      url.pathname = '/dr-ravi-clinic/book';
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

// Ensure middleware runs only for page routes, bypassing assets and APIs
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
