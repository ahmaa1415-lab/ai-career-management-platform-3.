import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  getUserIntegrations,
  updateIntegrationProfile,
  disconnectIntegration,
  connectIntegration
} from '@/lib/integrations-center';
import db, { logAudit } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    const userId = authUser.id;

    const integrations = getUserIntegrations(userId);

    // Summary statistics
    const stats = {
      total: integrations.length,
      connected: integrations.filter((i) => i.status === 'Connected').length,
      manual_access: integrations.filter((i) => i.status === 'Manual Access').length,
      setup_required: integrations.filter((i) => i.status === 'Setup Required').length,
      not_connected: integrations.filter((i) => i.status === 'Not Connected').length
    };

    return NextResponse.json({
      success: true,
      integrations,
      stats
    });
  } catch (err: any) {
    console.error('Integrations GET error:', err);
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

    const body = await req.json();
    const { action, service, profileUrl, jobUrl, jobTitle, employer } = body;

    if (!service) {
      return NextResponse.json({ error: 'Service identifier is required.' }, { status: 400 });
    }

    if (action === 'disconnect') {
      const res = disconnectIntegration(userId, service);
      return NextResponse.json(res);
    }

    if (action === 'link_profile') {
      if (!profileUrl || !profileUrl.trim().startsWith('http')) {
        return NextResponse.json({ error: 'A valid HTTP/HTTPS profile URL is required.' }, { status: 400 });
      }
      const res = updateIntegrationProfile(userId, service, profileUrl.trim());
      return NextResponse.json(res);
    }

    if (action === 'connect') {
      // Check if credentials are required
      if (service === 'google' && !process.env.GOOGLE_CLIENT_ID) {
        return NextResponse.json({
          success: false,
          status: 'Setup Required',
          message: 'Google OAuth requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.',
          oauth_configured: false
        }, { status: 400 });
      }

      const userStmt = db.prepare('SELECT email, full_name FROM users WHERE id = ?').get(userId) as any;
      const res = connectIntegration(userId, service, {
        accountEmail: body.accountEmail || userStmt?.email || undefined,
        accountName: body.accountName || userStmt?.full_name || undefined,
        profileUrl
      });
      return NextResponse.json(res);
    }

    if (action === 'import_job_url') {
      if (!jobUrl || !jobUrl.trim().startsWith('http')) {
        return NextResponse.json({ error: 'Please provide a valid vacancy URL.' }, { status: 400 });
      }

      const jobId = `job_imp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const importedTitle = jobTitle || 'Commercial / Category Specialist';
      const importedEmployer = employer || `${service.charAt(0).toUpperCase() + service.slice(1)} Partner Employer`;

      db.prepare(`
        INSERT INTO job_listings (
          id, employer, title, location, source, source_url,
          verification_status, freshness_classification, is_verified, raw_description
        ) VALUES (
          ?, ?, ?, 'Dubai, UAE / Cairo, Egypt', ?, ?,
          'Curated Listing', 'Fresh (< 48h)', 1, ?
        )
      `).run(
        jobId,
        importedEmployer,
        importedTitle,
        service.toUpperCase(),
        jobUrl.trim(),
        `Imported vacancy via ${service.toUpperCase()} integration center. Preserved source link: ${jobUrl.trim()}`
      );

      logAudit('EXTERNAL_JOB_URL_IMPORTED', { service, jobUrl, jobId }, userId);

      return NextResponse.json({
        success: true,
        message: `Vacancy successfully imported and attributed to ${service.toUpperCase()}.`,
        job_id: jobId
      });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err: any) {
    console.error('Integrations POST error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
