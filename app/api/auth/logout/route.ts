import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { invalidateSessionToken } from '@/lib/auth';
import { logAudit } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('career_session');

    if (sessionCookie?.value) {
      invalidateSessionToken(sessionCookie.value);
    }

    // Clear session cookie
    cookieStore.set('career_session', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0
    });

    logAudit('LOGOUT_SUCCESS', { timestamp: new Date().toISOString() });

    return NextResponse.json({
      success: true,
      message: 'Logged out successfully.'
    });
  } catch (err: any) {
    console.error('Logout error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
