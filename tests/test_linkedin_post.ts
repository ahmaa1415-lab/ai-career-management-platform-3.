import { parseLinkedInHiringPost } from '../lib/linkedin-post-parser';
import { getFullProfile } from '../lib/onboarding';

const text = `📢 We're Hiring! | Ourshopee – Dubai

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

const candidate = getFullProfile();
const result = parseLinkedInHiringPost(text, candidate || undefined);

console.log('Employer:', result.employer);
console.log('Location:', result.location);
console.log('Recruiter Email:', result.recruiter_email);
console.log('Recruiter Name:', result.recruiter_name);
console.log('Extracted Roles:', result.extracted_roles.map(r => ({
  title: r.title,
  exp: r.experience_years,
  qual: r.qualifications,
  domain: r.domain_expertise,
  mand: r.mandatory_requirements,
  match: r.match_score
})));
console.log('Disaggregated jobs count:', result.disaggregated_jobs.length);
