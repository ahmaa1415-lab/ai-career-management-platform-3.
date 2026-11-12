import db, { logAudit, getOrCreateDefaultUser } from '../db';
import { ApplicationRecord, PIPELINE_STAGES, PipelineStage } from '../types';
import { normalizeApplicationStatus } from '../applications/workflow';

export { PIPELINE_STAGES };
export type { PipelineStage };

export function getAllApplications(userId?: string, filterStatus?: string, searchKeyword?: string): ApplicationRecord[] {
  const user = userId ? { id: userId } : getOrCreateDefaultUser();

  let query = `
    SELECT a.*, j.employer as j_employer, j.title as j_title, j.location as j_location,
           j.source as j_source, j.source_url as j_source_url, j.salary_raw as j_salary_raw,
           j.requirements as j_requirements, j.application_type as j_application_type,
           j.company_portal_url as j_company_portal_url, j.portal_platform as j_portal_platform,
           j.publication_date as j_publication_date, j.created_at as j_created_at
    FROM applications a
    JOIN job_listings j ON a.job_id = j.id
    WHERE a.user_id = ?
  `;
  const params: any[] = [user.id];

  if (filterStatus && filterStatus !== 'All') {
    query += ' AND a.status = ?';
    params.push(filterStatus);
  }

  if (searchKeyword && searchKeyword.trim().length > 0) {
    query += ' AND (j.employer LIKE ? OR j.title LIKE ? OR a.notes LIKE ?)';
    const term = `%${searchKeyword.trim()}%`;
    params.push(term, term, term);
  }

  query += ' ORDER BY a.updated_at DESC';

  const rows = db.prepare(query).all(...params) as any[];

  return rows.map(r => ({
    id: r.id,
    user_id: r.user_id,
    job_id: r.job_id,
    status: normalizeApplicationStatus(r.status, r) as PipelineStage,
    raw_status: r.status,
    match_score: r.match_score,
    match_details_json: r.match_details_json,
    tailored_cv_id: r.tailored_cv_id,
    cover_letter: r.cover_letter,
    screening_responses: r.screening_responses,
    disclosures_accepted: r.disclosures_accepted,
    human_approved: r.human_approved,
    approved_at: r.approved_at,
    submission_type: r.submission_type,
    submission_confirmed: r.submission_confirmed,
    applied_at: r.applied_at,
    submission_confirmed_at: r.submission_confirmed_at,
    candidate_submission_notes: r.candidate_submission_notes,
    employer_confirmation_received_at: r.employer_confirmation_received_at,
    employer_confirmation_evidence_type: r.employer_confirmation_evidence_type,
    employer_confirmation_evidence: r.employer_confirmation_evidence,
    evidence_status: r.evidence_status,
    recruiter_name: r.recruiter_name,
    recruiter_email: r.recruiter_email,
    notes: r.notes,
    external_portal_account_created: r.external_portal_account_created,
    portal_account_id: r.portal_account_id,
    confirmation_reference: r.confirmation_reference,
    source_resume_id: r.source_resume_id,
    resume_version: r.resume_version,
    is_outdated: r.is_outdated,
    outdated_reason: r.outdated_reason,
    created_at: r.created_at,
    updated_at: r.updated_at,
    job: {
      id: r.job_id,
      employer: r.j_employer,
      title: r.j_title,
      location: r.j_location,
      source: r.j_source,
      source_url: r.j_source_url,
      salary_raw: r.j_salary_raw,
      requirements: (() => {
        try {
          return typeof r.j_requirements === 'string' ? JSON.parse(r.j_requirements) : (r.j_requirements || []);
        } catch {
          return [];
        }
      })(),
      experience_required_years: 0,
      seniority: '',
      visa_sponsorship: 'Unknown',
      remote_eligibility: 'Remote',
      is_verified: 1,
      raw_description: '',
      publication_date: r.j_publication_date || r.j_created_at || '',
      created_at: r.j_created_at,
      application_type: r.j_application_type || 'direct',
      company_portal_url: r.j_company_portal_url || null,
      portal_platform: r.j_portal_platform || 'Direct'
    }
  }));
}

export function updateApplicationStatus(
  applicationId: string,
  newStatus: PipelineStage,
  notes?: string,
  userId?: string
): ApplicationRecord {
  const user = userId || 'default-user';

  // Step 4 Guard: Prevent manual CRM stage mutations from fabricating confirmed submissions or verified receipts
  if (newStatus === 'Submitted by Candidate') {
    throw new Error('Action Prohibited: "Submitted by Candidate" requires explicit candidate confirmation via the candidate submission workflow.');
  }
  if (newStatus === 'Employer Confirmation Independently Verified') {
    throw new Error('Action Prohibited: "Employer Confirmation Independently Verified" requires an authenticated employer webhook callback.');
  }
  if (newStatus === 'Candidate Evidence Provided') {
    throw new Error('Action Prohibited: "Candidate Evidence Provided" requires evidence upload via the confirmation receipt workflow.');
  }

  // If newStatus is legacy 'Applied', treat it as 'Legacy Applied – Unverified'
  const normalizedStatus = (newStatus === 'Applied' || newStatus === ('Legacy Applied - Unverified' as any))
    ? 'Legacy Applied – Unverified'
    : newStatus;

  let updateQuery = `
    UPDATE applications
    SET status = ?,
        updated_at = CURRENT_TIMESTAMP
  `;
  const params: any[] = [normalizedStatus];

  if (notes) {
    updateQuery += ', notes = ?';
    params.push(notes);
  }

  updateQuery += ' WHERE id = ?';
  params.push(applicationId);

  db.prepare(updateQuery).run(...params);

  logAudit('CRM_STATUS_UPDATED', {
    application_id: applicationId,
    new_status: normalizedStatus,
    notes
  }, user);

  const existingApp = db.prepare('SELECT user_id FROM applications WHERE id = ?').get(applicationId) as any;
  const targetUserId = existingApp?.user_id || user;
  return getAllApplications(targetUserId).find(a => a.id === applicationId)!;
}

export function exportCRMDataAsJSON(userId?: string): string {
  const apps = getAllApplications(userId);
  return JSON.stringify({
    exported_at: new Date().toISOString(),
    total_records: apps.length,
    applications: apps
  }, null, 2);
}

export function exportCRMDataAsCSV(userId?: string): string {
  const apps = getAllApplications(userId);
  const headers = ['Application ID', 'Employer', 'Job Title', 'Status', 'Match Score', 'Applied At', 'Recruiter', 'Source'];
  const rows = apps.map(a => [
    `"${a.id}"`,
    `"${a.job?.employer || ''}"`,
    `"${a.job?.title || ''}"`,
    `"${a.status}"`,
    `"${a.match_score}%"`,
    `"${a.applied_at || 'N/A'}"`,
    `"${a.recruiter_name || 'N/A'}"`,
    `"${a.job?.source || ''}"`
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}
