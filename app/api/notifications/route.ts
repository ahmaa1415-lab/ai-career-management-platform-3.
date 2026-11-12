import { NextResponse } from 'next/server';
import db, { getOrCreateDefaultUser } from '@/lib/db';

export async function GET() {
  try {
    const user = getOrCreateDefaultUser();

    // 1. Fetch recent audit logs as system notifications
    const logs = db.prepare(`
      SELECT * FROM audit_logs
      WHERE user_id = ?
      ORDER BY created_at DESC
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
      ...apps.map(a => ({
        id: `notif_app_${a.id}`,
        type: 'application',
        title: `Application ${a.status}: ${a.title}`,
        description: `${a.employer} • ${a.submission_type} dispatch (${a.match_score}% match).`,
        timestamp: a.updated_at || a.created_at,
        severity: a.status === 'Applied' || a.status === 'Interview' ? 'success' : 'info',
        ref: a.confirmation_reference || null
      })),
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
        timestamp: l.created_at,
        severity: l.action.includes('SECURITY') ? 'warning' : 'info',
        ref: null
      }))
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({
      success: true,
      total_count: notifications.length,
      unread_count: notifications.filter(n => n.severity === 'success' || n.severity === 'warning').length,
      notifications
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
