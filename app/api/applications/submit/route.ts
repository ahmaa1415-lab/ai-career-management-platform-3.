import { NextResponse } from 'next/server';
import { recordCandidateSubmission } from '@/lib/applications/workflow';

import { getAuthenticatedUser } from '@/lib/auth';
import db from '@/lib/db';

export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    const user = authUser;

    if (!user || !user.id) {
      return NextResponse.json({
        error: 'Authentication Required: An active candidate session is required.'
      }, { status: 401 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({
        error: 'Invalid Request: Malformed JSON body.'
      }, { status: 400 });
    }

    const { application_id, notes, candidate_confirmed } = body || {};

    if (!application_id || typeof application_id !== 'string' || !application_id.trim()) {
      return NextResponse.json({
        error: 'Validation Error: application_id is required and must be a non-empty string.'
      }, { status: 400 });
    }

    // Step 3 Requirement: Require candidate_confirmed === true explicitly.
    // Reject missing, false, strings ("true"), numbers (1), or null values.
    if (typeof candidate_confirmed !== 'boolean' || candidate_confirmed !== true) {
      return NextResponse.json({
        error: 'Candidate confirmation is mandatory: candidate_confirmed must explicitly be boolean true.'
      }, { status: 400 });
    }

    // Tenant Ownership & Existence Validation
    const existingApp = db.prepare('SELECT id, user_id, status, human_approved, is_outdated, submission_confirmed FROM applications WHERE id = ?').get(application_id.trim()) as any;
    if (!existingApp) {
      return NextResponse.json({
        error: `Application ${application_id} not found.`
      }, { status: 404 });
    }

    // Cross-tenant protection
    if (existingApp.user_id !== user.id) {
      return NextResponse.json({
        error: 'Access Denied: Candidate does not own this application record.'
      }, { status: 403 });
    }

    // Check approval gate
    if (existingApp.human_approved !== 1) {
      return NextResponse.json({
        error: 'Security Gate Violation: Cannot confirm submission for an application that has not received explicit human approval in Approval Center.'
      }, { status: 400 });
    }

    // Call workflow to record submission (idempotent)
    const sanitizedNotes = typeof notes === 'string' ? notes.trim() : undefined;
    const app = recordCandidateSubmission(
      application_id.trim(),
      user.id,
      true,
      sanitizedNotes
    );

    return NextResponse.json({
      success: true,
      application: app
    }, { status: 200 });

  } catch (err: any) {
    const status = err.message?.includes('Access Denied') ? 403
      : err.message?.includes('not found') ? 404
      : 400;
    return NextResponse.json({ error: err.message }, { status });
  }
}
