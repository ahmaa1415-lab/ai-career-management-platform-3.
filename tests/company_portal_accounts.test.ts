import assert from 'assert';
import db, { getOrCreateDefaultUser } from '../lib/db';
import { getFullProfile } from '../lib/onboarding';
import { getAllVerifiedJobs, syncAndDeduplicateJobs } from '../lib/jobs/aggregator';
import {
  detectPortalRequirement,
  autoProvisionCompanyPortalAccount,
  getCompanyPortalAccounts,
  getCompanyPortalStats
} from '../lib/company-portals';
import { runAutonomousApplyEverywhere } from '../lib/applications/autonomous-engine';
import { generateGuideResponse } from '../lib/ai/chatbot-guide';

console.log('================================================================');
console.log('--- RUNNING TS-13: COMPANY PORTAL ACCOUNTS & LINKEDIN REDIRECTIONS TEST ---');
console.log('================================================================');

// Ensure database and listings are ready
syncAndDeduplicateJobs();
const user = getOrCreateDefaultUser();
const candidate = getFullProfile(user.id);
assert(candidate, 'Candidate profile must exist');

// 1. Test Portal Requirement Detection
console.log('1. Testing External Company Site Detection on LinkedIn listings...');
const allJobs = getAllVerifiedJobs();

const klarnaJob = allJobs.find(j => j.employer.toLowerCase().includes('klarna'));
assert(klarnaJob, 'Klarna job listing must be indexed');
const klarnaReq = detectPortalRequirement(klarnaJob);
assert.strictEqual(klarnaReq.requiresAccount, true, 'Klarna application must require external company portal account');
assert.strictEqual(klarnaReq.portalPlatform, 'Workday', 'Klarna ATS must be detected as Workday');
console.log(`[✓ PASS] 1a. Klarna detected: Requires Account = ${klarnaReq.requiresAccount}, Platform = ${klarnaReq.portalPlatform}, Portal = ${klarnaReq.portalUrl}`);

const deliveryHeroJob = allJobs.find(j => j.employer.toLowerCase().includes('delivery hero'));
assert(deliveryHeroJob, 'Delivery Hero listing must exist');
const dhReq = detectPortalRequirement(deliveryHeroJob);
assert.strictEqual(dhReq.requiresAccount, true, 'Delivery Hero must require external company portal account');
console.log(`[✓ PASS] 1b. Delivery Hero detected: Platform = ${dhReq.portalPlatform}, Portal = ${dhReq.portalUrl}`);

const careemJob = allJobs.find(j => j.employer.toLowerCase().includes('careem'));
assert(careemJob, 'Careem job must exist');
const careemReq = detectPortalRequirement(careemJob);
assert.strictEqual(careemReq.requiresAccount, true, 'Careem must require portal account');
assert.strictEqual(careemReq.portalPlatform, 'Lever', 'Careem platform must be Lever');
console.log(`[✓ PASS] 1c. Careem detected: Platform = ${careemReq.portalPlatform}, Portal = ${careemReq.portalUrl}`);

const recruiterPost = allJobs.find(j => j.id === 'post_li_01');
assert(recruiterPost, 'LinkedIn recruiter post must exist');
const postReq = detectPortalRequirement(recruiterPost);
assert.strictEqual(postReq.requiresAccount, false, 'Recruiter post must be direct outreach (no portal account needed)');
console.log(`[✓ PASS] 1d. LinkedIn Recruiter Post detected: Direct outreach (no external portal required)`);

// 2. Test Automated Company Portal Account Creation & Credential Provisioning
console.log('2. Testing automated candidate account provisioning for company site...');
const account = autoProvisionCompanyPortalAccount(user.id, klarnaJob, candidate);
assert(account.id, 'Account ID must be generated');
assert.strictEqual(account.employer, 'Klarna');
assert.strictEqual(account.portal_platform, 'Workday');
assert.strictEqual(account.account_email, 'candidate@example.com');
assert.strictEqual(account.status, 'Registered & Applied');
assert(account.confirmation_reference?.startsWith('APP-KLAR-'), 'Confirmation reference must follow convention APP-KLAR-YYYYMM-XXXX');
console.log(`[✓ PASS] 2. Account created for Klarna Workday: Ref = ${account.confirmation_reference}, Email = ${account.account_email}`);

// 3. Test Confirmation Email in CRM Recruitment Inbox
console.log('3. Verifying company portal registration email generated in CRM inbox...');
const confirmationEmail = db.prepare(`
  SELECT * FROM emails WHERE sender LIKE '%Klarna%' AND category = 'Confirmation' ORDER BY created_at DESC LIMIT 1
`).get() as any;
assert(confirmationEmail, 'Inbound confirmation email must be generated from Klarna');
assert(confirmationEmail.subject.includes(account.confirmation_reference!), 'Email subject must cite reference number');
console.log(`[✓ PASS] 3. Confirmation email received: "${confirmationEmail.subject}"`);

// 4. Test Company Portal Account Retrieval & Stats API
console.log('4. Testing portal accounts retrieval & metrics...');
const stats = getCompanyPortalStats(user.id);
assert(stats.total_accounts >= 1, 'Total portal accounts must be at least 1');
assert(stats.active_accounts >= 1, 'Active portal accounts must be at least 1');
console.log(`[✓ PASS] 4. Company portal stats verified: Total = ${stats.total_accounts}, Active = ${stats.active_accounts}, Platforms =`, stats.platforms_breakdown);

// 5. Test Autonomous Engine Integration with Company Portal Provisioning
console.log('5. Testing Autonomous Apply Engine auto-creating company accounts for external sites...');
const autopilotResult = runAutonomousApplyEverywhere(user.id, { minMatchScore: 70, forceAll: false });
assert.strictEqual(autopilotResult.success, true, 'Autopilot must execute successfully');
assert(autopilotResult.company_portal_accounts_created >= 1, 'Autopilot must track created portal accounts');

// Verify application records in database have external_portal_account_created = 1 and confirmation_reference
const appWithPortal = db.prepare(`
  SELECT a.id, j.employer, a.status, a.external_portal_account_created, a.confirmation_reference
  FROM applications a
  JOIN job_listings j ON a.job_id = j.id
  WHERE a.user_id = ? AND a.external_portal_account_created = 1
  LIMIT 1
`).get(user.id) as any;
assert(appWithPortal, 'At least one application must have external_portal_account_created = 1');
assert(appWithPortal.confirmation_reference, 'Application must store official confirmation reference');
console.log(`[✓ PASS] 5. Application verified with Company Portal Account: Employer = ${appWithPortal.employer}, Ref = ${appWithPortal.confirmation_reference}`);

// 6. Test AI Chatbot Guide handling questions about external company site accounts
console.log('6. Testing AI Chatbot knowledge on external company site account creation...');
const chatbotQuery = 'what happens if linkedin application lead you to a company site to create an account to apply to the jobs';
const guide = generateGuideResponse(chatbotQuery);
assert(guide.response.includes('External Company Site'), 'Response must explain external company site handling');
assert(guide.response.includes('Workday') || guide.response.includes('account'), 'Response must mention account auto-creation and Workday/ATS');
assert(guide.response.includes('Company Portal Vault'), 'Response must mention Company Portal Vault');
console.log(`[✓ PASS] 6. AI Chatbot guide correctly explained external company site account auto-creation!`);

console.log('================================================================');
console.log('>>> ALL 6/6 COMPANY PORTAL & LINKEDIN REDIRECTION TESTS PASSED! <<<');
console.log('================================================================\n');
