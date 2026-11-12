/**
 * CANONICAL APPLICATION LIFECYCLE & KPI CLASSIFICATION SERVICE
 *
 * Enforces unified, immutable truthfulness across:
 * - Applications Workspace
 * - Approval Center
 * - CRM Kanban Pipeline
 * - Executive Dashboard & Daily Reports
 * - Notifications & Automated Workers
 *
 * STRICT INVARIANTS:
 * 1. Candidate confirmation is a self-reported action, NEVER an independent employer receipt.
 * 2. Uploaded confirmation evidence is distinct from independently verified webhooks.
 * 3. Legacy 'Applied' records are UNVERIFIED by default.
 * 4. Autonomous engine scripts or synthesized references (CONF-EMP-...) CANNOT fabricate genuine submission proof.
 * 5. CRM stage movements CANNOT manufacture submission evidence or independently verified status.
 */

export type CanonicalApplicationLifecycle =
  | 'Draft'
  | 'Package Prepared'
  | 'Approval Pending'
  | 'Ready for Candidate Submission'
  | 'Submitted by Candidate'
  | 'Candidate Evidence Provided'
  | 'Employer Confirmation Independently Verified'
  | 'Legacy Applied – Unverified'
  | 'Interview'
  | 'Assessment'
  | 'Offer'
  | 'Rejected'
  | 'Withdrawn';

export interface ApplicationKPISummary {
  candidate_reported_submissions: number;
  independently_verified_employer_receipts: number;
  candidate_evidence_provided: number;
  legacy_unverified_applications: number;
  prepared_applications: number;
  ready_for_candidate_submission: number;
  interviews_and_offers: number;
  total_active_in_pipeline: number;
}

/**
 * Determines the canonical lifecycle stage of an application record based on strict provenance and evidence.
 */
export function classifyApplicationLifecycle(app: any): CanonicalApplicationLifecycle {
  if (!app) return 'Draft';

  // 1. Tier 2: Independently Verified Employer Receipts
  // Requires explicit system verification from an authentic ATS webhook or employer API callback
  if (
    app.evidence_status === 'employer_verified' ||
    (app.status === 'Employer Confirmation Independently Verified' && app.verified_by_system === 1)
  ) {
    return 'Employer Confirmation Independently Verified';
  }

  // 2. Tier 1B: Candidate-Provided Evidence (Receipt / Screenshot / Email upload)
  if (
    app.status === 'Candidate Evidence Provided' ||
    app.evidence_status === 'candidate_evidence_provided' ||
    app.status === 'Confirmation Received' ||
    app.status === 'Confirmed'
  ) {
    return 'Candidate Evidence Provided';
  }

  // 3. Active Hiring Pipeline Stages
  if (app.status === 'Interview') return 'Interview';
  if (app.status === 'Assessment') return 'Assessment';
  if (app.status === 'Offer' || app.status === 'Negotiation') return 'Offer';
  if (app.status === 'Rejected') return 'Rejected';
  if (app.status === 'Withdrawn') return 'Withdrawn';

  // 4. Tier 1A: Candidate-Reported Submission
  // Must be confirmed by the human candidate (submission_confirmed === 1).
  // Guards against autonomous fabrication notes from legacy background workers.
  const isAutonomousFabrication =
    (app.notes && (
      app.notes.startsWith('Autonomously applied via') ||
      app.notes.startsWith('Submitted via')
    )) ||
    (app.submission_type === 'Automated' && !app.candidate_submission_notes);

  if (app.status === 'Submitted by Candidate') {
    if (isAutonomousFabrication) {
      return 'Legacy Applied – Unverified';
    }
    if (app.submission_confirmed === 1) {
      return 'Submitted by Candidate';
    }
    return 'Legacy Applied – Unverified';
  }

  // 5. Tier 0: Legacy / Unverified Historical Records
  if (
    app.status === 'Applied' ||
    app.status === 'Legacy Applied – Unverified' ||
    app.status === 'Legacy Applied - Unverified'
  ) {
    // Only classify as Submitted by Candidate if explicit candidate notes or human audit exists
    if (
      !isAutonomousFabrication &&
      app.submission_confirmed === 1 &&
      (app.candidate_submission_notes || app.submission_confirmed_at)
    ) {
      return 'Submitted by Candidate';
    }
    return 'Legacy Applied – Unverified';
  }

  // 6. Ready for Candidate Submission (Human Approved)
  if (
    app.status === 'Ready for Candidate Submission' ||
    app.status === 'Ready to Apply' ||
    (app.human_approved === 1 && (app.status === 'Package Prepared' || app.status === 'Approved'))
  ) {
    return 'Ready for Candidate Submission';
  }

  // 7. Package Prepared / Awaiting Approval
  if (
    app.status === 'Package Prepared' ||
    app.status === 'Approval Pending' ||
    app.status === 'Tailored'
  ) {
    return 'Package Prepared';
  }

  return 'Draft';
}

/**
 * Computes mutually exclusive KPI counts across an array of application records.
 * NEVER calculates verified submission KPIs from applications.length or raw status = 'Applied'.
 */
export function calculateApplicationKPIs(applications: any[]): ApplicationKPISummary {
  let candidate_reported_submissions = 0;
  let independently_verified_employer_receipts = 0;
  let candidate_evidence_provided = 0;
  let legacy_unverified_applications = 0;
  let prepared_applications = 0;
  let ready_for_candidate_submission = 0;
  let interviews_and_offers = 0;

  for (const app of applications) {
    const lifecycle = classifyApplicationLifecycle(app);
    switch (lifecycle) {
      case 'Employer Confirmation Independently Verified':
        independently_verified_employer_receipts++;
        break;
      case 'Candidate Evidence Provided':
        candidate_evidence_provided++;
        break;
      case 'Submitted by Candidate':
        candidate_reported_submissions++;
        break;
      case 'Legacy Applied – Unverified':
        legacy_unverified_applications++;
        break;
      case 'Ready for Candidate Submission':
        ready_for_candidate_submission++;
        break;
      case 'Package Prepared':
      case 'Approval Pending':
      case 'Draft':
        prepared_applications++;
        break;
      case 'Interview':
      case 'Assessment':
      case 'Offer':
        interviews_and_offers++;
        break;
      default:
        break;
    }
  }

  return {
    candidate_reported_submissions,
    independently_verified_employer_receipts,
    candidate_evidence_provided,
    legacy_unverified_applications,
    prepared_applications,
    ready_for_candidate_submission,
    interviews_and_offers,
    total_active_in_pipeline: applications.length,
  };
}
