import { NextResponse } from 'next/server';
import { getAuthenticatedUser, getUserSettings, updateUserSettings } from '@/lib/auth';
import { logAudit } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    const userId = authUser.id;

    const settings = getUserSettings(userId);
    return NextResponse.json({ success: true, settings });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    const userId = authUser.id;

    const updates = await req.json();
    const updated = updateUserSettings(userId, updates);

    logAudit('SETTINGS_UPDATED', { userId, updates }, userId);

    return NextResponse.json({
      success: true,
      message: 'Preferences updated successfully.',
      settings: updated
    });
  } catch (err: any) {
    console.error('Settings update error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
