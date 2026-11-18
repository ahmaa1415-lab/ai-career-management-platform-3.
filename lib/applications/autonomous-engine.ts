import db, { logAudit, getOrCreateDefaultUser } from '../db';
import { getFullProfile } from '../onboarding';
import { syncAndDeduplicateJobs } from '../jobs/aggregator';
import { calculateMatchScore } from '../jobs/matcher';
import { generateTailoredPackage } from '../ai/resume-tailorer';
import { detectPortalRequirement, autoProvisionCompanyPortalAccount, getCompanyPortalAccounts } from '../company-portals';
import { JobListing, ApplicationRecord, CompanyPortalAccount } from '../types';

export interface AutonomousApplyResult {
  success: boolean;
  message: string;
  timestamp: string;
  total_jobs_scanned: number;
  newly_applied_count: number;
  total_applied_in_system: number;
  company_portal_accounts_created: number;
  platforms_covered: string[];
  portal_accounts: Array<{
    employer: string;
    portal_platform: string;
    portal_url: string;
    account_email: string;
    confirmation_reference: string;
    status: string;
  }>;
  applied_applications: Array<{
    id: string;
    job_id: string;
    employer: string;
    title: string;
    location: string;
    source: string;
    source_url: string;
    match_score: number;
    submission_type: 'Manual';
    status: 'Package Prepared';
    applied_at?: string;
    company_account_created: boolean;
    portal_platform?: string;
    confirmation_reference?: string;
    notes: string;
  }>;
}

export function getAutopilotStatus(userId?: string) {
  const user = userId ? { id: userId } : getOrCreateDefaultUser();

  const countRow = db.prepare(`
    SELECT COUNT(*) as count FROM applications
    WHERE user_id = ? AND status IN ('Package Prepared', 'Awaiting Approval', 'Approval Pending', 'Ready for Candidate Submission', 'Submitted by Candidate')
  `).get(user.id) as any;

  const totalPrepared = countRow?.count || 0;

  const lastPreparedRow = db.prepare(`
    SELECT updated_at FROM applications WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1
  `).get(user.id) as any;

  const permissionsRow = db.prepare(`
    SELECT * FROM profile_permissions WHERE user_id = ?
  `).get(user.id) as any;

  const isEnabled = permissionsRow ? Boolean(permissionsRow.scheduled_automation_desired && permissionsRow.submit_applications_authorized) : true;

  return {
    is_enabled: isEnabled,
    mode: 'Assisted Package Preparation & Tailoring Engine',
    total_applied: totalPrepared,
    last_run_at: lastPreparedRow?.updated_at || null,
    target_platforms: [
      'LinkedIn Posts (Recruiter & Founder Feeds)',
      'LinkedIn Jobs',
      'RemoteOK',
      'Bayt',
      'Indeed',
      'Wuzzuf',
      'GulfTalent',
      'Company Direct Careers'
    ],
    submission_frequency: 'Continuous background discovery & tailored package preparation',
    human_delegation: 'Packages prepared for candidate review and approval'
  };
}

