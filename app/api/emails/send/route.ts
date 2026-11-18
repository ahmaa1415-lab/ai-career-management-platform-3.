import { NextResponse } from 'next/server';
import { sendEmailWithApproval } from '@/lib/email/inbox';
import { getAuthenticatedUser } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { email_id, confirmed } = body;

    if (!email_id) {
      return NextResponse.json({ error: 'email_id is required' }, { status: 400 });
    }

    if (confirmed !== true) {
      return NextResponse.json({ error: 'Explicit confirmation is required to dispatch an email.' }, { status: 400 });
    }

    const result = sendEmailWithApproval(email_id, true, authUser.id);
    return NextResponse.json(result);
  } catch (err: any) {
    if (err.message?.startsWith('NOT_FOUND')) {
      return NextResponse.json({ error: 'Email not found.' }, { status: 404 });
    }
    if (err.message?.startsWith('ACCESS_DENIED')) {
      return NextResponse.json({ error: 'Access Denied: You do not have permission to send this email.' }, { status: 403 });
    }
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
