import { parseLinkedInHiringPost, applyToLinkedInPostRole } from '../lib/linkedin-post-parser';
import { getOrCreateDefaultUser } from '../lib/db';
import { getFullProfile } from '../lib/onboarding';

const postText = `📢 We're Hiring! | Ourshopee – Dubai

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

console.log('=== TEST LINKEDIN POST INGESTION ENGINE ===');
const parsed = parseLinkedInHiringPost(postText, candidate || undefined);

console.log('Company:', parsed.employer);
console.log('Recruiter Email:', parsed.recruiter_email);
console.log('Recruiter Name:', parsed.recruiter_name);
console.log('Location:', parsed.location);
console.log('Work Mode:', parsed.work_mode);
console.log('Working Days:', parsed.working_days);
console.log('\n--- 4 DISAGGREGATED ROLES ---');
parsed.extracted_roles.forEach((r, idx) => {
  console.log(`${idx + 1}. [${r.title}] - ${r.experience_years}+ yrs exp | Mandatory: ${r.mandatory_requirements.join(', ')}`);
});

const catJob = parsed.disaggregated_jobs.find(j => j.title.toLowerCase().includes('category')) || parsed.disaggregated_jobs[0];

console.log('\n--- TARGET ROLE MATCHING AYA HAMOUDA ---');
console.log('Job Title:', catJob.title);
console.log('Company:', catJob.employer);
console.log('Location:', catJob.location);
console.log('Calculated Match Score:', catJob.match_score + '%');
console.log('Job Requirements:', catJob.requirements);

if (parsed.recruiter_email && candidate) {
  const appResult = applyToLinkedInPostRole(
    user.id,
    catJob,
    parsed.recruiter_email,
    candidate,
    parsed.recruiter_name
  );

  console.log('\n--- AUTOMATED APPLICATION PACKAGE PREPARED ---');
  console.log('Application ID:', appResult.application_id);
  console.log('Status:', appResult.status);
  console.log('To Recruiter:', appResult.email_recipient);
  console.log('Subject:', appResult.email_subject);
  console.log('Attached CV Version:', appResult.cv_file);
  console.log('\n--- EMAIL DRAFT PREVIEW ---');
  console.log(appResult.email_body);
}
