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
    WHERE user_id = ? AND job_id = ? AND status IN ('Package Prepared', 'Awaiting Approval', 'Approval Pending', 'Ready for Candidate Submission', 'Ready to Apply')
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
          status = 'Package Prepared',
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

  // 6. Create Application record in 'Package Prepared' state (truthful lifecycle)
  const appId = `app_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  db.prepare(`
    INSERT INTO applications (
      id, user_id, job_id, status, match_score, match_details_json,
      tailored_cv_id, cover_letter, screening_responses, disclosures_accepted,
      human_approved, submission_type, submission_confirmed,
      source_resume_id, resume_version, is_outdated, outdated_reason
    ) VALUES (?, ?, ?, 'Package Prepared', ?, ?, ?, ?, ?, 1, 0, 'Manual', 0, ?, ?, 0, NULL)
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

  if (app.user_id !== userId) {
    throw new Error('Access Denied: Candidate does not own this application record.');
  }

  if (app.is_outdated === 1) {
    throw new Error('Approval Error: This application package was generated from a prior resume version. Please re-tailor or regenerate the package with your current active resume before approval.');
  }

  // Advance state to 'Ready for Candidate Submission' upon explicit human authorization
  db.prepare(`
    UPDATE applications
    SET status = 'Ready for Candidate Submission',
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

/**
 * Records an explicit candidate confirmation that the application was submitted on the employer's official career portal.
 * This guarantees truthfulness: an application is NEVER marked as submitted without explicit candidate confirmation.
 */
export function recordCandidateSubmission(
  applicationId: string,
  userId: string,
  candidateConfirmed: boolean = true,
  submissionNotes?: string
): ApplicationRecord {
  if (!candidateConfirmed) {
    throw new Error('Candidate confirmation is mandatory to confirm that the application was submitted on the official employer portal.');
  }

  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId) as any;
  if (!app) {
    throw new Error(`Application ${applicationId} not found.`);
  }

  if (app.user_id !== userId) {
    throw new Error('Access Denied: Candidate does not own this application record.');
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

  // Idempotency: if already confirmed by candidate, return existing record without duplicate updates or audit logs
  if (app.status === 'Submitted by Candidate' && app.submission_confirmed === 1) {
    return {
      ...app,
      job
    };
  }

  const finalNotes = submissionNotes || 'Candidate confirmed direct submission on official employer career portal.';

  db.prepare(`
    UPDATE applications
    SET status = 'Submitted by Candidate',
        submission_confirmed = 1,
        applied_at = CURRENT_TIMESTAMP,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    finalNotes,
    applicationId
  );

  logAudit('APPLICATION_SUBMITTED_BY_CANDIDATE', {
    application_id: applicationId,
    candidate_confirmed: true,
    timestamp: new Date().toISOString()
  }, userId);

  const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId) as any;
  return {
    ...updated,
    job
  };
}

/**
 * Backward compatibility alias for legacy callers
 */
export const recordApplicationSubmission = (
  applicationId: string,
  userId: string,
  submissionNotes?: string
): ApplicationRecord => {
  return recordCandidateSubmission(applicationId, userId, true, submissionNotes);
};

/**
 * Records receipt of an employer confirmation evidence (e.g. portal confirmation number, receipt screenshot, or confirmation email).
 * Strictly separates candidate-provided evidence from independently verified employer confirmations.
 */
