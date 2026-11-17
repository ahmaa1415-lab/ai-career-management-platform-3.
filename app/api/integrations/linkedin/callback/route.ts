import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import db, { logAudit } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = authUser;

    if (error) {
      logAudit('LINKEDIN_OAUTH_FAILED', { error, errorDescription }, user.id);
      return NextResponse.redirect(new URL(`/integrations?error=${encodeURIComponent(errorDescription || error)}`, req.url));
    }

    if (!code || !state) {
      return NextResponse.json({ error: 'Missing code or state parameter.' }, { status: 400 });
    }

    // Verify CSRF state token
    const integ = db.prepare("SELECT * FROM integrations WHERE user_id = ? AND service = 'linkedin'").get(user.id) as any;
    let meta: any = {};
    try { meta = JSON.parse(integ?.metadata || '{}'); } catch {}

    if (!meta.oauth_state || meta.oauth_state !== state) {
      logAudit('LINKEDIN_OAUTH_CSRF_FAILED', { expected: meta.oauth_state, received: state }, user.id);
      return NextResponse.json({ error: 'CSRF state verification failed.' }, { status: 403 });
    }

    const clientId = process.env.LINKEDIN_CLIENT_ID || integ?.client_id;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    const redirectUri = process.env.LINKEDIN_REDIRECT_URI || `${new URL(req.url).origin}/api/integrations/linkedin/callback`;

    if (!clientId || !clientSecret) {
      return NextResponse.json({
        error: 'LinkedIn Client Secret is not configured in the server environment.'
      }, { status: 500 });
    }

    // Exchange code for live token
    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret
      }).toString()
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      return NextResponse.json({
        error: tokenData.error_description || tokenData.error || 'Token exchange failed.'
      }, { status: 400 });
    }

    // Fetch user info with OpenID Connect
    let userInfo: any = {};
    try {
      const userRes = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      if (userRes.ok) {
        userInfo = await userRes.json();
      }
    } catch {}

    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 5184000) * 1000).toISOString();
    const updatedMeta = {
      ...meta,
      access_token: tokenData.access_token,
      expires_at: expiresAt,
      account_name: userInfo.name || user.full_name,
      account_email: userInfo.email || user.email,
      urn: userInfo.sub ? `urn:li:person:${userInfo.sub}` : undefined,
      oauth_state: undefined
    };

    db.prepare(`
      UPDATE integrations
      SET status = 'Connected',
          metadata = ?,
          last_synced_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND service = 'linkedin'
    `).run(JSON.stringify(updatedMeta), user.id);

    logAudit('LINKEDIN_OAUTH_CONNECTED', { userId: user.id, email: userInfo.email }, user.id);

    return NextResponse.redirect(new URL('/integrations?linkedin=connected', req.url));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
