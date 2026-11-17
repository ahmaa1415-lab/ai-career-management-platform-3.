import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { classifyApplicationLifecycle } from '@/lib/applications/lifecycle';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    const user = authUser;

    // 1. Fetch recent audit logs as system notifications (schema uses 'timestamp' column)
    const logs = db.prepare(`
      SELECT * FROM audit_logs
      WHERE user_id = ?
      ORDER BY timestamp DESC
      LIMIT 25
    `).all(user.id) as any[];

    // 2. Fetch applications with recent activity
    const apps = db.prepare(`
      SELECT a.*, j.employer, j.title
      FROM applications a
      JOIN job_listings j ON a.job_id = j.id
      WHERE a.user_id = ?
      ORDER BY a.updated_at DESC
      LIMIT 15
    `).all(user.id) as any[];

    // 3. Fetch recruiter emails
    const emails = db.prepare(`
      SELECT * FROM emails
      ORDER BY created_at DESC
      LIMIT 10
    `).all() as any[];

    const notifications = [
      ...apps.map(a => {
        const lifecycle = classifyApplicationLifecycle(a);
        const getTitle = () => {
          switch (lifecycle) {
            case 'Employer Confirmation Independently Verified':
              return `Application Verified by Employer: ${a.title}`;
            case 'Submitted by Candidate':
              return `Application Submitted by Candidate: ${a.title}`;
            case 'Candidate Evidence Provided':
              return `Confirmation Evidence Uploaded: ${a.title}`;
            case 'Legacy Applied – Unverified':
              return `Application Legacy Unverified: ${a.title}`;
            default:
              return `Application ${lifecycle}: ${a.title}`;
          }
        };
        const getDescription = () => {
          switch (lifecycle) {
            case 'Employer Confirmation Independently Verified':
              return `${a.employer} • Independently verified employer receipt (${a.match_score}% match).`;
            case 'Submitted by Candidate':
              return `${a.employer} • Candidate confirmed direct submission (${a.match_score}% match).`;
            case 'Candidate Evidence Provided':
              return `${a.employer} • Supporting evidence uploaded (${a.match_score}% match).`;
            case 'Legacy Applied – Unverified':
              return `${a.employer} • Legacy unverified historical record (${a.match_score}% match).`;
            default:
              return `${a.employer} • Tailored package prepared (${a.match_score}% match).`;
          }
        };
        const getSeverity = () => {
          if (lifecycle === 'Employer Confirmation Independently Verified' || lifecycle === 'Submitted by Candidate' || lifecycle === 'Interview') return 'success';
          if (lifecycle === 'Legacy Applied – Unverified') return 'warning';
          return 'info';
        };

        return {
          id: `notif_app_${a.id}`,
          type: 'application',
          title: getTitle(),
          description: getDescription(),
          timestamp: a.updated_at || a.created_at,
          severity: getSeverity(),
          ref: a.confirmation_reference || null
        };
      }),
      ...emails.map(e => ({
        id: `notif_email_${e.id}`,
        type: 'email',
        title: `Recruiter Mailbox: ${e.category}`,
        description: `Subject: "${e.subject}" from ${e.sender}`,
        timestamp: e.created_at,
        severity: e.category === 'Interview' || e.category === 'Offer' ? 'success' : 'info',
        ref: null
      })),
      ...logs.slice(0, 10).map(l => ({
        id: `notif_log_${l.id}`,
        type: 'system',
        title: `Security & Activity Audit`,
        description: `${l.action.replace(/_/g, ' ')}`,
        timestamp: l.timestamp,
        severity: l.action.includes('SECURITY') ? 'warning' : 'info',
        ref: null
      }))
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({
      success: true,
      total_count: notifications.length,
      unread_count: notifications.filter(n => n.severity === 'success' || n.severity === 'warning').length,
      notifications
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
