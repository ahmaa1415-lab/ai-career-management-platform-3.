export interface UserProfile {
  id: string;
  user_id: string;
  full_name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin_url?: string;
  onboarding_completed: number;
  headline: string;
  summary: string;
  current_status: string;
  experience_years: number;
  skills: string[];
  languages: string[];
  target_roles: string[];
  target_industries: string[];
  target_seniority: string;
  min_salary: number;
  preferred_currency: string;
  preferred_companies: string[];
  excluded_companies: string[];
  availability: string;
  created_at?: string;
  updated_at?: string;
}

export interface ProfileLocation {
  id?: string;
  user_id: string;
  current_physical_location?: string | null;
  target_countries: string[];
  target_cities: string[];
  resume_derived_locations?: string[];
  relocation_willing: number;
  relocation_timeline: string;
  visa_sponsorship_required: number;
  work_authorizations: string[];
  remote_eligibility: string;
  work_mode_preference: 'Remote' | 'Hybrid' | 'Onsite' | 'Any';
  updated_at?: string;
}

export interface ProfilePermissions {
  id?: string;
  user_id: string;
  job_research_authorized: number;
  cv_analysis_authorized: number;
  gmail_connected: number;
  read_emails_authorized: number;
  draft_emails_authorized: number;
  send_emails_authorized: number;
  submit_applications_authorized: number;
  disclose_data_authorized: number;
  scheduled_automation_desired: number;
  updated_at?: string;
}

export interface FullCandidateProfile {
  profile: UserProfile;
  location: ProfileLocation;
  permissions: ProfilePermissions;
  master_cv?: ResumeRecord;
  extracted_profile?: ExtractedProfileRecord;
}

export interface ResumeRecord {
  id: string;
  user_id: string;
  title: string;
  type: 'Master' | 'Tailored' | 'ATS' | 'Role-Specific' | 'Country-Specific';
  target_role?: string;
  target_country?: string;
  raw_text: string;
  structured_json?: string;
  ats_score: number;
  version: number;
  created_at?: string;
  original_filename?: string;
  stored_file_path?: string;
  file_type?: string;
  file_size?: number;
  file_hash?: string;
  upload_timestamp?: string;
  processing_status?: 'pending' | 'completed' | 'failed';
  extraction_status?: 'pending' | 'completed' | 'failed';
  extraction_timestamp?: string;
  extraction_version?: number;
  source_text_reference?: string;
  extracted_profile_id?: string;
  ats_report_id?: string;
}

export interface ExtractedProfileRecord {
  id: string;
  resume_id: string;
  user_id: string;
  candidate_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  current_headline: string | null;
  career_progression: string | null;
  detected_seniority: string;
  total_experience_years: number;
  experiences: Array<{
    employer: string;
    job_title: string;
    start_date: string;
    end_date: string;
    duration_months: number;
    responsibilities: string[];
    achievements: string[];
  }>;
  education: Array<{
    institution: string;
    degree: string;
    field_of_study: string;
    graduation_year?: string;
  }>;
  certifications: string[];
  skills: string[];
  languages: string[];
  industries: string[];
  experiences_json?: string;
  education_json?: string;
  certifications_json?: string;
  skills_json?: string;
  languages_json?: string;
  industries_json?: string;
  missing_information?: string[];
  missing_information_json?: string;
  raw_extracted_text?: string;
  created_at?: string;
}

export interface JobListing {
  id: string;
  employer: string;
  title: string;
  location: string;
  source: string;
  source_url: string;
  publication_date: string;
  application_deadline?: string;
  salary_raw?: string;
  min_salary?: number;
  max_salary?: number;
  currency?: string;
  requirements: string[];
  experience_required_years: number;
  seniority: string;
  visa_sponsorship: 'Yes' | 'No' | 'Unknown';
  remote_eligibility: 'Remote' | 'Hybrid' | 'Onsite';
  is_verified: number;
  raw_description: string;
  application_type?: 'company_site_account' | 'linkedin_easy_apply' | 'recruiter_post' | 'direct';
  company_portal_url?: string;
  portal_platform?: string;
  match_score?: number;
  created_at?: string;

