import { NextResponse } from 'next/server';
import { getOrCreateDefaultUser } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  getLinkedInAccountConnection,
  runAutonomousLinkedInAgent,
  dispatchMultiChannelApplication
} from '@/lib/linkedin/autonomous-scout';
import { getFullProfile } from '@/lib/onboarding';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req, { allowDefaultFallback: true });
    const user = authUser ? authUser : getOrCreateDefaultUser();
    const candidate = getFullProfile(user.id);
    const connection = getLinkedInAccountConnection(user.id);

    const targetRoles = candidate?.profile?.target_roles?.length
      ? candidate.profile.target_roles
      : [candidate?.profile?.headline || 'Professional Candidate'];

    const targetLocations = candidate?.location?.target_countries?.length
      ? candidate.location.target_countries
      : [];

    return NextResponse.json({
      success: true,
      connection,
      active_target_roles: targetRoles,
      target_locations: targetLocations,
      supported_channels: [
        {
          id: 'gmail',
          name: 'Direct Recruiter Email via Connected Gmail',
          description: 'Extracts recruiter email from post and sends personalized email with tailored Version B CV attached.',
          icon: '✉️'
        },
        {
          id: 'company_portal',
          name: 'Company Career Portal Integration',
          description: 'Opens official career vacancy URL with verified 8-criterion match evaluation.',
          icon: '🌐'
        },
        {
          id: 'linkedin_post_parser',
          name: 'LinkedIn Public Hiring Post Parser',
          description: 'Disaggregates multi-role hiring announcements with direct recruiter email extraction.',
          icon: '💬'
        }
      ]
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req, { allowDefaultFallback: true });
    const user = authUser ? authUser : getOrCreateDefaultUser();
    const candidate = getFullProfile(user.id);
    if (!candidate) {
      return NextResponse.json({ success: false, error: 'Candidate profile not initialized' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'run_scout';

    if (action === 'run_scout') {
      const result = runAutonomousLinkedInAgent(user.id);
      return NextResponse.json(result);
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
