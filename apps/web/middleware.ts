import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Extracts the clinic slug dynamically from custom hostname/domain.
 * - e.g., book.sriswethaclinic.com -> sriswethaclinic
 * - e.g., sriswethaclinic.com -> sriswethaclinic
 */
export function getClinicSlugFromHost(hostname: string): string | null {
  const parts = hostname.split('.');
  if (parts.length < 2) return null;

  const hostLower = hostname.toLowerCase();
  // Bypass for system/development domains
  if (
    hostLower.includes('localhost') ||
    hostLower.includes('vercel.app') ||
    hostLower.includes('turbo.android')
  ) {
    return null;
  }

  // Handle book.clinic-slug.com
  if (parts[0] === 'book') {
    return parts[1];
  }

  // Handle clinic-slug.com
  return parts[0];
}

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hostname = request.headers.get('host') || '';

  // 1. Resolve custom domain root path to the correct clinic's book page
  const customSlug = getClinicSlugFromHost(hostname);
  if (customSlug) {
    if (url.pathname === '/') {
      url.pathname = `/${customSlug}/book`;
      return NextResponse.rewrite(url);
    }
  }

  // 2. Rewrite /book/[clinicSlug] path to /[clinicSlug]/book dynamically
  if (url.pathname.startsWith('/book/')) {
    const parts = url.pathname.split('/');
    const clinicSlug = parts[2];
    if (clinicSlug) {
      url.pathname = `/${clinicSlug}/book`;
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