  // Enriched fields for job intelligence & verification
  original_publication_date?: string;
  last_updated_date?: string;
  last_verified_date?: string;
  verification_status?: 'Verified Open' | 'Open, Date Unconfirmed' | 'Unverified' | 'Expired' | 'Closed' | 'Broken Link' | 'Redirected' | 'Suspicious';
  verification_evidence?: string;
  freshness_classification?: 'Very recent' | 'Recent' | 'Current, requires verification' | 'Older, display with warning' | 'Archived';
  job_fit_score?: number;
  ats_compatibility_score?: number;
  ats_keyword_alignment_score?: number;
  recruiter_readability_score?: number;
  job_family?: string;
  duplicate_of_id?: string;
  sources_json?: string;
  company_career_url?: string;
  company_linkedin_url?: string;
  application_destination?: string;
  reporting_line?: string;
  team_responsibilities?: string;
}

export interface CompanyPortalAccount {
  id: string;
  user_id: string;
  job_id?: string;
  application_id?: string;
  employer: string;
  portal_platform: 'Workday' | 'Greenhouse' | 'Lever' | 'Custom Enterprise' | 'SmartRecruiters' | 'Ashby' | 'Direct';
  portal_url: string;
  account_email: string;
  account_username?: string;
  password_hint?: string;
  status: 'Active' | 'Registered & Applied' | 'Verification Pending' | 'Account Created';
  confirmation_reference?: string;
  applied_at?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface MatchBreakdown {
  overall_score: number;
  skills_score: number;
  skills_weight: 0.25;
  seniority_score: number;
  seniority_weight: 0.15;
  industry_score: number;
  industry_weight: 0.15;
  salary_score: number;
  salary_weight: 0.15;
  location_score: number;
  location_weight: 0.10;
  visa_score: number;
  visa_weight: 0.10;
  employer_score: number;
  employer_weight: 0.05;
  recency_score: number;
  recency_weight: 0.05;
  explanations: {
    skills: string;
    seniority: string;
    industry: string;
    salary: string;
    location: string;
    visa: string;
    employer: string;
    recency: string;
  };
  missing_qualifications: string[];
  recommendations: string[];
}

export const PIPELINE_STAGES = [
  'Discovered',
  'Qualified',
  'Shortlisted',
  'Tailored',
  'Approval Pending',
  'Ready to Apply',
  'Applied',
  'Confirmation Received',
  'Follow-up',
  'Interview',
  'Assessment',
  'Offer',
  'Negotiation',
  'Hired',
  'Rejected',
  'Closed'
] as const;

export type PipelineStage = typeof PIPELINE_STAGES[number];

export interface ApplicationRecord {
  id: string;
  user_id: string;
  job_id: string;
  status: PipelineStage;
  match_score: number;
  match_details_json: string;
  tailored_cv_id?: string;
  cover_letter?: string;
  screening_responses?: string;
  disclosures_accepted: number;
  human_approved: number;
  approved_at?: string;
  submission_type: 'Manual' | 'Automated';
  submission_confirmed: number;
  applied_at?: string;
  recruiter_name?: string;
  recruiter_email?: string;
  notes?: string;
  external_portal_account_created?: number;
  portal_account_id?: string;
  confirmation_reference?: string;
  source_resume_id?: string;
  resume_version?: number;
  is_outdated?: number;
  outdated_reason?: string;
  created_at?: string;
  updated_at?: string;
  // Joined fields
  job?: JobListing;
}

export interface RecruitmentEmail {
  id: string;
  application_id?: string;
  category:
    | 'Opportunity'
    | 'Recruiter Message'
    | 'Confirmation'
    | 'Interview'
    | 'Assessment'
    | 'Offer'
    | 'Rejection'
    | 'Followup';
  sender: string;
  recipient: string;
  subject: string;
  body: string;
  is_draft: number;
  is_sent: number;
  sent_at?: string;
  created_at?: string;
}

export interface DailyReportRecord {
  id: string;
  report_date: string;
  timezone: string;
  content_markdown: string;
  metrics_json: string;
  generated_at?: string;
}

export interface IntegrationRecord {
  id: string;
  user_id: string;
  service: string;
  status: 'connected' | 'sandbox' | 'disconnected' | 'Connected' | 'Not Connected' | 'Authorization Required' | 'Expired' | 'Error';
  profile_url: string;
  client_id?: string;
  client_secret?: string;
  access_token?: string;
  sync_enabled: number;
  last_synced_at?: string;
  metadata?: string;
  created_at?: string;
  updated_at?: string;
}

export interface LinkedInRecruiterActivity {
  id: string;
  author_name: string;
  author_title: string;
  company: string;
  post_text: string;
  job_title?: string;
  location?: string;
  publication_date: string;
  post_url: string;
  recruiter_profile_url?: string;
  contact_instructions?: string;
  author_avatar?: string;
  is_verified: number;
  created_at?: string;
}

export interface LinkedInCompanyUpdate {
  id: string;
  company: string;
  headline: string;
  update_type: string;
  summary: string;
  career_relevance: string;
  publication_date: string;
  source_url: string;
  created_at?: string;
}

export interface LinkedInIndustryInsight {
  id: string;
  title: string;
  topic: string;
  author_name: string;
  author_title: string;
  company?: string;
  publication_date: string;
  insights_summary: string;
  career_relevance: string;
  post_url: string;
  created_at?: string;
}

export interface SavedOpportunity {
  id: string;
  user_id: string;
  job_id: string;
  notes?: string;
  saved_at?: string;
  job?: JobListing;
}

export interface SearchHistoryRecord {
  id: string;
  user_id: string;
  query: string;
  filters_json: string;
  results_count: number;
  created_at?: string;
}

export interface JobFitDimension {
  name: string;
  score: number;
  weight: number;
  weighted_score: number;
  status: 'Strong Match' | 'Moderate Match' | 'Gap' | 'Unknown';
  explanation: string;
  evidence: string[];
}

export interface JobFitBreakdown {
  overall_score: number;
  fit_level: 'Excellent Fit' | 'Strong Fit' | 'Good Potential Fit' | 'Partial Fit' | 'Low Fit / Mismatched';
  is_disqualified: boolean;
  disqualification_reason?: string;
  dimensions: {
    relevant_experience: JobFitDimension;
    skills: JobFitDimension;
    responsibilities: JobFitDimension;
    seniority: JobFitDimension;
    industry: JobFitDimension;
    achievements: JobFitDimension;
    location: JobFitDimension;
    salary: JobFitDimension;
    progression: JobFitDimension;
  };
  matching_strengths: string[];
  genuine_gaps: string[];
  recommendations: string[];
}

export interface ATSParsingEvaluation {
  parsing_score: number;
  layout_compatibility: {
    score: number;
    has_single_column_structure: boolean;
    has_tables_or_textboxes: boolean;
    has_complex_graphics: boolean;
    verdict: string;
  };
  typography_and_encoding: {
    score: number;
    standard_fonts_detected: boolean;
    utf8_clean: boolean;
    verdict: string;
  };
  section_detection: {
    score: number;
    detected_headers: string[];
    missing_standard_headers: string[];
  };
  date_recognition: {
    score: number;
    recognized_date_ranges: string[];
    unparsable_dates: string[];
  };
  parsing_risks: string[];
}

export interface ATSKeywordDetail {
  keyword: string;
  category: 'Exact Match' | 'Semantic Match' | 'Related / Incomplete' | 'Genuine Experience Gap' | 'Terminology Gap' | 'Presentation Gap' | 'Irrelevant Requirement';
  evidence_in_cv?: string;
  recommendation?: string;
}

// ============================================================================
// SENIOR GLOBAL HR & RECRUITMENT INTELLIGENCE SYSTEM TYPES
// ============================================================================

export interface HumanRecruiterReview {
  overall_human_score: number; // 1 to 10
  format_and_structure: {
    score: number; // 1 to 10
    layout_clarity: string;
    section_order: string;
    whitespace_balance: string;
    length_appropriateness: string;
    country_conventions: string;
    consistency: string;
    evidence: string[];
    recommendations: string[];
  };
  content_relevance: {
    score: number; // 1 to 10
    target_alignment: string;
    relevant_experience_years: number;
    functional_competencies: string[];
    seniority_alignment: string;
    leadership_exposure: string;
    evidence: string[];
    recommendations: string[];
  };
  language_and_tone: {
    score: number; // 1 to 10
    professional_tone: string;
    action_verbs_count: number;
    conciseness: string;
    industry_vocabulary_density: string;
    evidence: string[];
    recommendations: string[];
  };
  achievements_and_impact: {
    score: number; // 1 to 10
    quantifiable_metrics_count: number;
    revenue_impact_found: boolean;
    profitability_cost_found: boolean;
    category_growth_found: boolean;
    missing_metrics_to_request: string[];
    evidence: string[];
    recommendations: string[];
  };
  overall_recruiter_impact: {
    score: number; // 1 to 10
    first_impression: string;
    candidate_positioning: string;
    differentiation: string;
    career_narrative: string;
    shortlisting_verdict: 'High Shortlist Priority' | 'Competitive Contender' | 'Secondary Review' | 'Revision Required';
    evidence: string[];
  };
}

export interface ATSComplianceReview {
  overall_ats_score: number; // 1 to 10
  keyword_alignment: {
    score: number; // 1 to 10
    exact_matches: string[];
    semantic_matches: string[];
    genuine_gaps: string[];
    terminology_gaps: string[];
    presentation_gaps: string[];
    details: ATSKeywordDetail[];
  };
  parsing_compatibility: {
    score: number; // 1 to 10
    file_format_safe: boolean;
    single_column_safe: boolean;
    standard_headers_detected: string[];
    missing_headers: string[];
    typography_encoding_safe: boolean;
    date_recognition_reliable: boolean;
    contact_info_accessible: boolean;
    risks: string[];
  };
  section_completeness: {
    score: number; // 1 to 10
    sections_found: string[];
    missing_sections: string[];
  };
  optimization_gaps: string[];
}

export interface LocalizationMarketFit {
  target_country: string;
  target_region: string;
  localization_score: number; // 1 to 10
  recommended_length: string;
  photo_convention: {
    status: 'Strictly Prohibited' | 'Optional' | 'Common Practice' | 'Required';
    reason: string;
    bias_risk_alert?: string;
  };
  personal_info_audit: {
    compliant: boolean;
    flagged_sensitive_items: string[];
    recommendations: string[];
  };
  language_and_spelling: string;
  date_format_convention: string;
  work_authorization_advice: string;
  local_recruitment_nuances: string[];
}

export interface HeadhunterSearchOptimization {
  discoverability_score: number; // 1 to 10
  linkedin_recruiter_boolean_strings: string[];
  corporate_ats_search_queries: string[];
  primary_market_titles: string[];
  alternative_titles: string[];
  searchable_competencies: string[];
  linkedin_headlines: string[];
  linkedin_about_draft: string;
  linkedin_open_to_work_advice: string[];
}

export interface DiagnosticScores {
  human_recruiter_score: number; // 1 to 10
  ats_compatibility_score: number; // 1 to 10
  keyword_alignment_score: number; // 1 to 10
  recruiter_readability_score: number; // 1 to 10
  achievement_impact_score: number; // 1 to 10
  localization_score: number; // 1 to 10
  headhunter_discoverability_score: number; // 1 to 10
  job_fit_score?: number; // 1 to 10 (when job description provided)
}

export interface PriorityActionPlanItem {
  priority: 'P1 - Critical Parsing / Eligibility' | 'P2 - Major Positioning' | 'P3 - Missing Evidence' | 'P4 - Weak Achievements' | 'P5 - Keyword Gaps' | 'P6 - Formatting' | 'P7 - Headhunter Visibility';
  title: string;
  what_needs_improvement: string;
  why_it_matters: string;
  evidence_from_cv: string;
  how_to_fix: string;
  expected_benefit: string;
  regional_variation?: string;
}

export interface EvidenceAndConfidenceAudit {
  supported_by_cv_facts: string[];
  dependent_on_target_vacancy: string[];
  requires_candidate_confirmation: string[];
}

export interface BenchmarkingInsight {
  target_seniority_level: string;
  market_expectation_summary: string;
  competitive_advantages: string[];
  candidate_differentiation: string;
  methodology_disclaimer: string;
}

export interface SeniorGlobalHREvaluationResult {
  // Primary 1 to 10 Principal Scores
  human_recruiter_score_10: number; // 1 to 10
  ats_compatibility_score_10: number; // 1 to 10

