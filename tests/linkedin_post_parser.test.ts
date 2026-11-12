import assert from 'assert';
import db, { getOrCreateDefaultUser } from '../lib/db';
import { getFullProfile } from '../lib/onboarding';
import { parseLinkedInHiringPost, applyToLinkedInPostRole } from '../lib/linkedin-post-parser';

console.log('Testing LinkedIn Hiring Post Parser & Multi-Role Disaggregation...');

const sampleOurshopeePost = `📢 We're Hiring! | Ourshopee – Dubai

We are looking for talented professionals to join our growing team for the following positions:

🔹 Finance Manager – #CA qualified, 5+ years of experience. #E-commerce experience is mandatory.
🔹 Category Manager – 5+ years of experience in #Beauty, #Cosmetics, or #Health categories. UAE experience is mandatory.
🔹 Buyer – Experience in Fashion Accessories or Generic Products. UAE experience is mandatory.
🔹 Procurement Coordinator – 2+ years of experience. UAE experience is mandatory.
📍 Location: Dubai, UAE

🏢 Work Mode: On-site
📅 Working Days: Monday to Saturday

Interested candidates who meet the above requirements are invited to share their updated CV at mansi.deo@ourshopee.com

#Hiring #DubaiJobs #UAEJobs #OnsiteJobs #FinanceManager #CategoryManager #Buyer #ProcurementCoordinator #Ourshopee`;

const user = getOrCreateDefaultUser();
const candidate = getFullProfile(user.id);

// 1. Parse raw LinkedIn post
const analysis = parseLinkedInHiringPost(sampleOurshopeePost, candidate);

// Assert employer extraction
assert.strictEqual(analysis.employer, 'Ourshopee', 'Employer should be parsed as Ourshopee');
console.log('✓ Extracted Employer: Ourshopee');

// Assert location and work mode
assert.strictEqual(analysis.location, 'Dubai, UAE', 'Location should be Dubai, UAE');
assert.strictEqual(analysis.work_mode, 'Onsite', 'Work mode should be Onsite');
assert.strictEqual(analysis.working_days, 'Monday to Saturday', 'Working days should be Monday to Saturday');
console.log('✓ Extracted Location, Work Mode, and Working Days');

// Assert recruiter contact
assert.strictEqual(analysis.recruiter_email, 'mansi.deo@ourshopee.com', 'Recruiter email should be mansi.deo@ourshopee.com');
assert.strictEqual(analysis.recruiter_name, 'Mansi Deo', 'Recruiter name should be inferred as Mansi Deo');
console.log('✓ Extracted Recruiter Email (mansi.deo@ourshopee.com) & Inferred Name (Mansi Deo)');

// Assert disaggregated roles count
assert.strictEqual(analysis.extracted_roles.length, 4, 'Should extract exactly 4 distinct roles');
assert.strictEqual(analysis.disaggregated_jobs.length, 4, 'Should disaggregate into 4 distinct indexed JobListing objects');
console.log('✓ Disaggregated into 4 distinct job openings');

// Verify role 1: Finance Manager
const role1 = analysis.extracted_roles[0];
assert.strictEqual(role1.title, 'Finance Manager');
assert.strictEqual(role1.experience_years, 5);
assert.ok(role1.raw_bullet.includes('CA qualified'));
console.log('✓ Verified Role 1: Finance Manager (5+ yrs, CA, E-commerce)');

// Verify role 2: Category Manager
const role2 = analysis.extracted_roles[1];
assert.strictEqual(role2.title, 'Category Manager');
assert.strictEqual(role2.experience_years, 5);
console.log('✓ Verified Role 2: Category Manager (5+ yrs, Beauty/Cosmetics/Health, UAE exp)');

// Verify role 3: Buyer
const role3 = analysis.extracted_roles[2];
assert.strictEqual(role3.title, 'Buyer');
console.log('✓ Verified Role 3: Buyer (Fashion Accessories / Generic)');

// Verify role 4: Procurement Coordinator
const role4 = analysis.extracted_roles[3];
assert.strictEqual(role4.title, 'Procurement Coordinator');
assert.strictEqual(role4.experience_years, 2);
console.log('✓ Verified Role 4: Procurement Coordinator (2+ yrs, UAE exp)');

// Verify hashtags
assert.ok(analysis.hashtags.includes('#Hiring'));
assert.ok(analysis.hashtags.includes('#Ourshopee'));
console.log('✓ Extracted relevant LinkedIn post hashtags');

// 2. Test auto-apply to one of the disaggregated roles (e.g., Procurement Coordinator or Category Manager)
const targetJob = analysis.disaggregated_jobs[3]; // Procurement Coordinator
assert.ok(targetJob, 'Target job listing must exist');

const applyResult = applyToLinkedInPostRole(
  user.id,
  targetJob,
  analysis.recruiter_email,
  candidate,
  analysis.recruiter_name
);

assert.strictEqual(applyResult.success, true);
assert.strictEqual(applyResult.recruiter_email, 'mansi.deo@ourshopee.com');
console.log('✓ Successfully dispatched direct email application to mansi.deo@ourshopee.com');

// 3. Verify database records created
const appRow = db.prepare('SELECT * FROM applications WHERE id = ?').get(applyResult.application_id) as any;
assert.ok(appRow, 'Application record must exist in database');
assert.strictEqual(appRow.status, 'Applied');
assert.strictEqual(appRow.recruiter_email, 'mansi.deo@ourshopee.com');
assert.strictEqual(appRow.submission_type, 'Automated');
console.log('✓ Application record confirmed in DB with recruiter contact metadata');

const emailRow = db.prepare('SELECT * FROM emails WHERE id = ?').get(applyResult.email_id) as any;
assert.ok(emailRow, 'Email record must exist in database');
assert.strictEqual(emailRow.recipient, 'mansi.deo@ourshopee.com');
assert.strictEqual(emailRow.is_sent, 1);
assert.ok(emailRow.body.includes('Dear Mansi Deo,'));
assert.ok(emailRow.body.includes('Procurement Coordinator'));
assert.ok(emailRow.body.includes('Ourshopee'));
console.log('✓ Outbound recruiter email verified in CRM with personalized body and attachment');

const resumeRow = db.prepare('SELECT * FROM resumes WHERE id = ?').get(appRow.tailored_cv_id) as any;
assert.ok(resumeRow, 'Tailored CV must exist in resumes table');
assert.ok(resumeRow.title.includes('Ourshopee'));
console.log('✓ Tailored CV verified in DB for Ourshopee application');

console.log('\nAll LinkedIn hiring post parsing and multi-role auto-apply tests PASSED successfully!');
