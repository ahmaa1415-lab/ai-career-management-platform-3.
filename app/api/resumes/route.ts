import { NextResponse } from 'next/server';
import db, { getOrCreateDefaultUser, setActiveResume } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { analyzeResume } from '@/lib/ai/ats-analyzer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req, { allowDefaultFallback: true });
    const user = authUser ? authUser : getOrCreateDefaultUser();
    const url = new URL(req.url);
    const resumeId = url.searchParams.get('id');

    if (resumeId) {
      const resume = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(resumeId, user.id) as any;
      if (!resume) {
        return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
      }

      const extractedProfile = db.prepare(`
        SELECT * FROM extracted_profiles
        WHERE resume_id = ? OR id = ?
        LIMIT 1
      `).get(resumeId, resume.extracted_profile_id || '') as any;

      const evaluation = db.prepare(`
        SELECT * FROM cv_evaluations
        WHERE resume_id = ? OR id = ?
        ORDER BY evaluation_date DESC
        LIMIT 1
      `).get(resumeId, resume.ats_report_id || '') as any;

      return NextResponse.json({
        resume,
        extracted_profile: extractedProfile ? {
          ...extractedProfile,
          experiences: JSON.parse(extractedProfile.experiences_json || '[]'),
          education: JSON.parse(extractedProfile.education_json || '[]'),
          certifications: JSON.parse(extractedProfile.certifications_json || '[]'),
          skills: JSON.parse(extractedProfile.skills_json || '[]'),
          languages: JSON.parse(extractedProfile.languages_json || '[]'),
          industries: JSON.parse(extractedProfile.industries_json || '[]'),
        } : null,
        ats_evaluation: evaluation ? {
          ...evaluation,
          criterion_scores: JSON.parse(evaluation.criterion_scores_json || '{}'),
          evidence: JSON.parse(evaluation.evidence_json || '{}'),
          recommendations: JSON.parse(evaluation.recommendations_json || '[]')
        } : null
      }, {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }
      });
    }

    const resumes = db.prepare(`
      SELECT * FROM resumes
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(user.id);

    const userRow = db.prepare('SELECT active_resume_id FROM users WHERE id = ?').get(user.id) as any;
    const activeResumeId = userRow?.active_resume_id || (resumes[0] as any)?.id || null;

    return NextResponse.json(
      { resumes, active_resume_id: activeResumeId },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req, { allowDefaultFallback: true });
    const user = authUser ? authUser : getOrCreateDefaultUser();
    const body = await req.json();
    const { resume_id } = body;
    if (!resume_id) {
      return NextResponse.json({ error: 'resume_id is required' }, { status: 400 });
    }
    const resume = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(resume_id, user.id) as any;
    if (!resume) {
      return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
    }
    setActiveResume(user.id, resume_id);

    // Sync profile with activated resume
    const extractedRow = db.prepare(`
      SELECT * FROM extracted_profiles
      WHERE resume_id = ? OR id = ?
      LIMIT 1
    `).get(resume_id, resume.extracted_profile_id || '') as any;

    if (extractedRow) {
      if (extractedRow.candidate_name && extractedRow.candidate_name !== 'Candidate') {
        db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(extractedRow.candidate_name, user.id);
      }
      if (extractedRow.email) {
        try { db.prepare('UPDATE users SET email = ? WHERE id = ?').run(extractedRow.email, user.id); } catch {}
      }
      db.prepare(`
        UPDATE profiles SET
          headline = ?,
          experience_years = ?,
          skills = ?,
          target_seniority = ?,
          active_resume_id = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(
        extractedRow.current_headline,
        extractedRow.total_experience_years || 5,
        extractedRow.skills_json || '[]',
        extractedRow.detected_seniority || 'Senior',
        resume_id,
        user.id
      );
    }

    return NextResponse.json(
      { success: true, active_resume_id: resume_id },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req, { allowDefaultFallback: true });
    const user = authUser ? authUser : getOrCreateDefaultUser();
    const body = await req.json();

    const title = body.title || 'Custom Resume';
    const type = body.type || 'Tailored';
    const rawText = body.raw_text || '';
    const targetRole = body.target_role || 'Senior Professional';
    const targetCountry = body.target_country || 'International';

    const id = body.id || `cv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Calculate ATS score with explicit resume isolation
    const atsResult = analyzeResume(
      rawText,
      targetRole,
      targetCountry,
      undefined,
      undefined,
      id,
      1,
      undefined,
      user.id
    );

    db.prepare(`
      INSERT INTO resumes (id, user_id, title, type, target_role, target_country, raw_text, ats_score, version, ats_report_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        raw_text = excluded.raw_text,
        ats_score = excluded.ats_score,
        ats_report_id = excluded.ats_report_id,
        version = version + 1
    `).run(id, user.id, title, type, targetRole, targetCountry, rawText, atsResult.overall_score, atsResult.evaluation_id);

    const saved = db.prepare('SELECT * FROM resumes WHERE id = ?').get(id);
    return NextResponse.json({ success: true, resume: saved, ats: atsResult });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
