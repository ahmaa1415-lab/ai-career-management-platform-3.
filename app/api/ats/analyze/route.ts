import { NextResponse } from 'next/server';
import { analyzeResume } from '@/lib/ai/ats-analyzer';

import { getFullProfile } from '@/lib/onboarding';
import { getAuthenticatedUser } from '@/lib/auth';
import db from '@/lib/db';

export async function POST(req: Request) {
  try {

    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    const user = authUser;
    const body = await req.json();

    let cvText = body.cv_text || '';
    let resumeId = body.resume_id;
    let resumeVersion = 1;

    if (resumeId) {
      const resumeRecord = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(resumeId, user.id) as any;
      if (resumeRecord) {
        cvText = cvText || resumeRecord.raw_text;
        resumeVersion = resumeRecord.version || 1;
      }
    }

    if (!cvText || cvText.trim().length === 0) {
      const candidate = getFullProfile(user.id);
      cvText = candidate?.master_cv?.raw_text || '';
    }

    const targetRole = body.target_role || 'Category Manager';
    const targetCountry = body.target_country || 'United Arab Emirates';
    const jobDescription = body.job_description;
    const jobId = body.job_id;

    if (!cvText || cvText.trim().length === 0) {
      return NextResponse.json({ error: 'Please enter or paste your CV text to analyze.' }, { status: 400 });
    }

    const result = analyzeResume(
      cvText,
      targetRole,
      targetCountry,
      jobDescription,
      jobId,
      resumeId,
      resumeVersion,
      undefined,
      user.id
    );

    if (resumeId) {
      try {
        db.prepare('UPDATE resumes SET ats_score = ?, ats_report_id = ? WHERE id = ?')
          .run(result.overall_score, result.evaluation_id, resumeId);
      } catch {}
    }

    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
