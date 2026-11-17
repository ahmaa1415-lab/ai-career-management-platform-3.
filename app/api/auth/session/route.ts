import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validateSessionToken } from '@/lib/auth';
import { getOrCreateDefaultUser } from '@/lib/db';

export async function GET(req: Request) {
  try {
    let sessionToken: string | undefined;
    try {
      const cookieStore = await cookies();
      sessionToken = cookieStore.get('career_session')?.value;
    } catch (_) {
      // Outside async request store (e.g. test runner)
    }

    if (!sessionToken) {
      const cookieHeader = req.headers.get('cookie');
      if (cookieHeader) {
        const match = cookieHeader.match(/career_session=([^;]+)/);
        if (match) sessionToken = match[1].trim();
      }
    }

    if (!sessionToken) {
      // Check Authorization header fallback
      const authHeader = req.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const user = validateSessionToken(token);
        if (user) {
          return NextResponse.json({ authenticated: true, user });
        }
      }

      // Check if candidate session fallback requested
      const url = new URL(req.url);
      if (url.searchParams.get('fallback') === 'default' && process.env.NODE_ENV !== 'production') {
        const defaultUser = getOrCreateDefaultUser();
        return NextResponse.json({ authenticated: true, user: defaultUser });
      }

      return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
    }

    const user = validateSessionToken(sessionToken);
    if (!user) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
    }

    return NextResponse.json({ authenticated: true, user });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
