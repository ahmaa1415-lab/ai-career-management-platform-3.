import { NextResponse } from 'next/server';
import { validatePasswordResetToken, consumePasswordResetToken } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ valid: false, error: 'Token is required.' }, { status: 400 });
    }

    const validation = validatePasswordResetToken(token);
    if (!validation.valid) {
      return NextResponse.json({ valid: false, error: validation.error }, { status: 400 });
    }

    return NextResponse.json({ valid: true, message: 'Token is valid.' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { token, password, confirmPassword } = body;

    if (!token) {
      return NextResponse.json({ error: 'Reset token is required.' }, { status: 400 });
    }

    if (!password || !confirmPassword) {
      return NextResponse.json({ error: 'Password and password confirmation are required.' }, { status: 400 });
    }

    if (password !== confirmPassword) {
      return NextResponse.json({ error: 'Passwords do not match.' }, { status: 400 });
    }

    const result = consumePasswordResetToken(token, password);
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to reset password.' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Your password has been reset successfully. Please sign in with your new password.'
    });
  } catch (err: any) {
    console.error('Reset password error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
