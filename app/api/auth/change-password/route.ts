import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import db from '@/lib/db';
import { getAuthenticatedUser, changeUserPassword, hashToken } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    const userId = authUser.id;

    const body = await req.json();
    const { currentPassword, newPassword, confirmPassword, revokeOtherSessions } = body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { error: 'Current password, new password, and confirmation are required.' },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: 'New password and confirmation do not match.' },
        { status: 400 }
      );
    }

    const result = changeUserPassword(userId, currentPassword, newPassword);
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to change password.' }, { status: 400 });
    }

    // Security enhancement: Revoke other active sessions to fence compromised tokens
    try {
      const cookieStore = await cookies();
      const currentToken = cookieStore.get('career_session')?.value;
      if (currentToken) {
        const currentHash = hashToken(currentToken);
        db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(userId, currentHash);
      }
    } catch {
      // In case session revocation check encounters an issue, password update has already completed safely
    }

    return NextResponse.json({
      success: true,
      message: 'Password changed successfully.'
    });
  } catch (err: any) {
    console.error('Change password error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
