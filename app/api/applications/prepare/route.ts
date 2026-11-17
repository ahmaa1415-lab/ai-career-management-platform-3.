import { NextResponse } from 'next/server';
import { prepareApplicationPackage } from '@/lib/applications/workflow';

import { getAuthenticatedUser } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    const user = authUser;

    const body = await req.json();
    const { job_id, resume_id } = body;

    if (!job_id) {
      return NextResponse.json({ error: 'job_id is required' }, { status: 400 });
    }

    const app = prepareApplicationPackage(job_id, user.id, resume_id);
    return NextResponse.json({ success: true, application: app });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
