import { calculateMatchScore, rankTopOpportunities } from '../lib/jobs/matcher';
import { syncAndDeduplicateJobs, getAllVerifiedJobs } from '../lib/jobs/aggregator';
import { FullCandidateProfile } from '../lib/types';

console.log('--- RUNNING TS-04: Matching Engine & 8-Criterion Scoring Test ---');

try {
  // Sync jobs to DB and get verified set
  const syncResult = syncAndDeduplicateJobs();
  console.log(`✓ Job sync complete: ${syncResult.uniqueInserted} unique listings, ${syncResult.duplicatesDetected} duplicate detected.`);

  if (syncResult.duplicatesDetected < 1) {
    throw new Error('Expected at least 1 duplicate listing to be detected and filtered!');
  }

  const jobs = getAllVerifiedJobs();
  console.log(`✓ Total verified jobs retrieved from DB: ${jobs.length}`);

  const mockCandidate: FullCandidateProfile = {
    profile: {
      id: 'prof_test',
      user_id: 'user_01',
      onboarding_completed: 1,
      headline: 'Lead Full Stack Engineer',
      summary: '10 years experience building scalable systems with TypeScript, Next.js, and Node.js.',
      current_status: 'Employed',
      experience_years: 10,
      skills: ['TypeScript', 'Next.js', 'React', 'Node.js', 'PostgreSQL', 'Docker', 'FastAPI', 'Distributed Systems'],
      languages: ['English', 'Arabic'],
      target_roles: ['Staff Software Engineer', 'Lead Full Stack Engineer'],
      target_industries: ['Fintech', 'Enterprise SaaS', 'AI & Cloud Infrastructure'],
      target_seniority: 'Lead',
      min_salary: 100000,
      preferred_currency: 'USD',
      preferred_companies: ['Stripe', 'GitLab', 'Supabase'],
      excluded_companies: ['SpamCorp'],
      availability: '1 Month'
    },
    location: {
      user_id: 'user_01',
      target_countries: ['Remote', 'Egypt', 'United Arab Emirates', 'Germany'],
      target_cities: ['Cairo', 'Dubai', 'Berlin'],
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

  // Test single match score calculation
  const firstJob = jobs[0];
  const breakdown = calculateMatchScore(mockCandidate, firstJob);

  // Verify weights sum to 1.0 (100%)
  const totalWeight = breakdown.skills_weight +
    breakdown.seniority_weight +
    breakdown.industry_weight +
    breakdown.salary_weight +
    breakdown.location_weight +
    breakdown.visa_weight +
    breakdown.employer_weight +
    breakdown.recency_weight;

  if (Math.abs(totalWeight - 1.0) > 0.001) {
    throw new Error(`Weights do not sum to 1.0! Sum: ${totalWeight}`);
  }
  console.log('✓ Verified 8 criteria weights sum exactly to 1.0 (100%):', {
    skills: breakdown.skills_weight,
    seniority: breakdown.seniority_weight,
    industry: breakdown.industry_weight,
    salary: breakdown.salary_weight,
    location: breakdown.location_weight,
    visa: breakdown.visa_weight,
    employer: breakdown.employer_weight,
    recency: breakdown.recency_weight,
  });

  if (breakdown.overall_score < 0 || breakdown.overall_score > 100) {
    throw new Error(`Score out of bounds: ${breakdown.overall_score}`);
  }
  console.log(`✓ Sample job (${firstJob.employer} - ${firstJob.title}) score: ${breakdown.overall_score}%`);

  // Verify all 8 explanations exist
  const expKeys = Object.keys(breakdown.explanations);
  if (expKeys.length !== 8) {
    throw new Error(`Expected 8 explanations, found ${expKeys.length}`);
  }
  console.log('✓ All 8 criteria explanations verified.');

  // Test Top 10 ranking
  const top10 = rankTopOpportunities(mockCandidate, jobs);
  console.log(`✓ Top ${top10.length} ranked opportunities generated:`);
  top10.forEach((item, idx) => {
    console.log(`  #${idx + 1}: [${item.match.overall_score}%] ${item.job.employer} - ${item.job.title} (${item.job.location})`);
  });

  // Verify sorted descending
  for (let i = 0; i < top10.length - 1; i++) {
    if (top10[i].match.overall_score < top10[i + 1].match.overall_score) {
      throw new Error(`Top 10 list is not sorted in descending score order at index ${i}!`);
    }
  }
  console.log('✓ Top 10 list confirmed sorted descending by score.');

  console.log('>>> TS-04 PASSED SUCCESSFULLY <<<');
} catch (error) {
  console.error('TS-04 FAILED:', error);
  process.exit(1);
}
