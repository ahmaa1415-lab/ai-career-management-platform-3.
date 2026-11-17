import { NextResponse } from 'next/server';
import db, { logAudit } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = authUser;

    const saved = db.prepare(`
      SELECT s.*, j.title, j.employer, j.location, j.salary_raw, j.freshness_classification, j.verification_status
      FROM saved_opportunities s
      JOIN job_listings j ON s.job_id = j.id
      WHERE s.user_id = ?
      ORDER BY s.saved_at DESC
    `).all(user.id);

    return NextResponse.json({ saved });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = authUser;

    const { job_id, notes } = await req.json();

    if (!job_id) {
      return NextResponse.json({ error: 'job_id is required' }, { status: 400 });
    }

    const id = `saved_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const stmt = db.prepare(`
      INSERT INTO saved_opportunities (id, user_id, job_id, notes)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, job_id) DO UPDATE SET notes = excluded.notes
    `);
    stmt.run(id, user.id, job_id, notes || null);

    logAudit('JOB_OPPORTUNITY_SAVED', { job_id }, user.id);
    return NextResponse.json({ success: true, saved_id: id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = authUser;

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('job_id');

    if (!jobId) {
      return NextResponse.json({ error: 'job_id query param is required' }, { status: 400 });
    }

    db.prepare('DELETE FROM saved_opportunities WHERE user_id = ? AND job_id = ?').run(user.id, jobId);
    logAudit('JOB_OPPORTUNITY_UNSAVED', { job_id: jobId }, user.id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
