import { calculateMatchScore } from '../lib/jobs/matcher';
import { FullCandidateProfile, JobListing } from '../lib/types';

async function verifySyntheticProfiles() {
  console.log('=== [SYNTHETIC TEST PROFILES & RECOMMENDATION ISOLATION TEST] ===\n');

  // 1. Candidate A: Synthetic Commercial Candidate
  const candidateCommercial: FullCandidateProfile = {
    user: {
      id: 'usr_synth_comm_01',
      email: 'candidate.commercial@staging.local',
      full_name: 'Synthetic Commercial Lead'
    },
    profile: {
      id: 'prof_synth_comm_01',
      user_id: 'usr_synth_comm_01',
      onboarding_completed: true,
      headline: 'Senior Category Manager & Trade Marketing Lead | FMCG, Beauty & Personal Care',
      summary: 'Experienced Commercial Lead with 7+ years in FMCG, Retail Assortment, Beauty brand growth, and Trade Marketing across GCC & North Africa.',
      current_status: 'Actively Looking',
      experience_years: 7,
      skills: [
        'Category Management',
        'Trade Marketing',
        'FMCG',
        'Beauty & Personal Care',
        'Joint Business Planning (JBP)',
        'Assortment Optimization',
        'Planogram Strategy',
        'Distributor Management'
      ],
      languages: ['Arabic', 'English'],
      target_roles: ['Category Manager', 'Trade Marketing Manager', 'Commercial Lead'],
      target_industries: ['FMCG', 'Beauty & Cosmetics', 'Retail', 'Pharmaceuticals'],
      target_seniority: 'Senior',
      min_salary: 5000,
      preferred_currency: 'USD',
      preferred_companies: ["L'Oreal", 'Unilever', 'P&G', 'Chalhoub Group'],
      excluded_companies: [],
      availability: 'Immediate'
    },
    location: {
      id: 'loc_synth_comm_01',
      user_id: 'usr_synth_comm_01',
      current_physical_location: 'Cairo, Egypt',
      target_countries: ['United Arab Emirates', 'Saudi Arabia', 'Egypt'],
      target_cities: ['Dubai', 'Riyadh', 'Cairo'],
      resume_derived_locations: ['Cairo'],
      relocation_willing: true,
      relocation_timeline: '1-2 months',
      visa_sponsorship_required: true,
      work_authorizations: ['Egyptian Citizen'],
      remote_eligibility: 'Open to Remote or Relocation',
      work_mode_preference: 'Hybrid'
    },
    permissions: {
      id: 'perm_synth_comm_01',
      user_id: 'usr_synth_comm_01',
      job_research_authorized: true,
      cv_analysis_authorized: true,
      gmail_connected: false,
      read_emails_authorized: false,
      draft_emails_authorized: true,
      send_emails_authorized: false,
      submit_applications_authorized: false,
      disclose_data_authorized: true,
      scheduled_automation_desired: true
    },
    resumes: []
  };

  // 2. Candidate B: Synthetic Technology Candidate
  const candidateTech: FullCandidateProfile = {
    user: {
      id: 'usr_synth_tech_02',
      email: 'candidate.tech@staging.local',
      full_name: 'Synthetic Cloud Architect'
    },
    profile: {
      id: 'prof_synth_tech_02',
      user_id: 'usr_synth_tech_02',
      onboarding_completed: true,
      headline: 'Principal Cloud Infrastructure Architect & Technical Lead | Distributed Systems',
      summary: '10+ years architecting multi-region cloud platforms, Kubernetes orchestration, resilient microservices, and AWS/GCP technical infrastructure.',
      current_status: 'Actively Looking',
      experience_years: 10,
      skills: [
        'Cloud Infrastructure',
        'Technical Architecture',
        'Software Engineering',
        'Kubernetes',
        'Docker',
        'AWS',
        'Distributed Systems',
        'Microservices',
        'Golang',
        'Python',
        'Terraform'
      ],
      languages: ['English', 'German'],
      target_roles: ['Cloud Architect', 'Principal Systems Architect', 'Lead Software Engineer'],
      target_industries: ['Cloud Computing', 'Enterprise Software', 'FinTech'],
      target_seniority: 'Lead / Principal',
      min_salary: 8000,
      preferred_currency: 'USD',
      preferred_companies: ['Google Cloud', 'AWS', 'Datadog', 'Stripe'],
      excluded_companies: [],
      availability: '1 month'
    },
    location: {
      id: 'loc_synth_tech_02',
      user_id: 'usr_synth_tech_02',
      current_physical_location: 'Berlin, Germany',
      target_countries: ['Germany', 'United Arab Emirates', 'United Kingdom'],
      target_cities: ['Berlin', 'Dubai', 'London'],
      resume_derived_locations: ['Berlin'],
      relocation_willing: true,
      relocation_timeline: 'Immediate',
      visa_sponsorship_required: false,
      work_authorizations: ['EU Citizen'],
      remote_eligibility: 'Remote',
      work_mode_preference: 'Remote'
    },
    permissions: {
      id: 'perm_synth_tech_02',
      user_id: 'usr_synth_tech_02',
      job_research_authorized: true,
      cv_analysis_authorized: true,
      gmail_connected: false,
      read_emails_authorized: false,
      draft_emails_authorized: true,
      send_emails_authorized: false,
      submit_applications_authorized: false,
      disclose_data_authorized: true,
      scheduled_automation_desired: true
    },
    resumes: []
  };

  // Test Job Listings
  const jobCommercial: JobListing = {
    id: 'job_test_comm_01',
    title: 'Senior Category Manager - Beauty & FMCG',
    employer: "L'Oreal Middle East",
    country: 'United Arab Emirates',
    city: 'Dubai',
    work_mode: 'Hybrid',
    job_family: 'Category Management',
    seniority: 'Senior',
    required_years_experience: 6,
    required_skills: ['Category Management', 'Trade Marketing', 'FMCG', 'Assortment Optimization', 'Joint Business Planning (JBP)'],
    salary_min: 6000,
    salary_max: 8500,
    salary_currency: 'USD',
    raw_description: 'Manage beauty and personal care portfolio, develop planograms, lead retailer negotiations and JBP across UAE & GCC markets.',
    authenticity_status: 'VERIFIED_OPEN',
    source_type: 'official_career_page',
    is_active: true
  };

  const jobTech: JobListing = {
    id: 'job_test_tech_02',
    title: 'Principal Cloud Infrastructure Architect',
    employer: 'Global Cloud Systems',
    country: 'United Arab Emirates',
    city: 'Dubai',
    work_mode: 'Remote',
    job_family: 'Software Engineering',
    seniority: 'Lead / Principal',
    required_years_experience: 8,
    required_skills: ['Cloud Infrastructure', 'Kubernetes', 'AWS', 'Distributed Systems', 'Technical Architecture'],
    salary_min: 9000,
    salary_max: 12000,
    salary_currency: 'USD',
    raw_description: 'Lead technical architecture for enterprise multi-tenant cloud platforms, Kubernetes container orchestration, and high-throughput microservices.',
    authenticity_status: 'VERIFIED_OPEN',
    source_type: 'official_career_page',
    is_active: true
  };

  console.log('1. Evaluating Candidate A (Commercial) Match Scores:');
  const matchA_to_Comm = calculateMatchScore(candidateCommercial, jobCommercial);
  const matchA_to_Tech = calculateMatchScore(candidateCommercial, jobTech);

  console.log(`   - Fit on Commercial Job: ${matchA_to_Comm.overall_score}% (Disqualified: ${matchA_to_Comm.is_disqualified || false})`);
  console.log(`   - Fit on Tech Job:       ${matchA_to_Tech.overall_score}% (Disqualified: ${matchA_to_Tech.is_disqualified || false})`);
  if (matchA_to_Tech.disqualification_reason) {
    console.log(`     Disqualification Reason: "${matchA_to_Tech.disqualification_reason}"`);
  }

  console.log('\n2. Evaluating Candidate B (Technology) Match Scores:');
  const matchB_to_Comm = calculateMatchScore(candidateTech, jobCommercial);
  const matchB_to_Tech = calculateMatchScore(candidateTech, jobTech);

  console.log(`   - Fit on Commercial Job: ${matchB_to_Comm.overall_score}% (Disqualified: ${matchB_to_Comm.is_disqualified || false})`);
  if (matchB_to_Comm.disqualification_reason) {
    console.log(`     Disqualification Reason: "${matchB_to_Comm.disqualification_reason}"`);
  }
  console.log(`   - Fit on Tech Job:       ${matchB_to_Tech.overall_score}% (Disqualified: ${matchB_to_Tech.is_disqualified || false})`);

  // Assertions
  const commPassed = matchA_to_Comm.overall_score >= 80 && matchA_to_Tech.overall_score < 35 && matchA_to_Tech.is_disqualified;
  const techPassed = matchB_to_Tech.overall_score >= 80 && matchB_to_Comm.overall_score < 35 && matchB_to_Comm.is_disqualified;

  console.log('\n3. Verification Summary:');
  console.log(`   - Candidate A (Commercial) correctly prioritized for FMCG/Commercial: ${commPassed}`);
  console.log(`   - Candidate B (Tech) correctly prioritized for Cloud/Software:          ${techPassed}`);
  console.log(`   - Zero Cross-Domain Contamination:                                     ${commPassed && techPassed}`);

  if (!commPassed || !techPassed) {
    throw new Error('Recommendation separation test failed!');
  }
  console.log('\n=== [ALL SYNTHETIC PROFILE TESTS PASSED] ===');
}

verifySyntheticProfiles().catch(err => {
  console.error(err);
  process.exit(1);
});
