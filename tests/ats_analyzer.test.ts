import { analyzeResume } from '../lib/ai/ats-analyzer';
import { generateTailoredPackage } from '../lib/ai/resume-tailorer';
import { optimizeLinkedInProfile } from '../lib/ai/linkedin-optimizer';
import { FullCandidateProfile, JobListing } from '../lib/types';

console.log('--- RUNNING TS-03: ATS, CV & LinkedIn Intelligence Test ---');

try {
  const sampleCV = `
Aya Developer
Email: candidate@example.com | Phone: +201000000000 | Location: Cairo, Egypt
LinkedIn: linkedin.com/in/candidate | GitHub: github.com/candidate

Professional Summary:
Lead Full Stack Engineer with 10 years of experience building modern web applications and scalable APIs with TypeScript, React, Next.js, and Node.js.

Work Experience:
Lead Software Engineer | ScaleTech Solutions | 2021 - Present
- Architected enterprise Next.js and TypeScript microservices handling 2M+ monthly active requests.
- Reduced API p99 latency by 38% through database indexing, caching strategies, and query refactoring.
- Engineered automated GitHub Actions CI/CD workflows, slashing deployment duration from 45m to 7m.

Full Stack Engineer | WebWorks | 2018 - 2021
- Developed client-facing applications using React, Python, and PostgreSQL.
- Collaborated with product managers to deliver 15+ major roadmap features.

Education:
Bachelor of Science in Computer Science, Cairo University (2018)

Skills:
TypeScript, React, Next.js, Node.js, Python, PostgreSQL, Docker, CI/CD, Git, REST API
`.trim();

  // 1. Test ATS Analyzer
  const atsResult = analyzeResume(sampleCV, 'Lead Full Stack Engineer', 'Germany');
  console.log('✓ ATS Score calculated:', atsResult.overall_score);
  if (atsResult.overall_score < 70 || atsResult.overall_score > 100) {
    throw new Error(`ATS Score out of reasonable range: ${atsResult.overall_score}`);
  }
  if (!atsResult.formatting_evaluation.has_standard_sections) {
    throw new Error('Standard sections failed to detect in sample CV');
  }
  console.log('✓ Matched keywords found:', atsResult.keyword_gaps.matched_keywords.slice(0, 5));
  console.log('✓ Country specific advice for Germany generated:', atsResult.country_specific_recommendations.advice.length, 'rules');

  // 2. Test Tailored Package Generator
  const mockCandidate: FullCandidateProfile = {
    profile: {
      id: 'prof_test',
      user_id: 'user_01',
      onboarding_completed: 1,
      headline: 'Lead Full Stack Engineer',
      summary: '10 years exp in web apps and cloud systems',
      current_status: 'Employed',
      experience_years: 10,
      skills: ['TypeScript', 'Next.js', 'React', 'Node.js', 'PostgreSQL', 'Docker'],
      languages: ['English', 'Arabic'],
      target_roles: ['Staff Engineer', 'Lead Engineer'],
      target_industries: ['Fintech', 'SaaS'],
      target_seniority: 'Lead',
      min_salary: 90000,
      preferred_currency: 'USD',
      preferred_companies: ['Stripe'],
      excluded_companies: [],
      availability: '1 Month'
    },
    location: {
      user_id: 'user_01',
      target_countries: ['Germany', 'Egypt', 'Remote'],
      target_cities: ['Berlin', 'Cairo'],
      relocation_willing: 1,
      relocation_timeline: '3 months',
      visa_sponsorship_required: 1,
      work_authorizations: ['Egypt'],
      remote_eligibility: 'Global / EMEA',
      work_mode_preference: 'Remote'
    },
    permissions: {
      user_id: 'user_01',
      job_research_authorized: 1,
      cv_analysis_authorized: 1,
      gmail_connected: 0,
      read_emails_authorized: 1,
      draft_emails_authorized: 1,
      send_emails_authorized: 0,
      submit_applications_authorized: 0,
      disclose_data_authorized: 1,
      scheduled_automation_desired: 1
    }
  };

  const mockJob: JobListing = {
    id: 'job_test_01',
    employer: 'Fintech Europe GmbH',
    title: 'Lead Full Stack Engineer',
    location: 'Berlin, Germany (Hybrid / Remote)',
    source: 'LinkedIn Jobs',
    source_url: 'https://www.linkedin.com/jobs/view/12345678',
    publication_date: '2026-11-01',
    requirements: ['TypeScript', 'React', 'Node.js', 'PostgreSQL'],
    experience_required_years: 8,
    seniority: 'Lead',
    visa_sponsorship: 'Yes',
    remote_eligibility: 'Remote',
    is_verified: 1,
    raw_description: 'We are seeking a Lead Full Stack Engineer to scale our European payment ledger systems.'
  };

  const pkg = generateTailoredPackage(mockCandidate, mockJob);
  if (!pkg.tailored_cv.includes('Fintech Europe GmbH')) {
    throw new Error('Tailored CV does not reference employer!');
  }
  if (!pkg.cover_letter.includes('Fintech Europe GmbH')) {
    throw new Error('Cover letter does not reference employer!');
  }
  if (!pkg.screening_responses['What are your salary expectations?']) {
    throw new Error('Screening responses missing salary expectation answer!');
  }
  if (pkg.disclosures.personal_data_items.length === 0) {
    throw new Error('Personal data disclosure list empty!');
  }
  console.log('✓ Tailored package generated with custom CV, Cover Letter, and Disclosures.');

  // 3. Test LinkedIn Optimizer
  const linkedInResult = optimizeLinkedInProfile(mockCandidate);
  if (linkedInResult.copy_ready_content.headline_options.length < 3) {
    throw new Error('Expected 3 headline options');
  }
  if (!linkedInResult.copy_ready_content.about_section.includes('Lead Full Stack Engineer')) {
    throw new Error('LinkedIn About section does not include target role');
  }
  console.log('✓ LinkedIn optimization completed with copy-ready headlines and about section.');

  console.log('>>> TS-03 PASSED SUCCESSFULLY <<<');
} catch (error) {
  console.error('TS-03 FAILED:', error);
  process.exit(1);
}
