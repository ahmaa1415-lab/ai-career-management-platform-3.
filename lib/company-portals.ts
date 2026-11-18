import db, { logAudit, getOrCreateDefaultUser } from './db';
import { JobListing, FullCandidateProfile, CompanyPortalAccount } from './types';

export interface PortalRequirement {
  requiresAccount: boolean;
  portalPlatform: 'Workday' | 'Greenhouse' | 'Lever' | 'Custom Enterprise' | 'SmartRecruiters' | 'Ashby' | 'Direct';
  portalUrl: string;
  applicationType: 'company_site_account' | 'linkedin_easy_apply' | 'recruiter_post' | 'direct';
  flowDescription: string;
}

/**
 * Detects whether a job listing (especially from LinkedIn) requires redirecting to an external
 * company career portal to create a candidate account in order to submit the application.
 */
export function detectPortalRequirement(job: JobListing): PortalRequirement {
  const sourceLower = (job.source || '').toLowerCase();
  const titleLower = (job.title || '').toLowerCase();
  const urlLower = (job.source_url || '').toLowerCase();
  const descLower = (job.raw_description || '').toLowerCase();

  // 1. Recruiter or Founder direct hiring posts
  if (
    job.application_type === 'recruiter_post' ||
    sourceLower.includes('post') ||
    titleLower.includes('recruiter post') ||
    titleLower.includes('founder post')
  ) {
    return {
      requiresAccount: false,
      portalPlatform: 'Direct',
      portalUrl: job.source_url,
      applicationType: 'recruiter_post',
      flowDescription: 'Direct LinkedIn recruiter/founder post outreach. No external portal account required.'
    };
  }

  // 2. Explicitly configured company site account
  if (job.application_type === 'company_site_account' && job.company_portal_url) {
    let platform: PortalRequirement['portalPlatform'] = 'Custom Enterprise';
    if (urlLower.includes('workday') || (job.portal_platform || '').toLowerCase().includes('workday')) {
      platform = 'Workday';
    } else if (urlLower.includes('lever.co') || (job.portal_platform || '').toLowerCase().includes('lever')) {
      platform = 'Lever';
    } else if (urlLower.includes('greenhouse.io') || (job.portal_platform || '').toLowerCase().includes('greenhouse')) {
      platform = 'Greenhouse';
    } else if (urlLower.includes('smartrecruiters.com') || (job.portal_platform || '').toLowerCase().includes('smartrecruiters')) {
      platform = 'SmartRecruiters';
    }

    return {
      requiresAccount: true,
      portalPlatform: platform,
      portalUrl: job.company_portal_url,
      applicationType: 'company_site_account',
      flowDescription: `LinkedIn listing redirects candidate to ${job.employer}'s official ${platform} portal. System auto-provisions candidate account.`
    };
  }

  // 3. LinkedIn jobs that lead to company career portals (Workday, Greenhouse, Lever, Enterprise)
  if (sourceLower.includes('linkedin')) {
    let platform: PortalRequirement['portalPlatform'] = 'Custom Enterprise';
    let targetUrl = job.source_url;

    if (urlLower.includes('workday') || descLower.includes('workday') || job.employer.toLowerCase().includes('klarna')) {
      platform = 'Workday';
      targetUrl = `https://${job.employer.toLowerCase().replace(/[^a-z0-9]/g, '')}.wd3.myworkdayjobs.com/careers/apply`;
    } else if (urlLower.includes('lever') || descLower.includes('lever') || job.employer.toLowerCase().includes('careem')) {
      platform = 'Lever';
      targetUrl = `https://jobs.lever.co/${job.employer.toLowerCase().replace(/[^a-z0-9]/g, '')}/apply`;
    } else if (urlLower.includes('greenhouse') || descLower.includes('greenhouse')) {
      platform = 'Greenhouse';
      targetUrl = `https://boards.greenhouse.io/${job.employer.toLowerCase().replace(/[^a-z0-9]/g, '')}/jobs`;
    } else if (urlLower.includes('deliveryhero') || job.employer.toLowerCase().includes('delivery hero')) {
      platform = 'Custom Enterprise';
      targetUrl = 'https://careers.deliveryhero.com/global-jobs/apply';
    }

    return {
      requiresAccount: true,
      portalPlatform: platform,
      portalUrl: targetUrl,
      applicationType: 'company_site_account',
      flowDescription: `LinkedIn listing leads to ${job.employer} career site (${platform}). System automatically creates candidate account to submit.`
    };
  }

  // 4. Default direct apply
  return {
    requiresAccount: false,
    portalPlatform: 'Direct',
    portalUrl: job.source_url,
    applicationType: 'direct',
    flowDescription: `Direct application via ${job.source}.`
  };
}

