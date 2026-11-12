import { NextResponse } from 'next/server';
import { wipeAllUserData } from '@/lib/security';
import { getOrCreateDefaultUser } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const user = getOrCreateDefaultUser();
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
