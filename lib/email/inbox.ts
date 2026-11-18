import db, { logAudit, getOrCreateDefaultUser } from '../db';
import { RecruitmentEmail, FullCandidateProfile } from '../types';

export const EMAIL_CATEGORIES = [
  'Opportunity',
  'Recruiter Message',
  'Confirmation',
  'Interview',
  'Assessment',
  'Offer',
  'Rejection',
  'Followup'
] as const;

export type EmailCategory = typeof EMAIL_CATEGORIES[number];

export function getEmailSchemaColumns(): string[] {
  try {
    return (db.prepare('PRAGMA table_info(emails)').all() as any[]).map((c: any) => c.name);
  } catch {
    return [];
  }
}

// Seed realistic initial recruitment messages if inbox is empty
export function initializeRecruitmentInbox(userId?: string) {
  const count = db.prepare('SELECT COUNT(*) as c FROM emails').get() as any;
  if (count.c === 0) {
    const seedEmails = [
      {
        id: 'email_seed_01',
        category: 'Interview',
        sender: 'sarah.miller@careem.com',
        recipient: 'candidate@example.com',
        subject: 'Invitation to Technical Architecture Discussion: Careem FinTech',
        body: 'Hi Aya,\n\nWe reviewed your application for the Staff Software Engineer role in Dubai. Our VP of Engineering was impressed by your distributed systems and Node.js/TypeScript background. We would love to schedule a 45-minute technical conversation next Tuesday at 3:00 PM Gulf Standard Time (1:00 PM Cairo). Please let us know if this slot works.\n\nBest regards,\nSarah Miller\nLead Talent Partner, Careem',
        is_draft: 0,
        is_sent: 0
      },
      {
        id: 'email_seed_02',
        category: 'Confirmation',
        sender: 'no-reply@gitlab.com',
        recipient: 'candidate@example.com',
        subject: 'Application Received: Senior Full Stack Engineer, AI & Workflows (GitLab)',
        body: 'Dear Candidate,\n\nThank you for applying for the Senior Full Stack Engineer, AI & Workflows position at GitLab. We have received your tailored CV and application package. Our hiring team conducts rolling reviews, and we will update you within 5 business days.\n\nWarm regards,\nGitLab Global Talent Acquisition',
        is_draft: 0,
        is_sent: 0
      },
      {
        id: 'email_seed_03',
        category: 'Recruiter Message',
        sender: 'marcus.vogel@deliveryhero.com',
        recipient: 'candidate@example.com',
        subject: 'Relocation & Engineering Opportunities in Berlin - Delivery Hero',
        body: 'Hello Aya,\n\nI came across your GitHub and LinkedIn profile and noticed your deep experience in Next.js, Node.js microservices, and high-concurrency architectures. We have an opening on our Berlin logistics core platform with full German EU Blue Card visa sponsorship and relocation support. Would you be open to an exploratory chat this week?\n\nCheers,\nMarcus Vogel\nSenior Tech Recruiter',
        is_draft: 0,
        is_sent: 0
      }
    ];

    const hasUserId = getEmailSchemaColumns().includes('user_id');

    if (hasUserId) {
      const insert = db.prepare(`
        INSERT INTO emails (id, user_id, category, sender, recipient, subject, body, is_draft, is_sent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      db.transaction(() => {
        for (const e of seedEmails) {
          insert.run(e.id, userId || null, e.category, e.sender, e.recipient, e.subject, e.body, e.is_draft, e.is_sent);
        }
      })();
    } else {
      const insert = db.prepare(`
        INSERT INTO emails (id, category, sender, recipient, subject, body, is_draft, is_sent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      db.transaction(() => {
        for (const e of seedEmails) {
          insert.run(e.id, e.category, e.sender, e.recipient, e.subject, e.body, e.is_draft, e.is_sent);
        }
      })();
    }
  }
}

initializeRecruitmentInbox();

/**
 * Retrieves all recruitment emails scoped to the authenticated user.
 * Strict fail-closed: Unauthenticated requests or missing userId return an empty list.
 */
export function getAllEmails(categoryFilter?: string, userId?: string): RecruitmentEmail[] {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return []; // Fail-closed: unauthenticated callers never receive emails
  }
  const cleanUserId = userId.trim();
  const hasUserId = getEmailSchemaColumns().includes('user_id');

  if (hasUserId) {
    let query = 'SELECT * FROM emails WHERE user_id = ?';
    const params: any[] = [cleanUserId];
    if (categoryFilter && categoryFilter !== 'All') {
      query += ' AND category = ?';
      params.push(categoryFilter);
    }
    query += ' ORDER BY created_at DESC';
    return db.prepare(query).all(...params) as RecruitmentEmail[];
  }

  // Pre-migration fallback: resolve exclusively through trusted application ownership.
  // Never infers ownership from untrusted sender or recipient text headers.
  let query = `
    SELECT e.* FROM emails e
    JOIN applications a ON e.application_id = a.id
    WHERE a.user_id = ?
  `;
  const params: any[] = [cleanUserId];
  if (categoryFilter && categoryFilter !== 'All') {
    query += ' AND e.category = ?';
    params.push(categoryFilter);
  }
  query += ' ORDER BY e.created_at DESC';

  return db.prepare(query).all(...params) as RecruitmentEmail[];
}

export function generateEmailDraft(
  type: 'Reply' | 'Interview_Thank_You' | 'Follow_Up' | 'Networking',
  targetEmail: { sender: string; recipient: string; subject: string; body: string },
  candidate: FullCandidateProfile,
  userId?: string,
  applicationId?: string | null
): RecruitmentEmail {
  const effectiveUserId = (userId || candidate.profile?.user_id || '').trim();
  if (!effectiveUserId) {
    throw new Error('Tenant Ownership Error: A valid userId is required to create an email draft.');
  }

  // If application_id is provided, verify tenant ownership of that application
  if (applicationId) {
    const app = db.prepare('SELECT id, user_id FROM applications WHERE id = ?').get(applicationId) as any;
    if (!app || app.user_id !== effectiveUserId) {
      throw new Error('Access Denied: application_id does not belong to the authenticated candidate.');
    }
  }

  const candidateName = candidate.profile?.full_name || 'Candidate';
  const senderEmail = candidate.profile?.email || 'candidate@example.com';
  let draftSubject = '';
  let draftBody = '';
  let category: EmailCategory = 'Followup';

  if (type === 'Reply') {
    draftSubject = targetEmail.subject.startsWith('Re:') ? targetEmail.subject : `Re: ${targetEmail.subject}`;
    draftBody = `Hi ${targetEmail.sender.split('@')[0]},\n\nThank you for reaching out regarding this opportunity. I am definitely interested and would welcome the opportunity to connect. The proposed time works well for me, and I look forward to speaking with the team.\n\nPlease let me know if you need any additional portfolio or technical references prior to the call.\n\nBest regards,\n${candidateName}\n+201000000000`;
    category = 'Recruiter Message';
  } else if (type === 'Interview_Thank_You') {
    draftSubject = `Thank You - Interview for Software Engineering Role`;
    draftBody = `Dear Interview Team,\n\nThank you for taking the time to speak with me today about the engineering position. I truly enjoyed discussing your system architecture and upcoming roadmap initiatives. Our conversation reinforced my enthusiasm for joining the team and contributing my expertise in TypeScript, distributed systems, and scalable full-stack applications.\n\nPlease let me know if there are any additional questions or details I can provide.\n\nBest regards,\n${candidateName}`;
    category = 'Interview';
  } else if (type === 'Follow_Up') {
    draftSubject = `Following Up on Application: ${targetEmail.subject.replace(/^(Re:\s*)+/i, '')}`;
    draftBody = `Dear Hiring Team,\n\nI hope this email finds you well. I am following up on my application for the software engineering role submitted recently. I remain deeply enthusiastic about the team's mission and would love to know if there are any updates regarding next steps.\n\nThank you for your time and continued consideration.\n\nSincerely,\n${candidateName}`;
    category = 'Followup';
  } else {
    // Networking
    draftSubject = `Exploring Technical Engineering Opportunities`;
    draftBody = `Dear Hiring Partner,\n\nI have followed your engineering blog and notable scaling milestones with great interest. As a ${candidate.profile.target_seniority} Software Engineer with ${candidate.profile.experience_years}+ years specializing in ${candidate.profile.skills.slice(0, 4).join(', ')}, I would love to connect and explore how my experience might align with your engineering team.\n\nLooking forward to staying in touch.\n\nBest regards,\n${candidateName}`;
    category = 'Opportunity';
  }

  const draftId = `draft_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const hasUserId = getEmailSchemaColumns().includes('user_id');

  if (hasUserId) {
    db.prepare(`
      INSERT INTO emails (id, user_id, application_id, category, sender, recipient, subject, body, is_draft, is_sent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
    `).run(
      draftId,
      effectiveUserId,
      applicationId || null,
      category,
      senderEmail,
      targetEmail.sender,
      draftSubject,
      draftBody
    );
  } else {
    db.prepare(`
      INSERT INTO emails (id, application_id, category, sender, recipient, subject, body, is_draft, is_sent)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)
    `).run(
      draftId,
      applicationId || null,
      category,
      senderEmail,
      targetEmail.sender,
      draftSubject,
      draftBody
    );
  }

  logAudit('EMAIL_DRAFT_CREATED', {
    draft_id: draftId,
    recipient: targetEmail.sender,
    subject: draftSubject,
    application_id: applicationId || null
  }, effectiveUserId);

  return db.prepare('SELECT * FROM emails WHERE id = ?').get(draftId) as RecruitmentEmail;
}

export function sendEmailWithApproval(
  emailId: string,
  userConfirmed: boolean,
  userId: string
): { success: boolean; email: RecruitmentEmail; message: string } {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    throw new Error('Unauthenticated: A valid userId is required to dispatch an email.');
  }
  const cleanUserId = userId.trim();

  if (!userConfirmed) {
    throw new Error('Send Security Gate: Explicit user confirmation is required to dispatch an email.');
  }

  const email = db.prepare('SELECT * FROM emails WHERE id = ?').get(emailId) as any;
  if (!email) {
    throw new Error('NOT_FOUND: Email not found.');
  }

  // Tenant boundary verification: verify caller owns this email
  const hasUserId = getEmailSchemaColumns().includes('user_id');
  if (hasUserId) {
    if (!email.user_id || email.user_id !== cleanUserId) {
      throw new Error('ACCESS_DENIED: Candidate does not own this email record.');
    }
  } else {
    if (email.application_id) {
      const app = db.prepare('SELECT user_id FROM applications WHERE id = ?').get(email.application_id) as any;
      if (!app || app.user_id !== cleanUserId) {
        throw new Error('ACCESS_DENIED: Candidate does not own this email record.');
      }
    } else {
      throw new Error('ACCESS_DENIED: Legacy unowned email record cannot be dispatched.');
    }
  }

  // Step 6 Truthful Delivery Handling:
  // External outbound email is strictly disabled without a live verified mail provider.
  // In sandbox, staging, or local testing, emails are safely recorded as 'sandbox_recorded' with is_sent = 0.
  // is_sent = 1 can ONLY be set when an external mail gateway returns a confirmed provider_message_id.
  const isStaging = process.env.STAGING_MODE === 'true';
  const hasLiveCredentials = !isStaging && Boolean(process.env.LIVE_MAIL_PROVIDER_ENABLED === 'true' && process.env.GOOGLE_OAUTH_TOKEN && process.env.GOOGLE_OAUTH_TOKEN.length > 0);

  if (hasLiveCredentials) {
    // Reserved for verified live provider transmission returning provider_message_id
  }

  // Record safely as sandbox_recorded (is_sent = 0, is_draft = 0)
  db.prepare(`
    UPDATE emails
    SET is_draft = 0,
        is_sent = 0,
        delivery_status = 'sandbox_recorded',
        delivery_provider = 'sandbox_simulated',
        sent_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(emailId);

  logAudit('EMAIL_SANDBOX_RECORDED', {
    email_id: emailId,
    recipient: email.recipient,
    subject: email.subject,
    delivery_status: 'sandbox_recorded',
    is_sent: 0,
    mode: 'Sandbox Simulated Gateway'
  }, cleanUserId);

  const updated = db.prepare('SELECT * FROM emails WHERE id = ?').get(emailId) as RecruitmentEmail;

  return {
    success: true,
    email: updated,
    message: 'Email safely recorded in Sandbox Recruitment Mailbox (is_sent = 0: no external SMTP credentials configured).'
  };
}
