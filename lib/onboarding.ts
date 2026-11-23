import db, { logAudit, getOrCreateDefaultUser } from './db';
import { FullCandidateProfile, ProfileLocation, ProfilePermissions, UserProfile, ResumeRecord, ExtractedProfileRecord } from './types';

function safeJsonArray(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try {
    const parsed = JSON.parse(val);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'string') return [parsed];
    return [];
  } catch {
    if (typeof val === 'string' && val.includes(',')) {
      return val.split(',').map((s: string) => s.trim()).filter(Boolean);
    }
    return typeof val === 'string' && val.trim().length > 0 ? [val.trim()] : [];
  }
}

export function getFullProfile(userId?: string, resumeId?: string): FullCandidateProfile | null {
  const user = userId ? { id: userId } : getOrCreateDefaultUser();

  const profileRow = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(user.id) as any;
  if (!profileRow) return null;

  const locationRow = db.prepare('SELECT * FROM profile_locations WHERE user_id = ?').get(user.id) as any;
  const permissionsRow = db.prepare('SELECT * FROM profile_permissions WHERE user_id = ?').get(user.id) as any;
  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as any;

  // Determine active resume
  let activeCvRow: any = null;
  if (resumeId) {
    activeCvRow = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(resumeId, user.id);
  }
  if (!activeCvRow && userRow?.active_resume_id) {
    activeCvRow = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(userRow.active_resume_id, user.id);
  }
  if (!activeCvRow) {
    activeCvRow = db.prepare("SELECT * FROM resumes WHERE user_id = ? AND type = 'Master' ORDER BY created_at DESC LIMIT 1").get(user.id);
  }
  if (!activeCvRow) {
    activeCvRow = db.prepare("SELECT * FROM resumes WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").get(user.id);
  }

  // Load extracted profile if available
  let extractedRow: any = null;
  if (activeCvRow) {
    extractedRow = db.prepare(`
      SELECT * FROM extracted_profiles
      WHERE resume_id = ? OR id = ?
      LIMIT 1
    `).get(activeCvRow.id, activeCvRow.extracted_profile_id || '');
  }

  let extractedSkills: string[] = [];
  let extractedExperiences: any[] = [];
  let extractedEducation: any[] = [];
  let candidateName = userRow?.full_name || '';
  let candidateEmail = userRow?.email || '';
  let candidatePhone = '';
  let candidateHeadline = profileRow.headline || '';
  let candidateYears = profileRow.experience_years || 0;
  let candidateSeniority = profileRow.target_seniority || 'Senior';

  let candidateIndustries: string[] = [];
  let candidateRoles: string[] = [];
  if (extractedRow) {
    if (extractedRow.candidate_name && extractedRow.candidate_name !== 'Candidate') {
      candidateName = extractedRow.candidate_name;
    }
    if (extractedRow.email) candidateEmail = extractedRow.email;
    if (extractedRow.phone) candidatePhone = extractedRow.phone;
    if (extractedRow.current_headline) candidateHeadline = extractedRow.current_headline;
    if (extractedRow.total_experience_years > 0) candidateYears = extractedRow.total_experience_years;
    if (extractedRow.detected_seniority) candidateSeniority = extractedRow.detected_seniority;
    try {
      extractedSkills = JSON.parse(extractedRow.skills_json || '[]');
      extractedExperiences = JSON.parse(extractedRow.experiences_json || '[]');
      extractedEducation = JSON.parse(extractedRow.education_json || '[]');
      if (extractedRow.industries_json) {
        candidateIndustries = JSON.parse(extractedRow.industries_json);
      }
    } catch {}

    const hl = (candidateHeadline || '').toLowerCase();
    if (/software|cloud|developer|engineer|full stack|backend|frontend|devops|architect/i.test(hl)) {
      candidateRoles = ['Principal Cloud Architect', 'Senior Software Engineer', 'Staff Backend Engineer', 'DevOps Lead'];
      if (candidateIndustries.length === 0) candidateIndustries = ['Software Engineering & Technology', 'Cloud & SaaS'];
    } else if (/category|fmcg|trade marketing|retail buyer|commercial/i.test(hl)) {
      candidateRoles = ['Senior Category Manager', 'Trade Marketing Manager', 'Commercial Lead', 'Retail Merchandising Manager'];
      if (candidateIndustries.length === 0) candidateIndustries = ['Fast-Moving Consumer Goods (FMCG)', 'Retail & E-commerce'];
    } else if (/finance|financial|accountant|accounting|audit|cpa|controller/i.test(hl)) {
      candidateRoles = ['Senior Financial Analyst', 'Corporate Valuation Lead', 'Internal Audit Manager', 'Financial Controller'];
      if (candidateIndustries.length === 0) candidateIndustries = ['Finance & Accounting', 'Audit & Advisory'];
    }
  }

  const resolvedSkills = extractedSkills.length > 0 ? extractedSkills : safeJsonArray(profileRow.skills);
  const resolvedName = candidateName || userRow?.full_name || 'Candidate';
  const resolvedEmail = candidateEmail || userRow?.email || 'candidate@example.com';
  const resolvedPhone = candidatePhone || '+1 555-0100';
  const resolvedIndustries = candidateIndustries.length > 0 ? candidateIndustries : safeJsonArray(profileRow.target_industries);
  const resolvedRoles = candidateRoles.length > 0 ? candidateRoles : safeJsonArray(profileRow.target_roles);

  const profile: UserProfile = {
    id: profileRow.id,
    user_id: profileRow.user_id,
    full_name: resolvedName,
    email: resolvedEmail,
    phone: resolvedPhone,
    onboarding_completed: profileRow.onboarding_completed,
    headline: candidateHeadline,
    summary: profileRow.summary || (extractedExperiences[0]?.responsibilities?.slice(0, 3).join('. ') || ''),
    current_status: profileRow.current_status || 'Employed',
    experience_years: candidateYears,
    skills: resolvedSkills,
    languages: safeJsonArray(profileRow.languages),
    target_roles: resolvedRoles,
    target_industries: resolvedIndustries,
    target_seniority: candidateSeniority,
    min_salary: profileRow.min_salary || 0,
    preferred_currency: profileRow.preferred_currency || 'USD',
    preferred_companies: safeJsonArray(profileRow.preferred_companies),
    excluded_companies: safeJsonArray(profileRow.excluded_companies),
    availability: profileRow.availability || 'Immediate',
    created_at: profileRow.created_at,
    updated_at: profileRow.updated_at,
  };

  const targetCountries = safeJsonArray(locationRow?.target_countries);

  const location: ProfileLocation = locationRow
    ? {
        id: locationRow.id,
        user_id: locationRow.user_id,
        current_physical_location: locationRow.current_physical_location || null,
        target_countries: targetCountries,
        target_cities: safeJsonArray(locationRow.target_cities),
        resume_derived_locations: safeJsonArray(locationRow.resume_derived_locations),
        relocation_willing: locationRow.relocation_willing ?? 0,
        relocation_timeline: locationRow.relocation_timeline || 'No relocation',
        visa_sponsorship_required: locationRow.visa_sponsorship_required ?? 0,
        work_authorizations: safeJsonArray(locationRow.work_authorizations),
        remote_eligibility: locationRow.remote_eligibility || 'Not specified',
        work_mode_preference: locationRow.work_mode_preference || 'Remote',
        updated_at: locationRow.updated_at,
      }
    : {
        user_id: user.id,
        current_physical_location: null,
        target_countries: targetCountries,
        target_cities: [],
        resume_derived_locations: [],
        relocation_willing: 0,
        relocation_timeline: 'No relocation',
        visa_sponsorship_required: 0,
        work_authorizations: [],
        remote_eligibility: 'Not specified',
        work_mode_preference: 'Remote',
      };

  const permissions: ProfilePermissions = permissionsRow
    ? {
        id: permissionsRow.id,
        user_id: permissionsRow.user_id,
        job_research_authorized: permissionsRow.job_research_authorized,
        cv_analysis_authorized: permissionsRow.cv_analysis_authorized,
        gmail_connected: permissionsRow.gmail_connected,
        read_emails_authorized: permissionsRow.read_emails_authorized,
        draft_emails_authorized: permissionsRow.draft_emails_authorized,
        send_emails_authorized: permissionsRow.send_emails_authorized,
        submit_applications_authorized: permissionsRow.submit_applications_authorized,
        disclose_data_authorized: permissionsRow.disclose_data_authorized,
        scheduled_automation_desired: permissionsRow.scheduled_automation_desired,
        updated_at: permissionsRow.updated_at,
      }
    : {
        user_id: user.id,
        job_research_authorized: 0,
        cv_analysis_authorized: 0,
        gmail_connected: 0,
        read_emails_authorized: 0,
        draft_emails_authorized: 0,
        send_emails_authorized: 0,
        submit_applications_authorized: 0,
        disclose_data_authorized: 0,
        scheduled_automation_desired: 0,
      };

  const master_cv: ResumeRecord | undefined = activeCvRow
    ? {
        id: activeCvRow.id,
        user_id: activeCvRow.user_id,
        title: activeCvRow.title,
        type: activeCvRow.type,
        raw_text: activeCvRow.raw_text,
        ats_score: activeCvRow.ats_score,
        version: activeCvRow.version,
        original_filename: activeCvRow.original_filename,
        stored_file_path: activeCvRow.stored_file_path,
        file_type: activeCvRow.file_type,
        file_size: activeCvRow.file_size,
        file_hash: activeCvRow.file_hash,
        upload_timestamp: activeCvRow.upload_timestamp,
        processing_status: activeCvRow.processing_status,
        extraction_status: activeCvRow.extraction_status,
        extraction_timestamp: activeCvRow.extraction_timestamp,
        extraction_version: activeCvRow.extraction_version,
        source_text_reference: activeCvRow.source_text_reference,
        extracted_profile_id: activeCvRow.extracted_profile_id,
        ats_report_id: activeCvRow.ats_report_id,
        created_at: activeCvRow.created_at,
      }
    : undefined;

  const extractedProfileRecord: ExtractedProfileRecord | undefined = extractedRow
    ? {
        id: extractedRow.id,
        resume_id: extractedRow.resume_id,
        user_id: extractedRow.user_id,
        candidate_name: candidateName,
        email: candidateEmail,
        phone: candidatePhone,
        location: extractedRow.location,
        linkedin_url: extractedRow.linkedin_url,
        github_url: extractedRow.github_url,
        current_headline: candidateHeadline,
        career_progression: extractedRow.career_progression,
        detected_seniority: candidateSeniority,
        total_experience_years: candidateYears,
        experiences: extractedExperiences,
        education: extractedEducation,
        certifications: [],
        skills: resolvedSkills,
        languages: safeJsonArray(profileRow.languages),
        industries: resolvedIndustries,
        experiences_json: extractedRow.experiences_json,
        education_json: extractedRow.education_json,
        certifications_json: extractedRow.certifications_json,
        skills_json: extractedRow.skills_json,
        languages_json: extractedRow.languages_json,
        industries_json: extractedRow.industries_json,
        missing_information_json: extractedRow.missing_information_json,
        raw_extracted_text: extractedRow.raw_extracted_text,
        created_at: extractedRow.created_at
      }
    : undefined;

  return { profile, location, permissions, master_cv, extracted_profile: extractedProfileRecord };
}

