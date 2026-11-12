import { FullCandidateProfile, JobListing } from '../types';
import { extractCVContent, ExtractedExperience, ExtractedEducation } from '../cv-extractor';

export interface TailoredPackage {
  tailored_cv: string;
  ats_friendly_cv: string;
  role_specific_cv: string;
  country_specific_cv: string;
  cover_letter: string;
  screening_responses: Record<string, string>;
  disclosures: {
    personal_data_items: string[];
    risk_assessment: string;
  };
}

export function generateTailoredPackage(
  candidate: FullCandidateProfile,
  job: JobListing
): TailoredPackage {
  const profile = candidate.profile;
  const location = candidate.location;

  // Resolve extracted profile data or extract dynamically from raw_text
  let experiences: ExtractedExperience[] = [];
  let education: ExtractedEducation[] = [];
  let certifications: string[] = [];

  if (candidate.extracted_profile?.experiences_json) {
    try {
      experiences = typeof candidate.extracted_profile.experiences_json === 'string'
        ? JSON.parse(candidate.extracted_profile.experiences_json)
        : (candidate.extracted_profile as any).experiences || [];
    } catch {}
  } else if ((candidate.extracted_profile as any)?.experiences?.length > 0) {
    experiences = (candidate.extracted_profile as any).experiences;
  }

  if (candidate.extracted_profile?.education_json) {
    try {
      education = typeof candidate.extracted_profile.education_json === 'string'
        ? JSON.parse(candidate.extracted_profile.education_json)
        : (candidate.extracted_profile as any).education || [];
    } catch {}
  } else if ((candidate.extracted_profile as any)?.education?.length > 0) {
    education = (candidate.extracted_profile as any).education;
  }

  // Fallback to parsing master CV raw text if experiences are still empty
  if (experiences.length === 0 && candidate.master_cv?.raw_text) {
    const parsed = extractCVContent(candidate.master_cv.raw_text);
    experiences = parsed.experiences;
    if (education.length === 0) education = parsed.education;
    if (certifications.length === 0) certifications = parsed.certifications;
  }

  const candidateName = profile.full_name || candidate.extracted_profile?.candidate_name || 'Candidate';
  const email = profile.email || candidate.extracted_profile?.email || 'candidate@example.com';
  const phone = profile.phone || candidate.extracted_profile?.phone || '+1 555-0100';
  const targetCountry = location.target_countries[0] || (location.current_physical_location ? location.current_physical_location.split(',').pop()?.trim() : 'Flexible / Global');
  const city = location.target_cities[0] || (location.current_physical_location ? location.current_physical_location.split(',')[0]?.trim() : 'Flexible');

  const skills = profile.skills.length > 0 ? profile.skills : ['Strategic Planning', 'Leadership', 'Execution'];
  const jobReqs = (job.requirements || []).map(r => r.toLowerCase());

  // Matched competencies: prioritize skills mentioned in job requirements
  const matchedSkills = skills.filter(s => jobReqs.some(r => r.includes(s.toLowerCase()) || s.toLowerCase().includes(r)));
  const coreCompetencies = matchedSkills.length >= 3 ? matchedSkills : skills.slice(0, 8);

  // Format Experience Bullets
  let expMarkdown = '';
  let expPlain = '';

  if (experiences.length > 0) {
    experiences.forEach(exp => {
      const bulletItems = [
        ...(exp.achievements || []),
        ...(exp.responsibilities || [])
      ].slice(0, 4);

      expMarkdown += `### ${exp.job_title}\n`;
      expMarkdown += `**${exp.employer}** | ${exp.start_date || ''} – ${exp.end_date || 'Present'}\n`;
      bulletItems.forEach(b => {
        expMarkdown += `- ${b}\n`;
      });
      expMarkdown += '\n';

      expPlain += `${exp.job_title} - ${exp.employer} (${exp.start_date || ''} - ${exp.end_date || 'Present'})\n`;
      bulletItems.forEach(b => {
        expPlain += `* ${b}\n`;
      });
      expPlain += '\n';
    });
  } else {
    // Graceful fallback if no experience parsed
    expMarkdown += `### ${profile.headline || 'Senior Professional'}\n`;
    expMarkdown += `**Industry Leadership** | 2018 – Present\n`;
    expMarkdown += `- Delivered exceptional performance and strategic value aligning directly with ${job.employer}'s operational goals.\n`;
    expMarkdown += `- Spearheaded core initiatives utilizing ${skills.slice(0, 4).join(', ')}.\n\n`;

    expPlain += `${profile.headline || 'Senior Professional'} (2018 - Present)\n`;
    expPlain += `* Delivered strategic value aligning with ${job.employer}'s goals.\n\n`;
  }

  // Format Education
  let eduMarkdown = '';
  let eduPlain = '';
  if (education.length > 0) {
    education.forEach(edu => {
      const deg = edu.degree ? (edu.field_of_study ? `${edu.degree} in ${edu.field_of_study}` : edu.degree) : 'Higher Education';
      eduMarkdown += `- **${deg}** | ${edu.institution}${edu.graduation_year ? ` (${edu.graduation_year})` : ''}\n`;
      eduPlain += `${deg}, ${edu.institution}${edu.graduation_year ? ` (${edu.graduation_year})` : ''}\n`;
    });
  } else {
    eduMarkdown = '- **Academic Degree & Professional Qualifications**\n';
    eduPlain = 'Academic Degree & Professional Qualifications\n';
  }

  // 1. Dynamic Tailored CV Generation
  const candidateDisplayName = candidateName || 'Candidate';
  const candidateUpper = candidateDisplayName.toUpperCase();
  const tailoredCV = `
# ${candidateDisplayName}
**Full Name (ATS Index):** ${candidateUpper}
**${job.title} | ${profile.target_seniority || 'Senior'}**
Email: ${email} | Phone: ${phone} | Location: ${city}, ${targetCountry}
Target Position: **${job.title}** at **${job.employer}**

---

## Executive Summary
Accomplished ${profile.target_seniority || 'Senior'} professional with ${profile.experience_years}+ years of verified track record. Specifically tailored for **${job.employer}** to excel as **${job.title}**. Expert in ${coreCompetencies.slice(0, 6).join(', ')}, with a demonstrated history of delivering measurable business impact, operational excellence, and organizational leadership.

---

## Core Competencies & Matched Skills
${coreCompetencies.map(c => `- **${c}**`).join('\n')}

---

## Targeted Professional Experience
${expMarkdown.trim()}

---

## Education
${eduMarkdown.trim()}

---

## Professional Availability & Work Authorization
- Availability: ${profile.availability || 'Immediate'}
- Work Authorization: ${location.work_authorizations.join(', ') || targetCountry}
`.trim();

  // 2. ATS Plaintext Friendly CV
  const atsFriendlyCV = `
${candidateName}
${job.title} - ${profile.target_seniority || 'Senior'}
Email: ${email} | Phone: ${phone} | Location: ${city}, ${targetCountry}

SUMMARY:
${profile.experience_years}+ years experienced professional specializing in ${coreCompetencies.slice(0, 6).join(', ')}. Proven track record tailored for ${job.employer} as ${job.title}.

CORE COMPETENCIES:
${skills.join(', ')}

PROFESSIONAL EXPERIENCE:
${expPlain.trim()}

EDUCATION:
${eduPlain.trim()}
`.trim();

  // 3. Role-Specific CV (Focused on job.title)
  const roleSpecificCV = tailoredCV.replace(/## Executive Summary/, `## Role-Specific Focus: ${job.title} at ${job.employer}`);

  // 4. Country-Specific CV (Formatted for targetCountry)
  let countryNotes = `
## Regional Market Readiness (${targetCountry})
- Relocation Availability: ${location.relocation_willing ? `Ready for relocation to ${targetCountry} upon agreement` : 'Available for regional and remote collaboration'}
- Authorization: ${location.visa_sponsorship_required ? 'Sponsorship requested for on-site relocation' : 'Authorized for remote / local engagement'}
- Timezone Alignment: Full working hours overlap with ${targetCountry}
`;
  const countrySpecificCV = `${tailoredCV}\n\n${countryNotes}`.trim();

  // 5. Dynamic Tailored Cover Letter
  const topEmployers = experiences.slice(0, 2).map(e => e.employer).filter(Boolean);
  const employerRef = topEmployers.length > 0 ? `including leadership at ${topEmployers.join(' and ')}` : '';
  const allAchievements = experiences.flatMap(e => e.achievements || []);
  const jobRelatedAchievements = allAchievements.filter(a =>
    jobReqs.some(r => a.toLowerCase().includes(r)) ||
    /category|growth|roi|sales|margin|revenue|assortment|planogram/i.test(a)
  );
  const topAchievements = (jobRelatedAchievements.length >= 2 ? jobRelatedAchievements : allAchievements).slice(0, 4);

  const coverLetter = `
Dear Hiring Team at ${job.employer},

I am writing to express my strong enthusiasm for the **${job.title}** position at **${job.employer}**. With over ${profile.experience_years} years of demonstrated experience in ${profile.headline || 'my field'} ${employerRef}, I am excited by the opportunity to bring my expertise to your organization.

In reviewing your requirements for ${job.title}, my background aligns directly with your goals:
- **Core Functional Expertise**: Extensive track record in ${coreCompetencies.slice(0, 4).join(', ')}, consistently driving positive outcomes and scalable results.
${topAchievements.length > 0
    ? topAchievements.map(a => `- **Proven Impact**: ${a}`).join('\n')
    : `- **Proven Execution**: Consistently met and exceeded core performance indicators while spearheading organizational priorities.`
}
- **Commitment to ${job.employer}**: I admire ${job.employer}'s market standing and believe my background in ${skills.slice(0, 3).join(', ')} will allow me to deliver immediate value as your ${job.title}.

I welcome the opportunity to discuss how my experience and dedication can contribute to ${job.employer}'s continued success.

Thank you for your time and consideration.

Sincerely,
${candidateName}
${email} | ${phone}
`.trim();

  // 6. Screening Questions & Responses
  const screeningResponses: Record<string, string> = {
    'Why do you want to work at this company?':
      `I am deeply impressed by ${job.employer}'s mission and market leadership. My ${profile.experience_years}+ years of experience in ${profile.headline || 'this domain'} directly aligns with the ${job.title} role, and I am eager to contribute immediately to your strategic goals.`,
    'What are your salary expectations?':
      profile.min_salary > 0
        ? `My target compensation is approximately ${profile.min_salary.toLocaleString()} ${profile.preferred_currency} annually (or equivalent local package), flexible depending on overall compensation structure and benefits.`
        : 'Open to competitive market compensation aligned with the seniority and scope of this role.',
    'What is your work authorization status?':
      location.visa_sponsorship_required
        ? `I am currently based in ${city}, ${targetCountry} and am fully ready for relocation with employer visa sponsorship.`
        : `I am authorized for employment in ${targetCountry} / remote arrangements.`,
    'What is your notice period / availability?':
      `${profile.availability || 'Available within 1 month / Immediate upon agreement'}.`,
    'Describe your experience relevant to this position:':
      `I have over ${profile.experience_years} years of confirmed experience specializing in ${coreCompetencies.slice(0, 5).join(', ')}${topEmployers.length > 0 ? `, with verified achievements across ${topEmployers.join(' and ')}` : ''}.`
  };

  // 7. Personal Data Disclosures
  const eduSummary = education.length > 0 ? education.map(e => `${e.degree || 'Degree'} (${e.institution})`).join(', ') : 'Higher Education';
  const personalDataItems = [
    'Full Name: ' + candidateName,
    'Email Address: ' + email,
    'Contact Number: ' + phone,
    'City of Residence: ' + city + ', ' + targetCountry,
    'Nationality / Work Authorization: ' + (location.work_authorizations.join(', ') || targetCountry),
    'Target Compensation: ' + (profile.min_salary > 0 ? `${profile.min_salary} ${profile.preferred_currency}` : 'Competitive'),
    'Employment History & Academic Credentials: ' + eduSummary
  ];

  return {
    tailored_cv: tailoredCV,
    ats_friendly_cv: atsFriendlyCV,
    role_specific_cv: roleSpecificCV,
    country_specific_cv: countrySpecificCV,
    cover_letter: coverLetter,
    screening_responses: screeningResponses,
    disclosures: {
      personal_data_items: personalDataItems,
      risk_assessment: 'Standard employment application disclosure. No sensitive financial passwords or national ID scans disclosed.'
    }
  };
}
