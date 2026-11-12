import { NextResponse } from 'next/server';
import { generateDailyExecutiveReport, getAllDailyReports } from '@/lib/automation/daily-report';
import { getOrCreateDefaultUser } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req, { allowDefaultFallback: true });
    const user = authUser ? authUser : getOrCreateDefaultUser();
    const reports = getAllDailyReports();
    return NextResponse.json({ reports });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req, { allowDefaultFallback: true });
    const user = authUser ? authUser : getOrCreateDefaultUser();
    const report = generateDailyExecutiveReport(user.id);
    return NextResponse.json({ success: true, report });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
