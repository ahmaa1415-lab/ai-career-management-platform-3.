import { NextResponse } from 'next/server';
import { getFullProfile, saveOnboarding } from '@/lib/onboarding';
import { getAuthenticatedUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    const userId = authUser.id;
    const { searchParams } = new URL(req.url);
    const resumeId = searchParams.get('resume_id') || undefined;
    const full = getFullProfile(userId, resumeId);
    return NextResponse.json(full || {}, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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

    const updated = saveOnboarding(userId, {
      profile: body.profile || {},
      location: body.location || {},
      permissions: body.permissions || {
        job_research_authorized: 1,
        cv_analysis_authorized: 1,
        read_emails_authorized: 1,
        draft_emails_authorized: 1,
        disclose_data_authorized: 1,
        scheduled_automation_desired: 1
      },
      cvText: body.cvText
    });

    return NextResponse.json({ success: true, profile: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
