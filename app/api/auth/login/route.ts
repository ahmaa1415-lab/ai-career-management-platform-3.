import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import db, { logAudit } from '@/lib/db';
import { verifyPassword, createSession, ensureDefaultUserCredentials } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    ensureDefaultUserCredentials();
    const body = await req.json();
    const { email, password, rememberMe } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Look up user by email (supports primary candidate aliases)
    let user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(trimmedEmail) as any;
    if (!user && trimmedEmail === 'candidate@example.com') {
      user = db.prepare("SELECT * FROM users WHERE id = 'user_default_01'").get() as any;
      if (user) {
        db.prepare("UPDATE users SET email = ? WHERE id = 'user_default_01'").run(trimmedEmail);
        user.email = trimmedEmail;
      }
    }

    if (!user) {
      // Safe generic message to avoid email enumeration
      logAudit('LOGIN_FAILED_UNKNOWN_EMAIL', { email: trimmedEmail });
      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    // Verify password hash
    const isValidPassword = verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      logAudit('LOGIN_FAILED_BAD_PASSWORD', { userId: user.id, email: user.email }, user.id);
      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    // Create session in DB
    const session = createSession(user.id, {
      rememberMe: Boolean(rememberMe),
      userAgent: req.headers.get('user-agent') || 'Browser',
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1'
    });

    // Set HTTP-only session cookie
    const cookieStore = await cookies();
    const maxAgeSeconds = rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60;
    cookieStore.set('career_session', session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: maxAgeSeconds
    });

    logAudit('LOGIN_SUCCESS', { userId: user.id, email: user.email }, user.id);

    return NextResponse.json({
      success: true,
      message: 'Authenticated successfully.',
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role || 'candidate',
        is_verified: user.is_verified ?? 1,
        profile_image: user.profile_image,
        timezone: user.timezone || 'Africa/Cairo',
        language: user.language || 'en'
      }
    });
  } catch (err: any) {
    console.error('Login error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
