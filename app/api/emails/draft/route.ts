import { NextResponse } from 'next/server';
import { generateEmailDraft } from '@/lib/email/inbox';
import { getFullProfile } from '@/lib/onboarding';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const candidate = getFullProfile();
    if (!candidate) {
      return NextResponse.json({ error: 'Candidate profile required' }, { status: 400 });
    }

    const { type, target_email } = body;
    if (!target_email || !target_email.sender) {
      return NextResponse.json({ error: 'Target email details required' }, { status: 400 });
    }

    const draft = generateEmailDraft(type || 'Reply', target_email, candidate);
    return NextResponse.json({ success: true, draft });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
