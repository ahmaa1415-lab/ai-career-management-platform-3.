import db, { getOrCreateDefaultUser } from '../lib/db';
import { prepareApplicationPackage, approveApplicationPackage, recordApplicationSubmission } from '../lib/applications/workflow';
import { getAllApplications, updateApplicationStatus, exportCRMDataAsCSV, exportCRMDataAsJSON } from '../lib/crm/pipeline';
import { getAllEmails, generateEmailDraft, sendEmailWithApproval } from '../lib/email/inbox';
import { generateDailyExecutiveReport, getCairoCurrentTime, getAllDailyReports } from '../lib/automation/daily-report';
import { getFullProfile } from '../lib/onboarding';

console.log('--- RUNNING TS-06 through TS-09: Workflow, CRM, Email, and Reporting Test ---');

try {
  const user = getOrCreateDefaultUser();
  const candidate = getFullProfile(user.id);
  if (!candidate) throw new Error('Candidate not found');

  // Fetch verified job to apply for
  const job = db.prepare("SELECT * FROM job_listings WHERE employer = 'GitLab' LIMIT 1").get() as any;
  if (!job) throw new Error('GitLab job not found in DB');

  // Clean up any previous test application for idempotent test runs
  db.prepare('DELETE FROM applications WHERE user_id = ? AND job_id = ?').run(user.id, job.id);

  // 1. Prepare Application Package (Workflow)
  console.log('1. Preparing application package for GitLab...');
  const app = prepareApplicationPackage(job.id, user.id);
  console.log(`✓ Application created with ID: ${app.id}, initial status: ${app.status}`);
  if (app.status !== 'Approval Pending') {
    throw new Error(`Expected initial status 'Approval Pending', got '${app.status}'`);
  }
  if (!app.tailored_cv_id) {
    throw new Error('Tailored CV was not created/linked!');
  }

  // 2. Test Human Approval Security Gate
  console.log('2. Testing human approval security gate...');
  let gateBlocked = false;
  try {
    // Attempt to mark applied without human approval
    recordApplicationSubmission(app.id, user.id);
  } catch (err: any) {
    gateBlocked = true;
    console.log('✓ Security gate blocked submission without human approval:', err.message);
  }
  if (!gateBlocked) {
    throw new Error('SECURITY VIOLATION: Application was submitted without prior human approval!');
  }

  // 3. Grant Human Approval
  console.log('3. Granting human approval in Approval Center...');
  const approvedApp = approveApplicationPackage(app.id, user.id, true);
  if (approvedApp.status !== 'Ready to Apply' || approvedApp.human_approved !== 1) {
    throw new Error('Approval failed to update status to "Ready to Apply"');
  }
  console.log('✓ Application approved by human. Status now:', approvedApp.status);

  // 4. Record Application Submission
  console.log('4. Recording application submission...');
  const submittedApp = recordApplicationSubmission(app.id, user.id, 'Applied on GitLab official careers page.');
  if (submittedApp.status !== 'Applied' || submittedApp.submission_confirmed !== 1) {
    throw new Error('Submission confirmation failed');
  }
  console.log('✓ Application submission confirmed in CRM. Status:', submittedApp.status);

  // 5. Test CRM Lifecycle Updates & Pipeline
  console.log('5. Testing CRM status transitions...');
  const interviewApp = updateApplicationStatus(app.id, 'Interview', 'Technical screen scheduled with engineering manager.', user.id);
  if (interviewApp.status !== 'Interview') {
    throw new Error('CRM failed to advance status to Interview');
  }
  console.log('✓ CRM updated to stage: Interview');

  // 6. Test CRM Export
  const csv = exportCRMDataAsCSV(user.id);
  const json = exportCRMDataAsJSON(user.id);
  if (!csv.includes('GitLab') || !json.includes('GitLab')) {
    throw new Error('CRM export missing application records!');
  }
  console.log('✓ CRM export verified (CSV & JSON).');

  // 7. Test Recruitment Email Inbox & Drafting
  console.log('7. Testing Recruitment Email Inbox...');
  const emails = getAllEmails();
  console.log(`✓ Inbox contains ${emails.length} categorized messages.`);
  if (emails.length === 0) {
    throw new Error('Recruitment inbox is empty!');
  }

  const sampleEmail = emails[0];
  const draft = generateEmailDraft('Reply', sampleEmail, candidate);
  console.log(`✓ Generated email draft (ID: ${draft.id}), is_draft: ${draft.is_draft}, subject: ${draft.subject}`);

  // Test send email security gate (attempting to send without user confirmation)
  let sendBlocked = false;
  try {
    sendEmailWithApproval(draft.id, false, user.id);
  } catch (err: any) {
    sendBlocked = true;
    console.log('✓ Security gate blocked email dispatch without explicit confirmation:', err.message);
  }
  if (!sendBlocked) {
    throw new Error('SECURITY VIOLATION: Email was sent without explicit confirmation!');
  }

  // Send email with explicit confirmation
  const sendResult = sendEmailWithApproval(draft.id, true, user.id);
  console.log(`✓ Email send confirmed: ${sendResult.message}`);
  if (sendResult.email.is_sent !== 1 || sendResult.email.is_draft !== 0) {
    throw new Error('Email send flags not updated in database!');
  }

  // 8. Test Cairo Timezone & Daily Reporting
  console.log('8. Testing Daily Reporting & Cairo Timezone...');
  const cairoTime = getCairoCurrentTime();
  console.log('✓ Cairo local time computed:', cairoTime.cairoTimeString);
  if (!cairoTime.cairoTimeString.includes('Africa/Cairo')) {
    throw new Error('Timezone string missing Africa/Cairo');
  }

  const report = generateDailyExecutiveReport(user.id);
  console.log(`✓ Daily report generated (ID: ${report.id}, Date: ${report.report_date})`);
  const allReports = getAllDailyReports();
  if (allReports.length === 0) {
    throw new Error('Daily report not persisted in database!');
  }
  console.log(`✓ Verified ${allReports.length} daily reports in database.`);

  console.log('>>> TS-06, TS-07, TS-08, TS-09 PASSED SUCCESSFULLY <<<');
} catch (error) {
  console.error('TEST SUITE FAILED:', error);
  process.exit(1);
}
