import { NextResponse } from 'next/server';

import { getAuthenticatedUser } from '@/lib/auth';
import {
  getAllConnectedPortals,
  syncPortalIntegration,
  togglePortalIntegrationStatus
} from '@/lib/portal-integrations';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = authUser;
    const portals = getAllConnectedPortals(user.id);
    return NextResponse.json({
      success: true,
      total_platforms: portals.length,
      portals
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = authUser;
    const body = await req.json();
    const service = body.service || 'linkedin';
    const action = body.action || 'sync';

    if (action === 'sync') {
      const res = syncPortalIntegration(user.id, service);
      return NextResponse.json(res);
    }

    if (action === 'toggle_status') {
      const res = togglePortalIntegrationStatus(user.id, service);
      return NextResponse.json(res);
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
