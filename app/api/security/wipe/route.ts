import { NextResponse } from 'next/server';
import { wipeAllUserData } from '@/lib/security';
import { getAuthenticatedUser } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    const user = authUser;
    const body = await req.json();

    if (body.confirmation !== 'DELETE ALL MY DATA') {
      return NextResponse.json({ error: 'Explicit phrase "DELETE ALL MY DATA" is required to wipe data.' }, { status: 400 });
    }

    wipeAllUserData(user.id);
    return NextResponse.json({ success: true, message: 'All candidate data wiped successfully.' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
