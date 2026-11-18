import { NextResponse } from 'next/server';
import db, { logAudit } from '@/lib/db';
import { getAuthenticatedUser, validateEmailFormat } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    const userId = authUser.id;

    const user = db.prepare('SELECT id, email, full_name, role, is_verified, profile_image, timezone, language FROM users WHERE id = ?').get(userId);
    return NextResponse.json({ success: true, user });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    const userId = authUser.id;

    const body = await req.json();
    const { fullName, email, timezone, language, profileImage } = body;

    if (!fullName || fullName.trim().length < 2) {
      return NextResponse.json({ error: 'Full name must be at least 2 characters.' }, { status: 400 });
    }

    if (!email || !validateEmailFormat(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Check if email changed and is taken by another user
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ? AND id != ?').get(trimmedEmail, userId);
    if (existing) {
      return NextResponse.json({ error: 'This email is already in use by another account.' }, { status: 409 });
    }

    db.prepare(`
      UPDATE users
      SET full_name = ?,
          email = ?,
          timezone = COALESCE(?, timezone),
          language = COALESCE(?, language),
          profile_image = COALESCE(?, profile_image),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      fullName.trim(),
      trimmedEmail,
      timezone || 'Africa/Cairo',
      language || 'en',
      profileImage || null,
      userId
    );

    logAudit('USER_PROFILE_UPDATED', { userId, email: trimmedEmail, fullName: fullName.trim() }, userId);

    return NextResponse.json({
      success: true,
      message: 'Personal profile settings saved successfully.'
    });
  } catch (err: any) {
    console.error('Settings profile error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
