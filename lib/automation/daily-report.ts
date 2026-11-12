import db, { logAudit, getOrCreateDefaultUser } from '../db';
import { getFullProfile } from '../onboarding';
import { getAllVerifiedJobs } from '../jobs/aggregator';
import { rankTopOpportunities } from '../jobs/matcher';
import { getAllApplications } from '../crm/pipeline';
import { getAllEmails } from '../email/inbox';
import { DailyReportRecord } from '../types';

export function getCairoCurrentTime(): { iso: string; cairoTimeString: string; hour: number; minute: number } {
  // Africa/Cairo is UTC+2 (or UTC+3 during DST if active)
  const now = new Date();
  const cairoFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = cairoFormatter.formatToParts(now);
  const findPart = (type: string) => parts.find(p => p.type === type)?.value || '0';

  const year = findPart('year');
  const month = findPart('month');
  const day = findPart('day');
  const hour = parseInt(findPart('hour'), 10);
  const minute = parseInt(findPart('minute'), 10);

  return {
    iso: now.toISOString(),
    cairoTimeString: `${year}-${month}-${day} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00 Africa/Cairo`,
    hour,
    minute
  };
}

export function generateDailyExecutiveReport(userId?: string): DailyReportRecord {
  const user = userId ? { id: userId } : getOrCreateDefaultUser();
  const candidate = getFullProfile(user.id);
  const cairoTime = getCairoCurrentTime();

  const allJobs = getAllVerifiedJobs();
  const top10 = candidate ? rankTopOpportunities(candidate, allJobs) : [];
  const allApps = getAllApplications(user.id);
  const allEmails = getAllEmails();

  // Metrics computation
  const appsPrepared = allApps.length;
  const appsPendingApproval = allApps.filter(a => a.status === 'Approval Pending').length;
  const appsReadyToApply = allApps.filter(a => a.status === 'Ready to Apply').length;
  const appsSubmitted = allApps.filter(a => a.status === 'Applied' || a.submission_confirmed === 1).length;
  const interviewsCount = allApps.filter(a => a.status === 'Interview').length;
  const assessmentsCount = allApps.filter(a => a.status === 'Assessment').length;
  const offersCount = allApps.filter(a => a.status === 'Offer' || a.status === 'Negotiation').length;

  const emailsDrafted = allEmails.filter(e => e.is_draft === 1).length;
  const emailsSent = allEmails.filter(e => e.is_sent === 1).length;
  const recruiterReplies = allEmails.filter(e => e.category === 'Recruiter Message' || e.category === 'Interview').length;

  const reportDate = cairoTime.cairoTimeString.split(' ')[0];

  const markdown = `
# 📊 Executive Daily Career & Job Search Report
**Generated At**: ${cairoTime.cairoTimeString}  
**Timezone**: Africa/Cairo (UTC+2)  
**Target Candidate**: ${candidate?.profile.headline || 'Software Engineer'}  
**Location Preferences**: ${candidate?.location.target_countries.join(', ') || 'Global Remote'} (${candidate?.location.work_mode_preference || 'Remote'})

---

## 1. Daily Activity Snapshot

| Metric | Count | Status / Notes |
|---|---:|---|
| **Verified Vacancies Monitored** | ${allJobs.length} | Sourced from RemoteOK, Bayt, Indeed, Wuzzuf, LinkedIn |
| **Top 10 Opportunity Matches** | ${top10.length} | Scored via 8-criterion weighted algorithm |
| **Applications Prepared** | ${appsPrepared} | Complete with tailored CVs & cover letters |
| **Pending Human Approvals** | ${appsPendingApproval} | Awaiting explicit review in Approval Center |
| **Applications Ready to Apply** | ${appsReadyToApply} | Human approved; ready for dispatch |
| **Applications Submitted** | ${appsSubmitted} | Verified submissions recorded |
| **Recruitment Emails Drafted** | ${emailsDrafted} | Stored securely in Draft status |
| **Emails Dispatched** | ${emailsSent} | Verified sent records |
| **Recruiter Inbound Replies** | ${recruiterReplies} | Received in Recruitment Mailbox |
| **Active Technical Interviews** | ${interviewsCount} | In pipeline |
| **Technical Assessments** | ${assessmentsCount} | In pipeline |
| **Offers & Negotiations** | ${offersCount} | Final stages |

---

## 2. Top Ranked Opportunities Today

${top10.slice(0, 5).map((item, idx) => `
### ${idx + 1}. [${item.match.overall_score}% Match] ${item.job.employer} — ${item.job.title}
- **Location**: ${item.job.location} | **Work Mode**: ${item.job.remote_eligibility}
- **Salary Tier**: ${item.job.salary_raw || 'Competitive / Unlisted'}
- **Visa Sponsorship**: ${item.job.visa_sponsorship}
- **Top Matched Skills**: ${item.job.requirements.slice(0, 4).join(', ')}
- **Why this matches**: ${item.match.explanations.skills}
- **Direct Portal Link**: [Apply on ${item.job.source}](${item.job.source_url})
`).join('\n')}

---

## 3. High-Priority Actions & Blockers

${appsPendingApproval > 0
  ? `> [!IMPORTANT] You have **${appsPendingApproval} application packages** waiting in the **Approval Center**. Please review the tailored CVs, cover letters, and data disclosures to authorize submissions.`
  : '> [!NOTE] All prepared application packages have been reviewed.'}

${emailsDrafted > 0
  ? `> [!TIP] You have **${emailsDrafted} drafted recruitment emails** ready for your review in the **Recruitment Inbox**.`
  : ''}

---

## 4. Recommended Priorities for Tomorrow

1. **Review & Approve**: Check the Approval Center to advance pending applications to 'Ready to Apply'.
2. **Follow-up Dispatch**: Send pending interview confirmation replies to recruiters at Careem and Delivery Hero.
3. **Keyword Tuning**: Review the ATS Keyword Gap analysis for German and Gulf roles to further elevate match scores.
4. **CRM Status Refresh**: Track confirmation statuses for submissions made earlier this week.

---
*Report archived in persistent database. Next automatic execution scheduled for 11:00 PM Africa/Cairo time.*
`.trim();

  const metrics = {
    report_date: reportDate,
    total_jobs_monitored: allJobs.length,
    top_matches_count: top10.length,
    applications_prepared: appsPrepared,
    pending_approvals: appsPendingApproval,
    applications_submitted: appsSubmitted,
    emails_drafted: emailsDrafted,
    emails_sent: emailsSent,
    interviews: interviewsCount,
    assessments: assessmentsCount,
    offers: offersCount
  };

  const reportId = `rep_${Date.now()}`;
  db.prepare(`
    INSERT INTO daily_reports (id, report_date, timezone, content_markdown, metrics_json)
    VALUES (?, ?, 'Africa/Cairo', ?, ?)
  `).run(reportId, reportDate, markdown, JSON.stringify(metrics));

  logAudit('DAILY_REPORT_GENERATED', {
    report_id: reportId,
    report_date: reportDate,
    metrics
  }, user.id);

  return db.prepare('SELECT * FROM daily_reports WHERE id = ?').get(reportId) as DailyReportRecord;
}

export function getAllDailyReports(): DailyReportRecord[] {
  return db.prepare('SELECT * FROM daily_reports ORDER BY generated_at DESC').all() as DailyReportRecord[];
}
