import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import db, { logAudit } from '@/lib/db';
import { validateSessionToken, getUserActiveSessions, invalidateAllUserSessions } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('career_session');
    let userId = 'user_default_01';

    if (sessionCookie?.value) {
      const user = validateSessionToken(sessionCookie.value);
      if (user) userId = user.id;
    }

    const sessions = getUserActiveSessions(userId);
    return NextResponse.json({ success: true, sessions });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('career_session');
    let userId = 'user_default_01';

    if (sessionCookie?.value) {
      const user = validateSessionToken(sessionCookie.value);
      if (user) userId = user.id;
    }

    const { searchParams } = new URL(req.url);
    const targetId = searchParams.get('id');
    const all = searchParams.get('all') === 'true';

    if (all) {
      const count = invalidateAllUserSessions(userId);
      // Clear cookie
      cookieStore.set('career_session', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0
      });
      return NextResponse.json({ success: true, message: `Terminated ${count} active sessions.` });
    }

    if (targetId) {
      db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(targetId, userId);
      logAudit('SESSION_REVOKED', { sessionId: targetId }, userId);
      return NextResponse.json({ success: true, message: 'Session terminated.' });
    }

    return NextResponse.json({ error: 'Specify session id or all=true' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