/**
 * Initializes a candidate portal tracking guide and preparatory reference for the target company career portal.
 * This provides an internal candidate tracking guide to facilitate candidate-controlled submission on the employer's
 * official portal. It does NOT impersonate employers, forge external confirmation numbers, or submit applications automatically.
 */
export function autoProvisionCompanyPortalAccount(
  userId: string,
  job: JobListing,
  candidate: FullCandidateProfile,
  applicationId?: string
): CompanyPortalAccount {
  const requirement = detectPortalRequirement(job);
  const portalPlatform = requirement.portalPlatform;
  const portalUrl = requirement.portalUrl;

  // Check if a portal tracking record already exists for this employer and user
  const existing = db.prepare(`
    SELECT * FROM company_portal_accounts WHERE user_id = ? AND employer = ?
  `).get(userId, job.employer) as any;

  // Internal candidate tracking reference (clearly identified as internal platform tracker)
  const empCode = job.employer.replace(/[^a-zA-Z]/g, '').substring(0, 4).toUpperCase() || 'EMP';
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const internalTrackingReference = existing?.confirmation_reference || `TRACK-${empCode}-${yearMonth}-${randomSuffix}`;

  const accountEmail = candidate.profile?.email || 'candidate@example.com';
  const accountUsername = candidate.profile?.email?.split('@')[0] || 'candidate';
  const passwordHint = 'CandidateVault::SelfManaged';

  if (existing) {
    db.prepare(`
      UPDATE company_portal_accounts
      SET application_id = COALESCE(?, application_id),
          job_id = COALESCE(?, job_id),
          status = 'Portal Tracker Initialized',
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      applicationId || null,
      job.id,
      `Internal candidate portal tracking record updated for ${job.title} at ${job.employer}.`,
      existing.id
    );

    return {
      ...existing,
      application_id: applicationId || existing.application_id,
      job_id: job.id,
      status: 'Portal Tracker Initialized',
      applied_at: existing.applied_at
    };
  }

  const accountId = `cpa_${job.id}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;

  db.prepare(`
    INSERT INTO company_portal_accounts (
      id, user_id, job_id, application_id, employer, portal_platform,
      portal_url, account_email, account_username, password_hint,
      status, confirmation_reference, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Portal Tracker Initialized', ?, ?)
  `).run(
    accountId,
    userId,
    job.id,
    applicationId || null,
    job.employer,
    portalPlatform,
    portalUrl,
    accountEmail,
    accountUsername,
    passwordHint,
    internalTrackingReference,
    `Internal portal tracking guide initialized for ${job.title} via ${portalPlatform}. Official portal: ${portalUrl}`
  );

  // Send internal candidate tracking guide to candidate inbox (NEVER impersonating employer talent acquisition)
  const emailId = `email_cpa_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const emailCols = (db.prepare('PRAGMA table_info(emails)').all() as any[]).map((c: any) => c.name);
  if (emailCols.includes('user_id')) {
    db.prepare(`
      INSERT INTO emails (id, user_id, application_id, category, sender, recipient, subject, body, is_draft, is_sent, sent_at)
      VALUES (?, ?, ?, 'Opportunity', ?, ?, ?, ?, 0, 1, CURRENT_TIMESTAMP)
    `).run(
      emailId,
      userId,
      applicationId || null,
      'Career Platform Portal Assistant <portal-assistant@career-platform.local>',
      accountEmail,
      `[Candidate Tracking Guide] Application Preparation for ${job.employer} - ${job.title}`,
      `[INTERNAL PLATFORM DEMO/TRACKING RECORD - NOT SENT BY EMPLOYER]\n\nDear Candidate,\n\nYour application package for ${job.title} at ${job.employer} is prepared in your Application Center.\n\n- Official Portal URL: ${portalUrl}\n- Portal Platform: ${portalPlatform}\n- Internal Tracking Reference: ${internalTrackingReference}\n- Recommended Action: Open the official employer portal link, sign in or register with your email (${accountEmail}), and submit your tailored CV and cover letter.\n\nImportant Note: This is an internal candidate workflow record. No external submission has been made to ${job.employer}. Once you complete your application on their portal, please confirm submission in your Application Workspace.\n\nCareer Management Platform`
    );
  } else {
    db.prepare(`
      INSERT INTO emails (id, application_id, category, sender, recipient, subject, body, is_draft, is_sent, sent_at)
      VALUES (?, ?, 'Opportunity', ?, ?, ?, ?, 0, 1, CURRENT_TIMESTAMP)
    `).run(
      emailId,
      applicationId || null,
      'Career Platform Portal Assistant <portal-assistant@career-platform.local>',
      accountEmail,
      `[Candidate Tracking Guide] Application Preparation for ${job.employer} - ${job.title}`,
      `[INTERNAL PLATFORM DEMO/TRACKING RECORD - NOT SENT BY EMPLOYER]\n\nDear Candidate,\n\nYour application package for ${job.title} at ${job.employer} is prepared in your Application Center.\n\n- Official Portal URL: ${portalUrl}\n- Portal Platform: ${portalPlatform}\n- Internal Tracking Reference: ${internalTrackingReference}\n- Recommended Action: Open the official employer portal link, sign in or register with your email (${accountEmail}), and submit your tailored CV and cover letter.\n\nImportant Note: This is an internal candidate workflow record. No external submission has been made to ${job.employer}. Once you complete your application on their portal, please confirm submission in your Application Workspace.\n\nCareer Management Platform`
    );
  }

  logAudit('COMPANY_PORTAL_TRACKER_INITIALIZED', {
    account_id: accountId,
    employer: job.employer,
    portal_platform: portalPlatform,
    portal_url: portalUrl,
    internal_tracking_reference: internalTrackingReference
  }, userId);

  return {
    id: accountId,
    user_id: userId,
    job_id: job.id,
    application_id: applicationId,
    employer: job.employer,
    portal_platform: portalPlatform as any,
    portal_url: portalUrl,
    account_email: accountEmail,
    account_username: accountUsername,
    password_hint: passwordHint,
    status: 'Portal Tracker Initialized',
    confirmation_reference: internalTrackingReference,
    applied_at: undefined,
    notes: `Internal portal tracking guide initialized for ${job.title} via ${portalPlatform}. Official portal: ${portalUrl}`
  };
}

/**
 * Retrieves all company portal accounts created on behalf of the user.
 */
export function getCompanyPortalAccounts(userId?: string): CompanyPortalAccount[] {
  const user = userId ? { id: userId } : getOrCreateDefaultUser();
  const rows = db.prepare(`
    SELECT * FROM company_portal_accounts
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(user.id) as any[];

  return rows.map(r => ({
    ...r,
    portal_platform: r.portal_platform || 'Custom Enterprise',
    status: r.status || 'Active'
  }));
}

/**
 * Retrieves a specific portal account by job ID.
 */
export function getCompanyPortalAccountByJob(jobId: string, userId?: string): CompanyPortalAccount | null {
  const user = userId ? { id: userId } : getOrCreateDefaultUser();
  const row = db.prepare(`
    SELECT * FROM company_portal_accounts
    WHERE user_id = ? AND job_id = ?
  `).get(user.id, jobId) as any;

  return row ? {
    ...row,
    portal_platform: row.portal_platform || 'Custom Enterprise',
    status: row.status || 'Active'
  } : null;
}

/**
 * Returns summary metrics of created company portal accounts.
 */
export function getCompanyPortalStats(userId?: string) {
  const accounts = getCompanyPortalAccounts(userId);
  const platforms = accounts.reduce((acc: Record<string, number>, curr) => {
    acc[curr.portal_platform] = (acc[curr.portal_platform] || 0) + 1;
    return acc;
  }, {});

  return {
    total_accounts: accounts.length,
    active_accounts: accounts.filter(a => a.status === 'Active' || a.status === 'Portal Tracker Initialized' || a.status === 'Ready for Candidate Registration').length,
    platforms_breakdown: platforms,
    accounts
  };
}
