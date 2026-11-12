import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import db, { logAudit } from '@/lib/db';
import { hashPassword, validatePasswordStrength, validateEmailFormat, createSession, getUserSettings } from '@/lib/auth';
import { isRegistrationAllowed } from '@/lib/staging-security';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { fullName, email, password, confirmPassword, agreeTerms, stagingCode } = body;

    if (!isRegistrationAllowed(stagingCode)) {
      return NextResponse.json(
        { error: 'Registration is restricted in staging mode. A valid staging access code is required.' },
        { status: 403 }
      );
    }

    if (!agreeTerms) {
      return NextResponse.json(
        { error: 'You must accept the terms of service and privacy policy to register.' },
        { status: 400 }
      );
    }

    if (!fullName || fullName.trim().length < 2) {
      return NextResponse.json(
        { error: 'Please enter your full legal or professional name.' },
        { status: 400 }
      );
    }

    if (!email || !validateEmailFormat(email)) {
      return NextResponse.json(
        { error: 'Please enter a valid professional email address.' },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: 'Passwords do not match. Please re-enter your password.' },
        { status: 400 }
      );
    }

    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      return NextResponse.json(
        { error: strength.reason || 'Password does not meet complexity requirements.' },
        { status: 400 }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Check for existing account
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(trimmedEmail);
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email address already exists. Please sign in instead.' },
        { status: 409 }
      );
    }

    const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const passwordHash = hashPassword(password);

    // Create user and associated profile structures in transaction
    const registerTx = db.transaction(() => {
      // 1. Insert user
      db.prepare(`
        INSERT INTO users (id, email, full_name, password_hash, role, is_verified, timezone, language)
        VALUES (?, ?, ?, ?, 'candidate', 1, 'Africa/Cairo', 'en')
      `).run(userId, trimmedEmail, fullName.trim(), passwordHash);

      // 2. Initialize profile
      db.prepare(`
        INSERT INTO profiles (id, user_id, onboarding_completed, headline, skills, languages, target_roles, target_industries)
        VALUES (?, ?, 0, 'Candidate Profile', '[]', '["Arabic", "English"]', '[]', '[]')
      `).run(`prof_${userId}`, userId);

      // 3. Initialize profile locations with NO automatic assumptions (Concept A & B empty by default)
      db.prepare(`
        INSERT INTO profile_locations (id, user_id, current_physical_location, target_countries, target_cities, resume_derived_locations, relocation_willing, visa_sponsorship_required, work_mode_preference)
        VALUES (?, ?, NULL, '[]', '[]', '[]', 0, 0, 'Remote')
      `).run(`loc_${userId}`, userId);

      // 4. Initialize profile permissions
      db.prepare(`
        INSERT INTO profile_permissions (id, user_id, job_research_authorized, cv_analysis_authorized, submit_applications_authorized)
        VALUES (?, ?, 1, 1, 0)
      `).run(`perm_${userId}`, userId);

      // 5. Initialize user settings
      getUserSettings(userId);
    });

    registerTx();

    logAudit('USER_REGISTERED', { userId, email: trimmedEmail, fullName: fullName.trim() }, userId);

    // Create authenticated session
    const session = createSession(userId, {
      rememberMe: true,
      userAgent: req.headers.get('user-agent') || 'Browser',
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1'
    });

    // Set HTTP-only cookie
    const cookieStore = await cookies();
    cookieStore.set('career_session', session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60
    });

    return NextResponse.json({
      success: true,
      message: 'Account registered successfully.',
      user: {
        id: userId,
        email: trimmedEmail,
        full_name: fullName.trim(),
        role: 'candidate',
        is_verified: 1,
        timezone: 'Africa/Cairo',
        language: 'en'
      }
    });
  } catch (err: any) {
    console.error('Registration error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
