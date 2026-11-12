import { NextResponse } from 'next/server';
import { sendEmailWithApproval } from '@/lib/email/inbox';
import { getOrCreateDefaultUser } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const user = getOrCreateDefaultUser();
    const body = await req.json();
    const { email_id, confirmed } = body;

    if (!email_id) {
      return NextResponse.json({ error: 'email_id is required' }, { status: 400 });
    }

    if (confirmed !== true) {
      return NextResponse.json({ error: 'Explicit confirmation is required to dispatch an email.' }, { status: 400 });
    }

    const result = sendEmailWithApproval(email_id, true, user.id);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
