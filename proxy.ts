import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isMaintenanceActive, createMaintenanceResponse } from './lib/maintenance';

/**
 * Next.js 16 Proxy Convention (formerly Middleware)
 *
 * Intercepts incoming requests before route handlers execute.
 * When maintenance mode is active:
 * - All mutating HTTP methods (POST, PUT, PATCH, DELETE) are intercepted and rejected with HTTP 503.
 * - Safe read-only methods (GET, HEAD, OPTIONS) are permitted through to allow health probes,
 *   monitoring, and static frontend assets.
 */

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function proxy(request: NextRequest) {
  const method = request.method.toUpperCase();

  // If request is mutating, evaluate maintenance lock state
  if (MUTATING_METHODS.has(method)) {
    if (isMaintenanceActive()) {
      return createMaintenanceResponse();
    }
  }

  return NextResponse.next();
}

/**
 * Matcher configuration:
 * Targets API routes while excluding static Next.js assets, public images, and favicons.
 */
export const config = {
  matcher: [
    '/api/:path*',
  ],
};
