import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validateSessionToken } from '@/lib/auth';
import { getOrCreateDefaultUser } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('career_session');

    if (!sessionCookie?.value) {
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
      if (url.searchParams.get('fallback') === 'default') {
        const defaultUser = getOrCreateDefaultUser();
        return NextResponse.json({ authenticated: true, user: defaultUser });
      }

      return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
    }

    const user = validateSessionToken(sessionCookie.value);
    if (!user) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
    }

    return NextResponse.json({ authenticated: true, user });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
