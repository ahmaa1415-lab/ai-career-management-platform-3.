import db, { logAudit, getOrCreateDefaultUser } from '../db';
import { getFullProfile } from '../onboarding';
import { calculateMatchScore } from '../jobs/matcher';
import { generateTailoredPackage } from '../ai/resume-tailorer';
import { detectPortalRequirement, autoProvisionCompanyPortalAccount } from '../company-portals';
import { ApplicationRecord, JobListing } from '../types';

export function prepareApplicationPackage(jobId: string, userId?: string, resumeId?: string): ApplicationRecord {
  const user = userId ? { id: userId } : getOrCreateDefaultUser();
  const candidate = getFullProfile(user.id, resumeId);
  if (!candidate || !candidate.master_cv) {
    throw new Error('Action Blocked: Candidate has no active resume. Please upload a resume first.');
  }

  // 1. Fetch & Verify Vacancy
  const jobRow = db.prepare('SELECT * FROM job_listings WHERE id = ?').get(jobId) as any;
  if (!jobRow) {
    throw new Error(`Job listing ${jobId} not found.`);
  }
  const job: JobListing = {
    ...jobRow,
    requirements: JSON.parse(jobRow.requirements || '[]')
  };

  const sourceResumeId = resumeId || candidate.master_cv?.id || null;
  const resumeVersion = candidate.master_cv?.version || 1;

  // 2. Check for duplicate existing unsubmitted application
  const existingApp = db.prepare(`
    SELECT * FROM applications 
    WHERE user_id = ? AND job_id = ? AND status IN ('Approval Pending', 'Ready to Apply')
    ORDER BY created_at DESC
  `).get(user.id, jobId) as any;
  if (existingApp) {
    // If application matches current resume and is not marked outdated, reuse it
    if (existingApp.source_resume_id === sourceResumeId && existingApp.is_outdated === 0) {
      return {
        ...existingApp,
        job
      };
    }

    // If application is unsubmitted but outdated or built against a different resume, regenerate it
    const match = calculateMatchScore(candidate, job);
    const tailoredPkg = generateTailoredPackage(candidate, job);
    const cvId = `cv_tailored_${job.id}_${Date.now()}`;
    db.prepare(`
      INSERT INTO resumes (id, user_id, title, type, target_role, target_country, raw_text, ats_score, version, source_text_reference)
      VALUES (?, ?, ?, 'Tailored', ?, ?, ?, ?, 1, ?)
    `).run(
      cvId,
      user.id,
      `Tailored CV for ${job.employer} - ${job.title}`,
      job.title,
      candidate.location.target_countries[0] || 'Remote',
      tailoredPkg.tailored_cv,
      match.overall_score,
      sourceResumeId
    );

    db.prepare(`
      UPDATE applications
      SET tailored_cv_id = ?,
          cover_letter = ?,
          screening_responses = ?,
          match_score = ?,
          match_details_json = ?,
          source_resume_id = ?,
          resume_version = ?,
          is_outdated = 0,
          outdated_reason = NULL,
          status = 'Approval Pending',
          human_approved = 0
      WHERE id = ?
    `).run(
      cvId,
      tailoredPkg.cover_letter,
      JSON.stringify(tailoredPkg.screening_responses),
      match.overall_score,
      JSON.stringify(match),
      sourceResumeId,
      resumeVersion,
      existingApp.id
    );

    logAudit('APPLICATION_REGENERATED', {
      application_id: existingApp.id,
      job_id: job.id,
      employer: job.employer,
      source_resume_id: sourceResumeId,
      resume_version: resumeVersion
    }, user.id);

    const updatedApp = db.prepare('SELECT * FROM applications WHERE id = ?').get(existingApp.id) as any;
    return {
      ...updatedApp,
      job
    };
  }

  // 3. Assess Match & Eligibility
  const match = calculateMatchScore(candidate, job);

  // 4. Generate Tailored Assets (CV, Cover Letter, Screening, Disclosures)
  const tailoredPkg = generateTailoredPackage(candidate, job);

  // 5. Save Tailored CV to Resumes Table
  const cvId = `cv_tailored_${job.id}_${Date.now()}`;
  db.prepare(`
    INSERT INTO resumes (id, user_id, title, type, target_role, target_country, raw_text, ats_score, version, source_text_reference)
    VALUES (?, ?, ?, 'Tailored', ?, ?, ?, ?, 1, ?)
  `).run(
    cvId,
    user.id,
    `Tailored CV for ${job.employer} - ${job.title}`,
    job.title,
    candidate.location.target_countries[0] || 'Remote',
    tailoredPkg.tailored_cv,
    match.overall_score,
    sourceResumeId
  );

  // 6. Create Application record in 'Approval Pending' state
  const appId = `app_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  db.prepare(`
    INSERT INTO applications (
      id, user_id, job_id, status, match_score, match_details_json,
      tailored_cv_id, cover_letter, screening_responses, disclosures_accepted,
      human_approved, submission_type, submission_confirmed,
      source_resume_id, resume_version, is_outdated, outdated_reason
    ) VALUES (?, ?, ?, 'Approval Pending', ?, ?, ?, ?, ?, 1, 0, 'Manual', 0, ?, ?, 0, NULL)
  `).run(
    appId,
    user.id,
    job.id,
    match.overall_score,
    JSON.stringify(match),
    cvId,
    tailoredPkg.cover_letter,
    JSON.stringify(tailoredPkg.screening_responses),
    sourceResumeId,
    resumeVersion
  );

  logAudit('APPLICATION_PREPARED', {
    application_id: appId,
    employer: job.employer,
    title: job.title,
    match_score: match.overall_score,
    source_resume_id: sourceResumeId
  }, user.id);

  const created = db.prepare('SELECT * FROM applications WHERE id = ?').get(appId) as any;
  return {
    ...created,
    job
  };
}

export function approveApplicationPackage(
  applicationId: string,
  userId: string,
  consentGiven: boolean = true
): ApplicationRecord {
  if (!consentGiven) {
    throw new Error('Approval Error: Explicit human consent is mandatory to approve an application package.');
  }

  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId) as any;
  if (!app) {
    throw new Error(`Application ${applicationId} not found.`);
  }

  if (app.is_outdated === 1) {
    throw new Error('Approval Error: This application package was generated from a prior resume version. Please re-tailor or regenerate the package with your current active resume before approval.');
  }

  // Advance state to 'Ready to Apply' upon explicit human authorization
  db.prepare(`
    UPDATE applications
    SET status = 'Ready to Apply',
        human_approved = 1,
        approved_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(applicationId);

  logAudit('APPLICATION_APPROVED_BY_HUMAN', {
    application_id: applicationId,
    consent: true
  }, userId);

  const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId) as any;
  const approvedJobRow = db.prepare('SELECT * FROM job_listings WHERE id = ?').get(updated.job_id) as any;
  return {
    ...updated,
    job: {
      ...approvedJobRow,
      requirements: JSON.parse(approvedJobRow.requirements || '[]')
    }
  };
}