  // Diagnostic 1 to 10 Sub-Scores
  diagnostic_scores: DiagnosticScores;

  // Step 1: Human Recruiter Review
  human_recruiter_review: HumanRecruiterReview;

  // Step 2: ATS Compliance Review
  ats_compliance_review: ATSComplianceReview;

  // Step 3: Localization & Anti-Bias
  localization_market_fit: LocalizationMarketFit;

  // Step 4: Headhunter Search Optimization
  headhunter_search_optimization: HeadhunterSearchOptimization;

  // Step 5: Benchmarking
  benchmarking_analysis: BenchmarkingInsight;

  // Step 6: Action Plan (Priority Ordered P1 - P7)
  priority_action_plan: PriorityActionPlanItem[];

  // Step 7: Tailored Resume Draft (when role & country known)
  tailored_resume_draft: {
    cv_title: string;
    version_label: 'Version B — Job-Tailored (Derived)';
    draft_text: string;
    highlighted_keywords: string[];
    missing_metrics_bracketed: string[];
  };

  // Step 8: Evidence & Confidence Breakdown
  evidence_and_confidence: EvidenceAndConfidenceAudit;

  // Full Structured Report
  full_report_markdown: string;

  // Evaluation metadata
  evaluation_id: string;
  evaluation_date: string;
  scoring_methodology_version: string;

  // Backward compatibility fields for existing UI & tests (0-100 scale)
  overall_score: number;
  parsing_score: number;
  keyword_alignment_score: number;
  readability_score: number;
  ats_parsing_evaluation: ATSParsingEvaluation;
  ats_keyword_breakdown: ATSKeywordDetail[];
  recruiter_evaluation: {
    score: number;
    verdict: string;
    strengths: string[];
    weaknesses: string[];
    six_second_scan_result: string;
  };
  hiring_manager_evaluation: {
    score: number;
    verdict: string;
    technical_depth: string;
    architectural_impact: string;
    recommendations: string[];
  };
  formatting_evaluation: {
    score: number;
    has_standard_sections: boolean;
    has_contact_info: boolean;
    bullet_quality: string;
    issues: string[];
  };
  keyword_gaps: {
    matched_keywords: string[];
    missing_critical: string[];
    missing_secondary: string[];
    keyword_density: number;
  };
  achievement_optimizations: Array<{
    original: string;
    optimized: string;
    formula_used: string;
  }>;
  country_specific_recommendations: {
    target_country: string;
    advice: string[];
    formatting_rules: string[];
  };
  detailed_report_markdown: string;
}


