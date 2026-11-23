import { NextResponse } from 'next/server';
import { getAllEmails, initializeRecruitmentInbox } from '@/lib/email/inbox';
import { getAuthenticatedUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') || undefined;
    let emails = getAllEmails(category, authUser.id);
    if (emails.length === 0 && (!category || category === 'All')) {
      initializeRecruitmentInbox(authUser.id);
      emails = getAllEmails(category, authUser.id);
    }
    return NextResponse.json({ emails });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
