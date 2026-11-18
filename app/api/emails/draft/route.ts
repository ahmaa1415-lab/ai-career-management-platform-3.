import { NextResponse } from 'next/server';
import { generateEmailDraft } from '@/lib/email/inbox';
import { getFullProfile } from '@/lib/onboarding';
import { getAuthenticatedUser } from '@/lib/auth';
import db from '@/lib/db';

export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const candidate = getFullProfile(authUser.id);
    if (!candidate) {
      return NextResponse.json({ error: 'Candidate profile required' }, { status: 400 });
    }

    const body = await req.json();
    const { type, target_email, application_id } = body;
    if (!target_email || !target_email.sender) {
      return NextResponse.json({ error: 'Target email details required' }, { status: 400 });
    }

    // Verify application ownership if application_id is provided
    if (application_id) {
      const app = db.prepare('SELECT id, user_id FROM applications WHERE id = ?').get(application_id) as any;
      if (!app || app.user_id !== authUser.id) {
        return NextResponse.json({ error: 'Access Denied: Application does not belong to the authenticated user.' }, { status: 403 });
      }
    }

    const draft = generateEmailDraft(type || 'Reply', target_email, candidate, authUser.id, application_id);
    return NextResponse.json({ success: true, draft });
  } catch (err: any) {
    if (err.message?.includes('Access Denied')) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
