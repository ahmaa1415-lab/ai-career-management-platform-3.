import { NextResponse } from 'next/server';
import { getOrCreateDefaultUser } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  getLinkedInIntegration,
  getLinkedInDetailedStatus,
  updateLinkedInIntegration,
  generateLinkedInOAuthUrl,
  syncLinkedInProfile
} from '@/lib/integrations';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req, { allowDefaultFallback: true });
    const user = authUser ? authUser : getOrCreateDefaultUser();
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    if (action === 'get_oauth_url') {
      const redirectUri = searchParams.get('redirect_uri') || `${new URL(req.url).origin}/api/integrations/linkedin/callback`;
      const oauthData = generateLinkedInOAuthUrl(user.id, redirectUri);
      return NextResponse.json({
        success: true,
        oauth_url: oauthData.authUrl,
        auth_url: oauthData.authUrl,
        state: oauthData.state,
        scopes: 'openid profile email'
      });
    }

    const details = getLinkedInDetailedStatus(user.id);
    const integration = getLinkedInIntegration(user.id);

    return NextResponse.json({
      success: true,
      ...details,
      integration
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req, { allowDefaultFallback: true });
    const user = authUser ? authUser : getOrCreateDefaultUser();
    const body = await req.json();
    const action = body.action || 'save';

    // 1. Generate legitimate OAuth authorization URL
    if (action === 'get_oauth_url') {
      const redirectUri = body.redirect_uri || `${new URL(req.url).origin}/api/integrations/linkedin/callback`;
      const oauthData = generateLinkedInOAuthUrl(user.id, redirectUri);
      return NextResponse.json({
        success: true,
        oauth_url: oauthData.authUrl,
        auth_url: oauthData.authUrl,
        state: oauthData.state,
        scopes: 'openid profile email'
      });
    }

    // 2. Disconnect LinkedIn integration
    if (action === 'disconnect') {
      const updated = updateLinkedInIntegration(user.id, {
        status: 'Not Connected',
        client_secret: '',
        sync_enabled: 0
      });
      return NextResponse.json({
        success: true,
        message: 'LinkedIn account disconnected successfully.',
        integration: updated
      });
    }

    // 3. User-specific SEO keyword sync
    if (action === 'sync') {
      const currentInt = getLinkedInIntegration(user.id);
      if (currentInt.status !== 'Connected') {
        return NextResponse.json({
          success: false,
          error: 'LinkedIn account is not connected. Active OAuth authorization is required before syncing.'
        }, { status: 400 });
      }
      const result = syncLinkedInProfile(user.id);
      return NextResponse.json({
        success: true,
        message: 'LinkedIn profile keywords, headline, and recruiter SEO aligned.',
        integration: result.integration,
        summary: result.summary
      });
    }

    // 4. Auto-apply posts with clear simulation label if in sandbox
    if (action === 'auto_apply_posts') {
      const { runLinkedInPostsAutoApply } = await import('@/lib/applications/autonomous-engine');
      const result = runLinkedInPostsAutoApply(user.id);
      return NextResponse.json({
        success: true,
        message: result.message,
        total_applied: result.total_linkedin_applied,
        applications: result.applications
      });
    }

    // 5. Save configuration
    const updated = updateLinkedInIntegration(user.id, {
      profile_url: body.profile_url,
      client_id: body.client_id,
      client_secret: body.client_secret,
      status: body.status,
      sync_enabled: body.sync_enabled
    });

    const details = getLinkedInDetailedStatus(user.id);

    return NextResponse.json({
      success: true,
      message: 'LinkedIn integration settings updated.',
      ...details,
      integration: updated
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
