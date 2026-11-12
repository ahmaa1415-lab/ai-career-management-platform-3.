import db, { getOrCreateDefaultUser } from '../lib/db';
import { isOnboardingComplete, saveOnboarding, getFullProfile, generateProfileSummary } from '../lib/onboarding';

console.log('--- RUNNING TS-02: Onboarding Gating & Location Verification Test ---');

try {
  // Use a dedicated isolated test user so we do not mutate or erase the real profile of Aya Hamouda Mahmoud Ali
  const testUserId = 'test_user_onboarding_isolated';
  db.prepare("INSERT OR IGNORE INTO users (id, email, full_name) VALUES (?, 'test_onboarding@careerapp.local', 'Test Candidate')").run(testUserId);

  // Reset profile state for testing
  db.prepare('DELETE FROM profiles WHERE user_id = ?').run(testUserId);
  db.prepare('DELETE FROM profile_locations WHERE user_id = ?').run(testUserId);
  db.prepare('DELETE FROM profile_permissions WHERE user_id = ?').run(testUserId);

  // 1. Verify gate blocks un-onboarded user
  const initialCheck = isOnboardingComplete(testUserId);
  if (initialCheck !== false) {
    throw new Error('GATE FAILURE: User without completed onboarding passed gating check!');
  }
  console.log('✓ Gatekeeper correctly blocks un-onboarded candidate.');

  // 2. Verify non-negotiable location validation (attempt without target_countries)
  let rejected = false;
  try {
    saveOnboarding(testUserId, {
      profile: { headline: 'Test Dev' },
      location: { target_countries: [] }, // empty!
      permissions: { job_research_authorized: 1 },
    });
  } catch (err: any) {
    rejected = true;
    console.log('✓ Gatekeeper correctly rejected empty target countries with message:', err.message);
  }
  if (!rejected) {
    throw new Error('GATE FAILURE: System accepted onboarding without explicit target countries!');
  }

  // 3. Complete onboarding with explicit countries (Egypt, UAE, Germany, Remote) and permissions
  const saved = saveOnboarding(testUserId, {
    profile: {
      headline: 'Lead Full Stack & AI Systems Engineer',
      summary: '10+ years engineering modern scalable web applications, distributed microservices, and AI workflows.',
      current_status: 'Employed',
      experience_years: 10,
      skills: ['TypeScript', 'Next.js', 'React', 'Node.js', 'Python', 'SQL', 'Docker', 'FastAPI'],
      languages: ['English', 'Arabic'],
      target_roles: ['Staff Software Engineer', 'Lead Full Stack Engineer', 'AI Solutions Architect'],
      target_industries: ['Fintech', 'Enterprise SaaS', 'AI & Cloud Infrastructure'],
      target_seniority: 'Lead / Staff',
      min_salary: 85000,
      preferred_currency: 'USD',
      preferred_companies: ['Stripe', 'Supabase', 'Vercel', 'Automattic', 'Remote First'],
      excluded_companies: ['SpamCorp'],
      availability: '1 Month Notice',
    },
    location: {
      target_countries: ['Egypt', 'United Arab Emirates', 'Germany', 'Remote (Global)'],
      target_cities: ['Cairo', 'Dubai', 'Berlin'],
      relocation_willing: 1,
      relocation_timeline: '3 to 6 months',
      visa_sponsorship_required: 1,
      work_authorizations: ['Egypt (Citizen)'],
      remote_eligibility: 'Global / EMEA',
      work_mode_preference: 'Remote',
    },
    permissions: {
      job_research_authorized: 1,
      cv_analysis_authorized: 1,
      gmail_connected: 0,
      read_emails_authorized: 1,
      draft_emails_authorized: 1,
      send_emails_authorized: 0, // human approval required
      submit_applications_authorized: 0, // human approval required
      disclose_data_authorized: 1,
      scheduled_automation_desired: 1,
    },
    cvText: 'Experienced Senior Full Stack Engineer specializing in TypeScript, Next.js, distributed databases and GenAI orchestration.',
  });

  // 4. Verify gating now passes
  const afterCheck = isOnboardingComplete(testUserId);
  if (!afterCheck) {
    throw new Error('GATE FAILURE: Gating check returned false after full onboarding was saved!');
  }
  console.log('✓ Gatekeeper verified: Onboarding is 100% complete.');

  // 5. Test summary generation
  const summary = generateProfileSummary(saved);
  console.log('✓ Profile Summary generated successfully:\n', summary);

  console.log('>>> TS-02 PASSED SUCCESSFULLY <<<');
} catch (error) {
  console.error('TS-02 FAILED:', error);
  process.exit(1);
}
