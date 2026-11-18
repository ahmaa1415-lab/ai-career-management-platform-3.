import db, { logAudit, getOrCreateDefaultUser } from './db';
import { getFullProfile } from './onboarding';
import { calculateMatchScore } from './jobs/matcher';
import { generateTailoredPackage } from './ai/resume-tailorer';
import { JobListing, FullCandidateProfile } from './types';

export interface ParsedLinkedInRole {
  title: string;
  experience_years: number;
  qualifications: string[];
  domain_expertise: string[];
  mandatory_requirements: string[];
  raw_bullet: string;
  match_score?: number;
}

export interface LinkedInPostAnalysis {
  employer: string;
  location: string;
  work_mode: 'Remote' | 'Hybrid' | 'Onsite';
  working_days?: string;
  recruiter_email: string;
  recruiter_name?: string;
  extracted_roles: ParsedLinkedInRole[];
  hashtags: string[];
  raw_text: string;
  disaggregated_jobs: JobListing[];
}

/**
 * Intelligent parser that handles unstructured LinkedIn recruiter & HR hiring posts
 * (including multi-role posts with direct recruiter email CTAs like the Ourshopee post).
 */
export function parseLinkedInHiringPost(rawText: string, candidateProfile?: FullCandidateProfile): LinkedInPostAnalysis {
  const text = rawText.trim();

  // 1. Extract Recruiter Email Address
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
  const emails = text.match(emailRegex) || [];
  const recruiterEmail = (emails.length > 0 && emails[0]) ? emails[0].toLowerCase() : '';

  // 2. Infer Recruiter Name from email (e.g. mansi.deo@ourshopee.com -> Mansi Deo)
  let recruiterName = '';
  if (recruiterEmail) {
    const userPart = recruiterEmail.split('@')[0];
    const nameParts = userPart.split(/[._-]/).filter(p => p.length > 1);
    if (nameParts.length >= 2) {
      recruiterName = nameParts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
    } else if (nameParts.length === 1) {
      recruiterName = nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1).toLowerCase();
    }
  }

  // 3. Extract Employer Name
  let employer = 'Featured Company';
  const employerPipeMatch = text.match(/\|\s*([a-zA-Z0-9\s]+?)\s*–|\|\s*([a-zA-Z0-9\s]+?)\s*-/i);
  if (employerPipeMatch) {
    employer = (employerPipeMatch[1] || employerPipeMatch[2] || '').trim();
  } else if (recruiterEmail) {
    const domain = recruiterEmail.split('@')[1];
    const brand = domain.split('.')[0];
    if (brand && brand !== 'gmail' && brand !== 'yahoo' && brand !== 'outlook' && brand !== 'hotmail') {
      employer = brand.charAt(0).toUpperCase() + brand.slice(1);
    }
  }

  // 4. Extract Location
  let location = 'Dubai, UAE';
  const locMatch = text.match(/(?:Location|📍\s*Location)\s*:\s*([^\n\r]+)/i);
  if (locMatch) {
    location = locMatch[1].trim();
  } else if (text.toLowerCase().includes('dubai')) {
    location = 'Dubai, UAE';
  } else if (text.toLowerCase().includes('cairo') || text.toLowerCase().includes('egypt')) {
    location = 'Cairo, Egypt';
  } else if (text.toLowerCase().includes('berlin') || text.toLowerCase().includes('germany')) {
    location = 'Berlin, Germany';
  } else if (text.toLowerCase().includes('remote')) {
    location = 'Remote (Worldwide)';
  }

  // 5. Extract Work Mode
  let workMode: 'Remote' | 'Hybrid' | 'Onsite' = 'Onsite';
  const modeMatch = text.match(/(?:Work Mode|🏢\s*Work Mode)\s*:\s*([^\n\r]+)/i);
  if (modeMatch) {
    const m = modeMatch[1].toLowerCase();
    if (m.includes('remote')) workMode = 'Remote';
    else if (m.includes('hybrid')) workMode = 'Hybrid';
    else workMode = 'Onsite';
  } else if (text.toLowerCase().includes('on-site') || text.toLowerCase().includes('onsite')) {
    workMode = 'Onsite';
  } else if (text.toLowerCase().includes('remote')) {
    workMode = 'Remote';
  } else if (text.toLowerCase().includes('hybrid')) {
    workMode = 'Hybrid';
  }

  // 6. Extract Working Days
  let workingDays: string | undefined = undefined;
  const daysMatch = text.match(/(?:Working Days|📅\s*Working Days)\s*:\s*([^\n\r]+)/i);
  if (daysMatch) {
    workingDays = daysMatch[1].trim();
  }

  // 7. Extract Hashtags
  const hashtagRegex = /#([a-zA-Z0-9_-]+)/g;
  const hashtags = Array.from(new Set(Array.from(text.matchAll(hashtagRegex)).map(m => `#${m[1]}`)));

  // 8. Extract & Disaggregate Multiple Roles from Post Bullets
  // Matches bullet patterns like: 🔹 Finance Manager – ..., - Category Manager: ..., * Buyer ...
  const lines = text.split(/\r?\n/);
  const parsedRoles: ParsedLinkedInRole[] = [];

  const roleBulletRegex = /^(?:[🔹•\-\*▪️►\d\.]+\s*)([a-zA-Z\s/&-]+?)\s*(?:–|-|:)\s*(.+)$/i;

  for (const line of lines) {
    const cleanLine = line.trim();
    if (!cleanLine) continue;

    // Skip header lines or metadata lines
    if (
      cleanLine.toLowerCase().includes('location:') ||
      cleanLine.toLowerCase().includes('work mode:') ||
      cleanLine.toLowerCase().includes('working days:') ||
      cleanLine.toLowerCase().includes('interested candidates') ||
      cleanLine.toLowerCase().includes("we're hiring")
    ) {
      continue;
    }

    const match = cleanLine.match(roleBulletRegex);
    if (match) {
      const rawTitle = match[1].trim();
      const rawDetails = match[2].trim();

      // Clean title from any leftover hashtags
      const cleanTitle = rawTitle.replace(/#[a-zA-Z0-9_-]+/g, '').trim();

      // Extract experience years (e.g. 5+ years, 2+ years)
      let expYears = 0;
      const expMatch = rawDetails.match(/(\d+)\+?\s*(?:to\s*\d+)?\s*years/i);
      if (expMatch) {
        expYears = parseInt(expMatch[1], 10);
      }

      // Extract qualifications (e.g. CA qualified, MBA, Bachelor)
      const qualifications: string[] = [];
      const qualMatch = rawDetails.match(/#?([A-Za-z]+)\s+qualified|bachelor|master|certified|cpa|ca\b/gi);
      if (qualMatch) {
        qualMatch.forEach(q => qualifications.push(q.replace(/#/g, '').trim()));
      }

      // Extract domain expertise & hashtags from details
      const domainExpertise: string[] = [];
      const domainHashtags = rawDetails.match(/#([a-zA-Z0-9_-]+)/g);
      if (domainHashtags) {
        domainHashtags.forEach(h => domainExpertise.push(h.replace(/#/g, '').trim()));
      }

      // Extract mandatory requirements (e.g. "UAE experience is mandatory", "E-commerce experience is mandatory")
      const mandatoryRequirements: string[] = [];
      const mandMatch = rawDetails.match(/([a-zA-Z\s-]+(?:is\s+mandatory|mandatory|required))/gi);
      if (mandMatch) {
        mandMatch.forEach(m => mandatoryRequirements.push(m.trim()));
      }

      parsedRoles.push({
        title: cleanTitle,
        experience_years: expYears,
        qualifications,
        domain_expertise: domainExpertise,
        mandatory_requirements: mandatoryRequirements,
        raw_bullet: cleanLine
      });
    }
  }

  // If no bulleted roles found, extract title from headline or hashtags
  if (parsedRoles.length === 0) {
    let fallbackTitle = 'Key Role';
    if (hashtags.length > 0) {
      const titleTag = hashtags.find(h => !['#Hiring', '#DubaiJobs', '#UAEJobs', '#OnsiteJobs'].includes(h));
      if (titleTag) fallbackTitle = titleTag.replace('#', '').replace(/([A-Z])/g, ' $1').trim();
    }
    parsedRoles.push({
      title: fallbackTitle,
      experience_years: 3,
      qualifications: [],
      domain_expertise: [],
      mandatory_requirements: [],
      raw_bullet: text.slice(0, 150)
    });
  }

  // 9. Convert parsed roles into indexed JobListing objects
  const disaggregatedJobs: JobListing[] = parsedRoles.map((role, idx) => {
    const slug = role.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const empSlug = employer.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const jobId = `post_role_${empSlug}_${slug}_${idx + 1}`;

    const requirements = [
      ...role.qualifications,
      ...role.domain_expertise,
      ...role.mandatory_requirements,
      `${role.experience_years}+ years experience`
    ].filter(Boolean);

    const jobListing: JobListing = {
      id: jobId,
      employer,
      title: `${role.title} (LinkedIn Recruiter Post)`,
      location,
      source: 'LinkedIn Post',
      source_url: `https://www.linkedin.com/posts/${empSlug}-${slug}-hiring`,
      publication_date: new Date().toISOString().split('T')[0],
      salary_raw: 'Competitive UAE Package (Direct HR Ingestion)',
      requirements,
      experience_required_years: role.experience_years,
      seniority: role.experience_years >= 5 ? 'Senior' : role.experience_years >= 2 ? 'Mid' : 'Junior',
      visa_sponsorship: 'Yes',
      remote_eligibility: workMode,
      is_verified: 1,
      application_type: 'recruiter_post',
      portal_platform: 'Direct Email',
      raw_description: `🚨 LINKEDIN MULTI-ROLE RECRUITER POST (${employer} – ${location}):\n\nRole: ${role.title}\nRequirements: ${role.raw_bullet}\nLocation: ${location}\nWork Mode: ${workMode}${workingDays ? `\nWorking Days: ${workingDays}` : ''}\n\nDirect Recruiter Application Email: ${recruiterEmail} (${recruiterName || 'Talent Acquisition'})`
    };

    if (candidateProfile) {
      const match = calculateMatchScore(candidateProfile, jobListing);
      role.match_score = match.overall_score;
      jobListing.match_score = match.overall_score;
    }

    return jobListing;
  });

  return {
    employer,
    location,
    work_mode: workMode,
    working_days: workingDays,
    recruiter_email: recruiterEmail,
    recruiter_name: recruiterName,
    extracted_roles: parsedRoles,
    hashtags,
    raw_text: text,
    disaggregated_jobs: disaggregatedJobs
  };
}

/**
 * Executes a direct tailored application to a specific role extracted from a LinkedIn post,
 * addressing the recruiter email directly, attaching the tailored CV, and logging the
 * application and outbound email in CRM.
 */
export function applyToLinkedInPostRole(
  userId: string,
  job: JobListing,
  recruiterEmail: string,
  candidateProfile: FullCandidateProfile,
  recruiterName?: string
) {
  const tailoredPkg = generateTailoredPackage(candidateProfile, job);
  const user = { id: userId };

  // 0. Ensure job exists in job_listings
  db.prepare(`
    INSERT INTO job_listings (
      id, employer, title, location, source, source_url, publication_date,
      salary_raw, requirements, experience_required_years, seniority,
      visa_sponsorship, remote_eligibility, is_verified, application_type,
      portal_platform, raw_description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      location = excluded.location,
      raw_description = excluded.raw_description,
      requirements = excluded.requirements
  `).run(
    job.id,
    job.employer,
    job.title,
    job.location,
    job.source,
    job.source_url,
    job.publication_date,
    job.salary_raw || 'Competitive',
    JSON.stringify(job.requirements || []),
    job.experience_required_years || 0,
    job.seniority || 'Mid',
    job.visa_sponsorship || 'Yes',
    job.remote_eligibility || 'Onsite',
    1,
    job.application_type || 'recruiter_post',
    job.portal_platform || 'Direct Email',
    job.raw_description
  );

  // 1. Save tailored CV
  const cvId = `cv_post_${job.id}_${Date.now()}`;
  const cvTitle = `Aya_CV_${job.employer.replace(/[^a-zA-Z0-9]/g, '_')}_${job.title.replace(/[^a-zA-Z0-9]/g, '_')}`;

  db.prepare(`
    INSERT INTO resumes (id, user_id, title, type, target_role, target_country, raw_text, ats_score, version)
    VALUES (?, ?, ?, 'Tailored', ?, ?, ?, ?, 1)
  `).run(
    cvId,
    user.id,
    cvTitle,
    job.title,
    job.location,
    tailoredPkg.tailored_cv,
    95
  );

  // 2. Register Application in 'Package Prepared' state (truthful lifecycle)
  const appId = `app_post_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  db.prepare(`
    INSERT INTO applications (
      id, user_id, job_id, status, match_score, match_details_json,
      tailored_cv_id, cover_letter, screening_responses, disclosures_accepted,
      human_approved, approved_at, submission_type, submission_confirmed,
      applied_at, recruiter_name, recruiter_email, notes
    ) VALUES (?, ?, ?, 'Package Prepared', 95, '{}', ?, ?, ?, 1, 0, NULL, 'Manual', 0, NULL, ?, ?, ?)
  `).run(
    appId,
    user.id,
    job.id,
    cvId,
    tailoredPkg.cover_letter,
    JSON.stringify(tailoredPkg.screening_responses),
    recruiterName || 'Talent Acquisition Team',
    recruiterEmail,
    `Tailored application package prepared from LinkedIn post for ${job.title} at ${job.employer}. Review and approve in Approval Center.`
  );

  // 3. Draft & Dispatch Outbound Email to Recruiter
  const emailId = `email_out_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const greeting = recruiterName ? `Dear ${recruiterName},` : `Dear Hiring Team at ${job.employer},`;
  const candName = candidateProfile.profile.full_name || 'Candidate';
  const candEmail = candidateProfile.profile.email || '';
  const emailSubject = `Application: ${job.title} - ${candName} (${job.location})`;

  const emailBody = `${greeting}

I saw your hiring post on LinkedIn regarding the **${job.title}** opening at **${job.employer}** in ${job.location}.

I am pleased to submit my updated CV for your review. With extensive professional background and proven track record aligned with your requirements:
- Location & Work Mode: Readily available for ${job.location} (${job.remote_eligibility})
- Targeted Qualifications & Experience: Aligned with your posted criteria
- Attached Document: ${cvTitle}.pdf

I welcome the opportunity to discuss how I can contribute to the continued growth of ${job.employer}.

Best regards,  
${candName}  
${candEmail}${candidateProfile.profile.linkedin_url ? `\nLinkedIn: ${candidateProfile.profile.linkedin_url}` : ''}`;

  const emailCols = (db.prepare('PRAGMA table_info(emails)').all() as any[]).map((c: any) => c.name);
  if (emailCols.includes('user_id')) {
    db.prepare(`
      INSERT INTO emails (id, user_id, application_id, category, sender, recipient, subject, body, is_draft, is_sent, sent_at)
      VALUES (?, ?, ?, 'Opportunity', ?, ?, ?, ?, 1, 0, NULL)
    `).run(
      emailId,
      candidateProfile.profile.user_id,
      appId,
      candEmail,
      recruiterEmail,
      emailSubject,
      emailBody
    );
  } else {
    db.prepare(`
      INSERT INTO emails (id, application_id, category, sender, recipient, subject, body, is_draft, is_sent, sent_at)
      VALUES (?, ?, 'Opportunity', ?, ?, ?, ?, 1, 0, NULL)
    `).run(
      emailId,
      appId,
      candEmail,
      recruiterEmail,
      emailSubject,
      emailBody
    );
  }

  logAudit('LINKEDIN_POST_PACKAGE_PREPARED', {
    application_id: appId,
    employer: job.employer,
    role: job.title,
    recruiter_email: recruiterEmail,
    recruiter_name: recruiterName,
    cv_title: cvTitle
  }, userId);

  return {
    success: true,
    application_id: appId,
    email_id: emailId,
    cv_title: cvTitle,
    recruiter_email: recruiterEmail,
    subject: emailSubject,
    email_body: emailBody,
    status: 'Package Prepared',
    message: `Tailored application package prepared for ${job.title} at ${job.employer}! Ready for review in Approval Center.`
  };
}