export function isOnboardingComplete(userId?: string): boolean {
  const full = getFullProfile(userId);
  if (!full) return false;
  if (!full.profile || full.profile.onboarding_completed !== 1) return false;
  // Non-negotiable requirement: Location countries must NEVER be assumed or empty
  if (!full.location.target_countries || full.location.target_countries.length === 0) return false;
  // Non-negotiable requirement: Job research authorization must be explicitly granted
  if (full.permissions.job_research_authorized !== 1) return false;
  return true;
}

export function saveOnboarding(
  userId: string,
  data: {
    profile: Partial<UserProfile>;
    location: Partial<ProfileLocation>;
    permissions: Partial<ProfilePermissions>;
    cvText?: string;
  }
): FullCandidateProfile {
  // Target countries are non-negotiable when completing onboarding
  if (data.location && Array.isArray(data.location.target_countries) && data.location.target_countries.length === 0) {
    throw new Error('Non-negotiable requirement: Target countries cannot be empty.');
  }
  const safeTargetCountries = Array.isArray(data.location?.target_countries) ? data.location.target_countries : [];

  const uid = userId || (getOrCreateDefaultUser()).id;

  // 1. Upsert Profile
  const existingProf = db.prepare('SELECT id FROM profiles WHERE user_id = ?').get(uid) as any;
  const profId = existingProf ? existingProf.id : `prof_${Date.now()}`;

  const profileStmt = db.prepare(`
    INSERT INTO profiles (
      id, user_id, onboarding_completed, headline, summary, current_status,
      experience_years, skills, languages, target_roles, target_industries,
      target_seniority, min_salary, preferred_currency, preferred_companies,
      excluded_companies, availability, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      onboarding_completed = excluded.onboarding_completed,
      headline = excluded.headline,
      summary = excluded.summary,
      current_status = excluded.current_status,
      experience_years = excluded.experience_years,
      skills = excluded.skills,
      languages = excluded.languages,
      target_roles = excluded.target_roles,
      target_industries = excluded.target_industries,
      target_seniority = excluded.target_seniority,
      min_salary = excluded.min_salary,
      preferred_currency = excluded.preferred_currency,
      preferred_companies = excluded.preferred_companies,
      excluded_companies = excluded.excluded_companies,
      availability = excluded.availability,
      updated_at = CURRENT_TIMESTAMP
  `);

  profileStmt.run(
    profId,
    uid,
    1, // Mark onboarding completed
    data.profile.headline || 'Software Engineer',
    data.profile.summary || '',
    data.profile.current_status || 'Employed',
    data.profile.experience_years || 5,
    JSON.stringify(data.profile.skills || []),
    JSON.stringify(data.profile.languages || ['English', 'Arabic']),
    JSON.stringify(data.profile.target_roles || ['Senior Software Engineer']),
    JSON.stringify(data.profile.target_industries || ['Technology', 'Fintech']),
    data.profile.target_seniority || 'Senior',
    data.profile.min_salary || 50000,
    data.profile.preferred_currency || 'USD',
    JSON.stringify(data.profile.preferred_companies || []),
    JSON.stringify(data.profile.excluded_companies || []),
    data.profile.availability || 'Immediate'
  );

  // 2. Upsert Location
  const existingLoc = db.prepare('SELECT id, current_physical_location, resume_derived_locations FROM profile_locations WHERE user_id = ?').get(uid) as any;
  const locId = existingLoc ? existingLoc.id : `loc_${Date.now()}`;

  let currentPhysical: string | null = null;
  if (data.location.current_physical_location !== undefined) {
    currentPhysical = data.location.current_physical_location;
  } else if (existingLoc && existingLoc.current_physical_location) {
    currentPhysical = existingLoc.current_physical_location;
  }

  let derivedLocs: string[] = [];
  if (data.location.resume_derived_locations !== undefined) {
    derivedLocs = data.location.resume_derived_locations;
  } else if (existingLoc && existingLoc.resume_derived_locations) {
    try { derivedLocs = JSON.parse(existingLoc.resume_derived_locations); } catch {}
  }

  const locStmt = db.prepare(`
    INSERT INTO profile_locations (
      id, user_id, current_physical_location, target_countries, target_cities, resume_derived_locations, relocation_willing,
      relocation_timeline, visa_sponsorship_required, work_authorizations,
      remote_eligibility, work_mode_preference, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      current_physical_location = excluded.current_physical_location,
      target_countries = excluded.target_countries,
      target_cities = excluded.target_cities,
      resume_derived_locations = excluded.resume_derived_locations,
      relocation_willing = excluded.relocation_willing,
      relocation_timeline = excluded.relocation_timeline,
      visa_sponsorship_required = excluded.visa_sponsorship_required,
      work_authorizations = excluded.work_authorizations,
      remote_eligibility = excluded.remote_eligibility,
      work_mode_preference = excluded.work_mode_preference,
      updated_at = CURRENT_TIMESTAMP
  `);

  locStmt.run(
    locId,
    uid,
    currentPhysical,
    JSON.stringify(data.location.target_countries || []),
    JSON.stringify(data.location.target_cities || []),
    JSON.stringify(derivedLocs || []),
    data.location.relocation_willing ? 1 : 0,
    data.location.relocation_timeline || 'Immediate',
    data.location.visa_sponsorship_required ? 1 : 0,
    JSON.stringify(data.location.work_authorizations || []),
    data.location.remote_eligibility || 'Any',
    data.location.work_mode_preference || 'Remote'
  );

  // 3. Upsert Permissions
  const existingPerm = db.prepare('SELECT id FROM profile_permissions WHERE user_id = ?').get(uid) as any;
  const permId = existingPerm ? existingPerm.id : `perm_${Date.now()}`;

  const permStmt = db.prepare(`
    INSERT INTO profile_permissions (
      id, user_id, job_research_authorized, cv_analysis_authorized, gmail_connected,
      read_emails_authorized, draft_emails_authorized, send_emails_authorized,
      submit_applications_authorized, disclose_data_authorized,
      scheduled_automation_desired, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      job_research_authorized = excluded.job_research_authorized,
      cv_analysis_authorized = excluded.cv_analysis_authorized,
      gmail_connected = excluded.gmail_connected,
      read_emails_authorized = excluded.read_emails_authorized,
      draft_emails_authorized = excluded.draft_emails_authorized,
      send_emails_authorized = excluded.send_emails_authorized,
      submit_applications_authorized = excluded.submit_applications_authorized,
      disclose_data_authorized = excluded.disclose_data_authorized,
      scheduled_automation_desired = excluded.scheduled_automation_desired,
      updated_at = CURRENT_TIMESTAMP
  `);

  permStmt.run(
    permId,
    uid,
    data.permissions.job_research_authorized ? 1 : 0,
    data.permissions.cv_analysis_authorized ? 1 : 0,
    data.permissions.gmail_connected ? 1 : 0,
    data.permissions.read_emails_authorized ? 1 : 0,
    data.permissions.draft_emails_authorized ? 1 : 0,
    data.permissions.send_emails_authorized ? 1 : 0,
    data.permissions.submit_applications_authorized ? 1 : 0,
    data.permissions.disclose_data_authorized ? 1 : 0,
    data.permissions.scheduled_automation_desired ? 1 : 0
  );

  // 4. Save Master CV if provided
  if (data.cvText && data.cvText.trim().length > 0) {
    const cvId = `cv_${Date.now()}`;
    db.prepare(`
      INSERT INTO resumes (id, user_id, title, type, raw_text, ats_score, version)
      VALUES (?, ?, ?, 'Master', ?, 85.0, 1)
    `).run(cvId, uid, 'Master Profile CV', data.cvText);
  }

  logAudit('ONBOARDING_COMPLETED', {
    target_countries: data.location.target_countries,
    target_roles: data.profile.target_roles,
    permissions: data.permissions,
  }, uid);

  const full = getFullProfile(uid)!;
  return full;
}

