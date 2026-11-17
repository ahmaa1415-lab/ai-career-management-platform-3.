import { NextResponse } from 'next/server';
import { parseLinkedInHiringPost, applyToLinkedInPostRole } from '@/lib/linkedin-post-parser';
import { getAuthenticatedUser } from '@/lib/auth';
import { getFullProfile } from '@/lib/onboarding';
import db, { logAudit } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 });
    const user = authUser;
    const candidate = getFullProfile(user.id);
    const body = await req.json();

    const postText = body.post_text || body.postText;
    if (!postText || typeof postText !== 'string' || postText.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'post_text or postText is required' }, { status: 400 });
    }

    const analysis = parseLinkedInHiringPost(postText, candidate || undefined);

    // If requested, index disaggregated jobs into the active database
    if (body.auto_index || body.autoIndex || body.auto_index !== false) {
      const insertStmt = db.prepare(`
        INSERT INTO job_listings (
          id, employer, title, location, source, source_url, publication_date,
          salary_raw, requirements, experience_required_years, seniority,
          visa_sponsorship, remote_eligibility, is_verified, application_type,
          portal_platform, raw_description
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          location = excluded.location,
          raw_description = excluded.raw_description,
          requirements = excluded.requirements
      `);

      db.transaction(() => {
        for (const job of analysis.disaggregated_jobs) {
          insertStmt.run(
            job.id,
            job.employer,
            job.title,
            job.location,
            job.source,
            job.source_url,
            job.publication_date,
            job.salary_raw || 'Competitive',
            JSON.stringify(job.requirements),
            job.experience_required_years,
            job.seniority,
            job.visa_sponsorship,
            job.remote_eligibility,
            1,
            job.application_type || 'recruiter_post',
            job.portal_platform || 'Direct Email',
            job.raw_description
          );
        }
      })();

      logAudit('LINKEDIN_POST_ROLES_INDEXED', {
        employer: analysis.employer,
        roles_count: analysis.extracted_roles.length,
        recruiter_email: analysis.recruiter_email
      }, user.id);
    }

    // If a specific role is requested to auto-apply immediately
    let applicationResult: any = null;
    if (body.auto_apply_role && analysis.recruiter_email && candidate) {
      const targetJob = analysis.disaggregated_jobs.find(
        j => j.title.toLowerCase().includes(body.auto_apply_role.toLowerCase())
      ) || analysis.disaggregated_jobs[0];

      if (targetJob) {
        applicationResult = applyToLinkedInPostRole(
          user.id,
          targetJob,
          analysis.recruiter_email,
          candidate,
          analysis.recruiter_name
        );
      }
    }

    return NextResponse.json({
      success: true,
      analysis,
      application_result: applicationResult,
      message: `Successfully parsed LinkedIn post from ${analysis.employer}. Disaggregated ${analysis.extracted_roles.length} role(s) with direct contact: ${analysis.recruiter_email || 'N/A'}.`
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