export function recordApplicationSubmission(
  applicationId: string,
  userId: string,
  submissionNotes?: string
): ApplicationRecord {
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId) as any;
  if (!app) {
    throw new Error(`Application ${applicationId} not found.`);
  }

  if (app.is_outdated === 1) {
    throw new Error('Approval Error: This application package was generated from a prior resume version. Please re-tailor or regenerate the package with your current active resume before approval.');
  }
  if (app.human_approved !== 1) {
    throw new Error('Security Violation: Cannot submit an application that has not received explicit human approval in Approval Center.');
  }

  const jobRow = db.prepare('SELECT * FROM job_listings WHERE id = ?').get(app.job_id) as any;
  const job: JobListing = {
    ...jobRow,
    requirements: JSON.parse(jobRow.requirements || '[]')
  };

  const candidate = getFullProfile(userId);
  const portalReq = detectPortalRequirement(job);
  let portalAcc: any = null;

  if (portalReq.requiresAccount && candidate) {
    portalAcc = autoProvisionCompanyPortalAccount(userId, job, candidate, applicationId);
  }

  const finalNotes = submissionNotes || (portalAcc
    ? `Submitted via ${job.employer} (${portalAcc.portal_platform}) company portal. Account created with ${portalAcc.account_email}. Ref: ${portalAcc.confirmation_reference}`
    : 'Application submitted via verified career portal direct link.');

  db.prepare(`
    UPDATE applications
    SET status = 'Applied',
        submission_confirmed = 1,
        external_portal_account_created = ?,
        portal_account_id = ?,
        confirmation_reference = ?,
        applied_at = CURRENT_TIMESTAMP,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    portalAcc ? 1 : 0,
    portalAcc ? portalAcc.id : null,
    portalAcc ? portalAcc.confirmation_reference : null,
    finalNotes,
    applicationId
  );

  logAudit('APPLICATION_SUBMITTED_CONFIRMED', {
    application_id: applicationId,
    timestamp: new Date().toISOString()
  }, userId);

  const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId) as any;
  return {
    ...updated,
    job
  };
}
