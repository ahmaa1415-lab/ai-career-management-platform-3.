import { NextResponse } from 'next/server';
import { approveApplicationPackage } from '@/lib/applications/workflow';
import { getOrCreateDefaultUser } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req, { allowDefaultFallback: true });
    const user = authUser ? authUser : getOrCreateDefaultUser();
    const body = await req.json();
    const { application_id, consent } = body;

    if (!application_id) {
      return NextResponse.json({ error: 'application_id is required' }, { status: 400 });
    }

    if (consent !== true) {
      return NextResponse.json({ error: 'Explicit human consent is required to approve application package.' }, { status: 400 });
    }

    const app = approveApplicationPackage(application_id, user.id, true);
    return NextResponse.json({ success: true, application: app });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
