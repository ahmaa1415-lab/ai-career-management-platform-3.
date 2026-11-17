import { NextResponse } from 'next/server';
import { sendEmailWithApproval } from '@/lib/email/inbox';
import { getAuthenticatedUser } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    const user = authUser;
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