export function generateProfileSummary(p: FullCandidateProfile): string {
  return `
### Candidate Profile Summary
- **Professional Title**: ${p.profile.headline} (${p.profile.target_seniority})
- **Years of Experience**: ${p.profile.experience_years} years
- **Target Roles**: ${p.profile.target_roles.join(', ')}
- **Core Skills**: ${p.profile.skills.join(', ')}
- **Location Preferences**:
  - Target Countries: ${p.location.target_countries.join(', ')}
  - Target Cities: ${p.location.target_cities.join(', ') || 'Any'}
  - Relocation: ${p.location.relocation_willing ? `Yes (${p.location.relocation_timeline})` : 'No'}
  - Visa Sponsorship Required: ${p.location.visa_sponsorship_required ? 'Yes' : 'No'}
  - Work Mode: ${p.location.work_mode_preference} (${p.location.remote_eligibility})
- **Salary Expectation**: ${p.profile.min_salary.toLocaleString()} ${p.profile.preferred_currency}+
- **Granted Permissions**:
  - Job Research: ${p.permissions.job_research_authorized ? 'Authorized ✓' : 'Blocked ✗'}
  - CV Analysis: ${p.permissions.cv_analysis_authorized ? 'Authorized ✓' : 'Blocked ✗'}
  - Email Reading/Drafting: ${p.permissions.read_emails_authorized && p.permissions.draft_emails_authorized ? 'Authorized ✓' : 'Blocked ✗'}
  - Direct Email Sending: ${p.permissions.send_emails_authorized ? 'Authorized ✓' : 'Restricted (Human Approval Required) ⚠'}
  - Application Submission: ${p.permissions.submit_applications_authorized ? 'Authorized ✓' : 'Restricted (Approval Center Required) ⚠'}
`.trim();
}
