import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Protected application routes
const PROTECTED_ROUTES = [
  '/control-center',
  '/profile',
  '/resumes',
  '/ats-analyzer',
  '/job-intelligence',
  '/linkedin',
  '/crm',
  '/inbox',
  '/reports',
  '/settings',
  '/integrations',
  '/discovery',
  '/top-opportunities',
  '/applications',
  '/approvals',
  '/interview-prep',
  '/cover-letter',
  '/audit-log'
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get('career_session');

  // Check if accessing a protected route
  const isProtectedRoute = PROTECTED_ROUTES.some((route) =>
    pathname === route || pathname.startsWith(`${route}/`)
  );

  if (isProtectedRoute) {
    if (!sessionCookie?.value) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // If authenticated user visits /login or /register, redirect to /control-center
  if ((pathname === '/login' || pathname === '/register') && sessionCookie?.value) {
    const destination = request.nextUrl.searchParams.get('redirect') || '/control-center';
    return NextResponse.redirect(new URL(destination, request.url));
  }

  return NextResponse.next();
}

export default proxy;

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api routes
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt
     */
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