export function recordEmployerConfirmation(
  applicationId: string,
  userId: string,
  evidence: {
    evidence_type: 'candidate_receipt' | 'portal_screenshot' | 'reception_email' | 'verified_webhook' | 'employer_api';
    confirmation_reference: string;
    notes?: string;
    verified_by_system?: boolean;
  }
): ApplicationRecord {
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId) as any;
  if (!app) {
    throw new Error(`Application ${applicationId} not found.`);
  }

  if (app.user_id !== userId) {
    throw new Error('Access Denied: Candidate does not own this application record.');
  }

  if (!evidence || !evidence.confirmation_reference || !evidence.confirmation_reference.trim()) {
    throw new Error('Evidence Error: A valid confirmation reference or evidence string is mandatory to record confirmation.');
  }

  const validEvidenceTypes = ['candidate_receipt', 'portal_screenshot', 'reception_email', 'verified_webhook', 'employer_api'];
  if (!validEvidenceTypes.includes(evidence.evidence_type)) {
    throw new Error(`Invalid evidence type: ${evidence.evidence_type}. Must be one of: ${validEvidenceTypes.join(', ')}`);
  }

  // Strictly separate candidate-provided evidence from independently verified employer evidence
  const isIndependentlyVerified =
    (evidence.evidence_type === 'verified_webhook' || evidence.evidence_type === 'employer_api') &&
    evidence.verified_by_system === true;

  const evidenceStatus = isIndependentlyVerified
    ? 'Employer Confirmation Independently Verified'
    : 'Candidate Evidence Provided';

  const newStatus = isIndependentlyVerified
    ? 'Employer Confirmation Independently Verified'
    : 'Candidate Evidence Provided';

  db.prepare(`
    UPDATE applications
    SET status = ?,
        evidence_status = ?,
        confirmation_reference = ?,
        employer_confirmation_received_at = CURRENT_TIMESTAMP,
        employer_confirmation_evidence_type = ?,
        employer_confirmation_evidence = ?,
        notes = COALESCE(?, notes),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    newStatus,
    evidenceStatus,
    evidence.confirmation_reference.trim(),
    evidence.evidence_type,
    evidence.confirmation_reference.trim(),
    evidence.notes || (isIndependentlyVerified
      ? `Employer confirmation independently verified via ${evidence.evidence_type} (Ref: ${evidence.confirmation_reference.trim()})`
      : `Candidate-provided confirmation evidence submitted via ${evidence.evidence_type} (Ref: ${evidence.confirmation_reference.trim()}) - pending independent employer verification`),
    applicationId
  );

  logAudit('EMPLOYER_CONFIRMATION_RECORDED', {
    application_id: applicationId,
    evidence_type: evidence.evidence_type,
    evidence_status: evidenceStatus,
    is_independently_verified: isIndependentlyVerified,
    confirmation_reference: evidence.confirmation_reference.trim()
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

/**
 * Normalizes legacy and modern application statuses for safe UI presentation and backward compatibility.
 * CRITICAL RULE: NEVER automatically normalize legacy 'Applied' to 'Submitted by Candidate'.
 * Unverified historical records are mapped to 'Legacy Applied – Unverified'.
 */
export function normalizeApplicationStatus(
  status: string,
  row?: {
    submission_confirmed?: number;
    candidate_submission_notes?: string;
    submission_confirmed_at?: string;
    applied_at?: string;
  }
): string {
  switch (status) {
    case 'Approval Pending':
    case 'Tailored':
      return 'Package Prepared';
    case 'Approved':
    case 'Ready to Apply':
      return 'Ready for Candidate Submission';
    case 'Applied':
      // Only classify as Submitted by Candidate when explicit candidate confirmation evidence exists
      if (
        row &&
        row.submission_confirmed === 1 &&
        (row.candidate_submission_notes || row.submission_confirmed_at)
      ) {
        return 'Submitted by Candidate';
      }
      return 'Legacy Applied – Unverified';
    case 'Submitted by Candidate':
      return 'Submitted by Candidate';
    case 'Candidate Evidence Provided':
      return 'Candidate Evidence Provided';
    case 'Employer Confirmation Independently Verified':
      return 'Employer Confirmation Independently Verified';
    case 'Evidence Pending Review':
      return 'Evidence Pending Review';
    case 'Evidence Rejected':
      return 'Evidence Rejected';
    case 'Legacy Applied – Unverified':
    case 'Legacy Applied - Unverified':
      return 'Legacy Applied – Unverified';
    case 'Confirmed':
    case 'Confirmation Received':
    case 'Employer Confirmation Received':
      return 'Candidate Evidence Provided';
    default:
      return status;
  }
}
