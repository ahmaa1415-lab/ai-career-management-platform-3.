import { NextResponse } from 'next/server';
import { getOrCreateDefaultUser } from '@/lib/db';
import { runAutonomousApplyEverywhere, getAutopilotStatus } from '@/lib/applications/autonomous-engine';
import { getAuthenticatedUser } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req, { allowDefaultFallback: true });
    const user = authUser ? authUser : getOrCreateDefaultUser();
    const status = getAutopilotStatus(user.id);
    return NextResponse.json({ success: true, autopilot: status });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req, { allowDefaultFallback: true });
    const user = authUser ? authUser : getOrCreateDefaultUser();
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Body is optional
    }

    const result = runAutonomousApplyEverywhere(user.id, {
      minMatchScore: body.minMatchScore !== undefined ? Number(body.minMatchScore) : 70,
      forceAll: body.forceAll === true
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
