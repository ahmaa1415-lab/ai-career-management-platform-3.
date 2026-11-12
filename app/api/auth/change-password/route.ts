import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validateSessionToken, changeUserPassword } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('career_session');
    let userId = 'user_default_01';

    if (sessionCookie?.value) {
      const user = validateSessionToken(sessionCookie.value);
      if (user) {
        userId = user.id;
      }
    }

    const body = await req.json();
    const { currentPassword, newPassword, confirmPassword } = body;

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

    return NextResponse.json({
      success: true,
      message: 'Password changed successfully.'
    });
  } catch (err: any) {
    console.error('Change password error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