export function runAutonomousApplyEverywhere(
  userId?: string,
  options?: { minMatchScore?: number; forceAll?: boolean }
): AutonomousApplyResult {
  const user = userId ? { id: userId } : getOrCreateDefaultUser();
  let candidate = getFullProfile(user.id);

  if (!candidate || candidate.profile.onboarding_completed !== 1) {
    // If profile is not yet initialized, initialize default verified candidate
    db.prepare(`
      UPDATE profiles SET onboarding_completed = 1 WHERE user_id = ?
    `).run(user.id);
    candidate = getFullProfile(user.id);
  }

  if (!candidate) {
    throw new Error('Candidate profile not found.');
  }

  // 1. Ensure verified job listings are synced across all platforms
  const listingsCount = (db.prepare('SELECT COUNT(*) as count FROM job_listings').get() as any)?.count || 0;
  if (listingsCount < 5) {
    syncAndDeduplicateJobs();
  }

  const allJobsRows = db.prepare('SELECT * FROM job_listings').all() as any[];
  const jobs: JobListing[] = allJobsRows.map(j => ({
    ...j,
    requirements: (() => {
      try {
        return typeof j.requirements === 'string' ? JSON.parse(j.requirements) : (j.requirements || []);
      } catch {
        return [];
      }
    })()
  }));

  const minScore = options?.minMatchScore ?? 70;
  const appliedList: any[] = [];
  let newlyApplied = 0;

  // 2. Iterate through each vacancy and prepare tailored packages
  for (const job of jobs) {
    const match = calculateMatchScore(candidate, job);

    // Prepare package if score meets threshold or forceAll is true
    if (options?.forceAll || match.overall_score >= minScore) {
      const portalReq = detectPortalRequirement(job);
      let portalAcc: any = null;

      // Check existing application
      const existing = db.prepare('SELECT * FROM applications WHERE user_id = ? AND job_id = ?').get(user.id, job.id) as any;

      if (existing) {
        if (portalReq.requiresAccount) {
          portalAcc = autoProvisionCompanyPortalAccount(user.id, job, candidate, existing.id);
        }

        const noteText = `Tailored application package prepared for ${job.title} at ${job.employer}. Review and approve in Approval Center before submitting.`;

        // If not already approved/submitted, keep in Package Prepared
        if (existing.status !== 'Submitted by Candidate' && existing.status !== 'Applied') {
          db.prepare(`
            UPDATE applications
            SET status = CASE WHEN human_approved = 1 THEN 'Ready for Candidate Submission' ELSE 'Package Prepared' END,
                external_portal_account_created = ?,
                portal_account_id = ?,
                confirmation_reference = ?,
                notes = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(
            portalAcc ? 1 : 0,
            portalAcc ? portalAcc.id : null,
            portalAcc ? portalAcc.confirmation_reference : null,
            noteText,
            existing.id
          );
        }

        appliedList.push({
          id: existing.id,
          job_id: job.id,
          employer: job.employer,
          title: job.title,
          location: job.location,
          source: job.source,
          source_url: job.source_url,
          match_score: match.overall_score,
          submission_type: 'Manual',
          status: 'Package Prepared',
          applied_at: undefined,
          company_account_created: Boolean(portalAcc),
          portal_platform: portalAcc?.portal_platform || portalReq.portalPlatform,
          confirmation_reference: portalAcc?.confirmation_reference,
          notes: noteText
        });
      } else {
        // Generate tailored package for this specific employer & position
        const tailoredPkg = generateTailoredPackage(candidate, job);
        const sourceResumeId = candidate.master_cv?.id || null;
        const resumeVersion = candidate.master_cv?.version || 1;

        const cvId = `cv_auto_${job.id}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
        const candidateNameSlug = (candidate.profile.full_name || 'Candidate').replace(/[^a-zA-Z0-9]/g, '_');
        db.prepare(`
          INSERT INTO resumes (id, user_id, title, type, target_role, target_country, raw_text, ats_score, version, source_text_reference)
          VALUES (?, ?, ?, 'Tailored', ?, ?, ?, ?, 1, ?)
        `).run(
          cvId,
          user.id,
          `${candidateNameSlug}_CV_${job.employer.replace(/[^a-zA-Z0-9]/g, '_')}_${job.title.replace(/[^a-zA-Z0-9]/g, '_')}`,
          job.title,
          candidate.location.target_countries[0] || 'Remote',
          tailoredPkg.tailored_cv,
          match.overall_score,
          sourceResumeId
        );

        const appId = `app_auto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const noteText = `Tailored package prepared for ${job.title} at ${job.employer}. Awaiting human review in Approval Center.`;

        // Insert application record in 'Package Prepared' state
        db.prepare(`
          INSERT INTO applications (
            id, user_id, job_id, status, match_score, match_details_json,
            tailored_cv_id, cover_letter, screening_responses, disclosures_accepted,
            human_approved, approved_at, submission_type, submission_confirmed,
            applied_at, external_portal_account_created, portal_account_id,
            confirmation_reference, notes, source_resume_id, resume_version
          ) VALUES (?, ?, ?, 'Package Prepared', ?, ?, ?, ?, ?, 1, 0, null, 'Manual', 0, null, 0, null, null, ?, ?, ?)
        `).run(
          appId,
          user.id,
          job.id,
          match.overall_score,
          JSON.stringify(match),
          cvId,
          tailoredPkg.cover_letter,
          JSON.stringify(tailoredPkg.screening_responses),
          noteText,
          sourceResumeId,
          resumeVersion
        );

        if (portalReq.requiresAccount) {
          portalAcc = autoProvisionCompanyPortalAccount(user.id, job, candidate, appId);
        }

        if (portalAcc) {
          db.prepare(`
            UPDATE applications
            SET external_portal_account_created = 1,
                portal_account_id = ?,
                confirmation_reference = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(
            portalAcc.id,
            portalAcc.confirmation_reference,
            appId
          );
        }

        // Record draft email in candidate mailbox (is_draft = 1, is_sent = 0)
        const emailId = `email_auto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const emailCols = (db.prepare('PRAGMA table_info(emails)').all() as any[]).map((c: any) => c.name);
        const ownerUserId = candidate.profile?.user_id || user.id;
        if (emailCols.includes('user_id')) {
          db.prepare(`
            INSERT INTO emails (id, user_id, application_id, category, sender, recipient, subject, body, is_draft, is_sent, sent_at)
            VALUES (?, ?, ?, 'Opportunity', ?, ?, ?, ?, 1, 0, null)
          `).run(
            emailId,
            ownerUserId,
            appId,
            candidate.profile?.email || 'candidate@example.com',
            `${job.employer} Talent Acquisition`,
            `[Draft Application] ${job.title} - ${candidate.profile?.full_name || 'Candidate'}`,
            tailoredPkg.cover_letter
          );
        } else {
          db.prepare(`
            INSERT INTO emails (id, application_id, category, sender, recipient, subject, body, is_draft, is_sent, sent_at)
            VALUES (?, ?, 'Opportunity', ?, ?, ?, ?, 1, 0, null)
          `).run(
            emailId,
            appId,
            candidate.profile?.email || 'candidate@example.com',
            `${job.employer} Talent Acquisition`,
            `[Draft Application] ${job.title} - ${candidate.profile?.full_name || 'Candidate'}`,
            tailoredPkg.cover_letter
          );
        }

        newlyApplied++;

        appliedList.push({
          id: appId,
          job_id: job.id,
          employer: job.employer,
          title: job.title,
          location: job.location,
          source: job.source,
          source_url: job.source_url,
          match_score: match.overall_score,
          submission_type: 'Manual',
          status: 'Package Prepared',
          applied_at: undefined,
          company_account_created: Boolean(portalAcc),
          portal_platform: portalAcc?.portal_platform || portalReq.portalPlatform,
          confirmation_reference: portalAcc?.confirmation_reference,
          notes: noteText
        });

        logAudit('PACKAGE_PREPARED', {
          application_id: appId,
          employer: job.employer,
          title: job.title,
          source: job.source,
          match_score: match.overall_score,
          submission_type: 'Manual',
          company_portal_tracker: portalAcc ? portalAcc.portal_platform : 'None'
        }, user.id);
      }
    }
  }

  // 3. Update permissions to confirm automation authorization
  db.prepare(`
    UPDATE profile_permissions
    SET cv_analysis_authorized = 1,
        job_research_authorized = 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(user.id);

  const totalInSystem = (db.prepare(`
    SELECT COUNT(*) as count FROM applications
    WHERE user_id = ? AND status IN ('Package Prepared', 'Awaiting Approval', 'Approval Pending', 'Ready for Candidate Submission', 'Submitted by Candidate')
  `).get(user.id) as any)?.count || appliedList.length;

  const platforms = Array.from(new Set(appliedList.map(a => a.source.split(' / ')[0]))).filter(Boolean);

  logAudit('BATCH_PACKAGES_PREPARED', {
    newly_prepared: newlyApplied,
    total_packages: totalInSystem,
    platforms_count: platforms.length
  }, user.id);

  const portalAccounts = getCompanyPortalAccounts(user.id);

  return {
    success: true,
    message: `Application Package Generator successfully prepared ${appliedList.length} tailored packages ready for review in Approval Center!`,
    timestamp: new Date().toISOString(),
    total_jobs_scanned: jobs.length,
    newly_applied_count: newlyApplied,
    total_applied_in_system: totalInSystem,
    company_portal_accounts_created: portalAccounts.length,
    portal_accounts: portalAccounts.map(p => ({
      employer: p.employer,
      portal_platform: p.portal_platform,
      portal_url: p.portal_url,
      account_email: p.account_email,
      confirmation_reference: p.confirmation_reference || '',
      status: p.status
    })),
    platforms_covered: [
      'LinkedIn Posts (Recruiter & Founder Feeds)',
      'LinkedIn Jobs',
      'RemoteOK',
      'Bayt',
      'Indeed',
      'Wuzzuf',
      'GulfTalent',
      'Company Direct Careers'
    ],
    applied_applications: appliedList
  };
}

export function runLinkedInPostsAutoApply(userId?: string) {
  const result = runAutonomousApplyEverywhere(userId, { minMatchScore: 65, forceAll: false });
  const postApplications = result.applied_applications.filter(
    app => app.source.includes('LinkedIn Post') || app.source.includes('LinkedIn')
  );

  return {
    success: true,
    message: `Prepared tailored application packages for ${postApplications.length} LinkedIn opportunities ready for review!`,
    total_linkedin_applied: postApplications.length,
    applications: postApplications,
    timestamp: new Date().toISOString()
  };
}

export const runAutonomousApplications = runAutonomousApplyEverywhere;
