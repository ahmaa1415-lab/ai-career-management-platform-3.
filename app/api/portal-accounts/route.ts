import { NextResponse } from 'next/server';
import { getCompanyPortalAccounts, getCompanyPortalStats, autoProvisionCompanyPortalAccount } from '@/lib/company-portals';
import { getAuthenticatedUser } from '@/lib/auth';
import { getFullProfile } from '@/lib/onboarding';
import db from '@/lib/db';

export async function GET(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 });
    const user = authUser;
    const stats = getCompanyPortalStats(user.id);

    return NextResponse.json({
      success: true,
      user_id: user.id,
      total: stats.total_accounts,
      active_accounts: stats.active_accounts,
      platforms_breakdown: stats.platforms_breakdown,
      accounts: stats.accounts
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 });
    const user = authUser;
    const body = await req.json();
    const candidate = getFullProfile(user.id);

    if (!candidate) {
      return NextResponse.json({ success: false, error: 'Candidate profile not found' }, { status: 404 });
    }

    if (body.action === 'provision' && body.job_id) {
      const jobRow = db.prepare('SELECT * FROM job_listings WHERE id = ?').get(body.job_id) as any;
      if (!jobRow) {
        return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
      }

      const job = {
        ...jobRow,
        requirements: JSON.parse(jobRow.requirements || '[]')
      };

      const account = autoProvisionCompanyPortalAccount(user.id, job, candidate, body.application_id);
      return NextResponse.json({
        success: true,
        message: `Successfully provisioned company portal account on ${account.portal_platform} for ${job.employer}!`,
        account
      });
    }

    // Default: return updated list
    const stats = getCompanyPortalStats(user.id);
    return NextResponse.json({
      success: true,
      stats
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
