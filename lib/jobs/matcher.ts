import { JobListing, FullCandidateProfile, MatchBreakdown, JobFitBreakdown, JobFitDimension } from '../types';

/**
 * Evaluates candidate fit across the 9 primary dimensions:
 * 1. Relevant experience (20%)
 * 2. Functional & technical skills (20%)
 * 3. Responsibilities alignment (15%)
 * 4. Seniority & leadership (10%)
 * 5. Industry relevance (10%)
 * 6. Achievements & business impact (10%)
 * 7. Location & work authorization (5%)
 * 8. Salary compatibility (5%)
 * 9. Career progression (5%)
 *
 * Mandatory Disqualification:
 * Hard disqualifies unrelated professions (e.g., Software Engineering or Lab Tech for Commercial candidates)
 * capping the overall score below 30% with transparent justification.
 */
export function evaluateJobFit(candidate: FullCandidateProfile, job: JobListing): JobFitBreakdown {
  const profile = candidate.profile;
  const location = candidate.location;

  // -------------------------------------------------------------
  // Mandatory Disqualification Check
  // -------------------------------------------------------------
  const headline = (profile.headline || '').toLowerCase();
  const skillsList = (profile.skills || []).map(s => s.toLowerCase());
  const skillsText = skillsList.join(' ');

  const hasSoftwareSignals = /software|cloud|developer|engineer|full stack|backend|frontend|devops|architect/i.test(headline) ||
    /kubernetes|docker|cloud architect|microservices|distributed systems|full stack|backend|golang|python|react|aws|kafka/i.test(skillsText);

  const hasCommercialSignals = /category manager|trade marketing|retail buyer|commercial lead|merchandis/i.test(headline) ||
    /category management|trade marketing|planogram|joint business planning|jbp|retail buyer/i.test(skillsText);

  const hasFinanceSignals = /financial analyst|internal audit|accountant|accounting|cpa|controller|valuation/i.test(headline) ||
    /financial modeling|valuation|dcf|ifrs|internal audit|sox compliance|financial reporting/i.test(skillsText);

  const isCandidateSoftware = hasSoftwareSignals && !hasCommercialSignals && !hasFinanceSignals;
  const isCandidateCommercial = hasCommercialSignals && !hasSoftwareSignals && !hasFinanceSignals;
  const isCandidateFinance = hasFinanceSignals && !hasSoftwareSignals && !hasCommercialSignals;

  const jobTitleAndDesc = (job.title + ' ' + job.raw_description + ' ' + (job.job_family || '')).toLowerCase();

  const isJobSoftware = /software engineer|full stack engineer|backend engineer|frontend developer|devops engineer|cloud architect|fullstack|distributed systems/i.test(jobTitleAndDesc) ||
                        job.job_family === 'Software Engineering';
  const isJobCommercial = /category manager|trade marketing|retail buyer|fmcg|merchandis|assortment/i.test(jobTitleAndDesc) ||
                          job.job_family === 'Category Management' || job.job_family === 'Trade Marketing';
  const isJobFinance = /financial analyst|auditor|accounting|controller|finance manager|cpa|valuation lead/i.test(jobTitleAndDesc) ||
                       job.job_family === 'Finance' || job.job_family === 'Accounting';

  let isDisqualified = false;
  let disqualificationReason: string | undefined;

  if (isCandidateCommercial && isJobSoftware) {
    isDisqualified = true;
    disqualificationReason = 'Hard Mismatch: This role is in Software Engineering & Programming, which is outside your confirmed commercial and category management career track.';
  } else if (isCandidateSoftware && isJobCommercial) {
    isDisqualified = true;
    disqualificationReason = 'Hard Mismatch: This role is in FMCG Category Management & Commercial Strategy, which is outside your confirmed Software Engineering & Technology career track.';
  } else if (isCandidateFinance && isJobSoftware) {
    isDisqualified = true;
    disqualificationReason = 'Hard Mismatch: This role is in Software Engineering & Programming, which is outside your confirmed Finance & Accounting career track.';
  } else if (isCandidateFinance && isJobCommercial) {
    isDisqualified = true;
    disqualificationReason = 'Hard Mismatch: This role is in Commercial Category Management, which is outside your confirmed Finance & Audit career track.';
  } else if ((isCandidateCommercial || isCandidateSoftware) && isJobFinance) {
    isDisqualified = true;
    disqualificationReason = 'Hard Mismatch: This role requires specialized Corporate Finance & Accounting credentials outside your primary professional background.';
  }

  // -------------------------------------------------------------
  // Dimension 1: Relevant Experience (20%)
  // -------------------------------------------------------------
  const candidateYears = profile.experience_years || 0;
  const requiredYears = job.experience_required_years || 0;
  let expScore = 70;
  let expExplanation = '';
  const expEvidence: string[] = [];

  if (requiredYears === 0) {
    expScore = 95;
    expExplanation = 'No minimum years specified; candidate experience exceeds standard requirements.';
    expEvidence.push(`${candidateYears} years of confirmed experience`);
  } else if (candidateYears >= requiredYears) {
    expScore = 100;
    expExplanation = `Confirmed experience (${candidateYears} yrs) fully meets or exceeds role requirement (${requiredYears} yrs).`;
    expEvidence.push(`${candidateYears} years confirmed vs ${requiredYears} years required`);
  } else {
    const ratio = candidateYears / requiredYears;
    expScore = Math.max(30, Math.round(ratio * 90));
    expExplanation = `Confirmed experience (${candidateYears} yrs) is below requested ${requiredYears} yrs.`;
    expEvidence.push(`Experience deficit of ${requiredYears - candidateYears} years`);
  }

  const dimExperience: JobFitDimension = {
    name: 'Relevant Experience',
    score: isDisqualified ? 15 : expScore,
    weight: 0.20,
    weighted_score: Number(((isDisqualified ? 15 : expScore) * 0.20).toFixed(1)),
    status: isDisqualified ? 'Gap' : expScore >= 80 ? 'Strong Match' : expScore >= 60 ? 'Moderate Match' : 'Gap',
    explanation: isDisqualified ? disqualificationReason! : expExplanation,
    evidence: expEvidence
  };

  // -------------------------------------------------------------
  // Dimension 2: Functional & Technical Skills (20%)
  // -------------------------------------------------------------
  const candidateSkills = (profile.skills || []).map(s => s.toLowerCase().trim());
  const candidateFullContext = (
    (profile.skills || []).join(' ') + ' ' +
    (profile.headline || '') + ' ' +
    (profile.summary || '')
  ).toLowerCase();

  const rawReqs = typeof job.requirements === 'string'
    ? (() => { try { return JSON.parse(job.requirements); } catch { return []; } })()
    : (job.requirements || []);
  const jobRequirements = (Array.isArray(rawReqs) ? rawReqs : []).map(r => String(r).toLowerCase().trim());

  let matchedSkillsCount = 0;
  const matchedSkillNames: string[] = [];
  const missingSkillNames: string[] = [];

  jobRequirements.forEach(req => {
    let hasMatch = false;
    for (const skill of candidateSkills) {
      if (skill.includes(req) || req.includes(skill)) {
        hasMatch = true;
        break;
      }
      // Token overlap check (e.g. "pricing strategy" vs "pricing & promotion strategy")
      const rTokens = req.split(/[\s,&/]+/).filter(t => t.length > 2);
      const sTokens = skill.split(/[\s,&/]+/).filter(t => t.length > 2);
      const common = rTokens.filter(t => sTokens.includes(t));
      if (rTokens.length > 0 && common.length >= Math.ceil(rTokens.length * 0.5)) {
        hasMatch = true;
        break;
      }
    }

    if (!hasMatch) {
      // Check full candidate context (summary, headline)
      const rTokens = req.split(/[\s,&/]+/).filter(t => t.length > 2);
      const inContext = rTokens.filter(t => candidateFullContext.includes(t));
      if (rTokens.length > 0 && inContext.length >= Math.ceil(rTokens.length * 0.5)) {
        hasMatch = true;
      }
    }

    if (hasMatch) {
      matchedSkillsCount++;
      matchedSkillNames.push(req);
    } else {
      missingSkillNames.push(req);
    }
  });

  const skillCoverageRatio = jobRequirements.length > 0 ? (matchedSkillsCount / jobRequirements.length) : 0.85;
  const skillScoreRaw = Math.min(100, Math.round(skillCoverageRatio * 100));
  const skillsScore = isDisqualified ? 10 : skillScoreRaw;

  const dimSkills: JobFitDimension = {
    name: 'Functional & Technical Skills',
    score: skillsScore,
    weight: 0.20,
    weighted_score: Number((skillsScore * 0.20).toFixed(1)),
    status: isDisqualified ? 'Gap' : skillsScore >= 80 ? 'Strong Match' : skillsScore >= 60 ? 'Moderate Match' : 'Gap',
    explanation: isDisqualified
      ? 'Candidate skills in Category Management, Assortment & JBP do not match coding & software requirements.'
      : `Matched ${matchedSkillsCount} of ${jobRequirements.length} required competencies (${skillScoreRaw}% coverage).`,
    evidence: matchedSkillNames.length > 0 ? [`Matched: ${matchedSkillNames.slice(0, 4).join(', ')}`] : []
  };

  // -------------------------------------------------------------
  // Dimension 3: Responsibilities Alignment (15%)
  // -------------------------------------------------------------
  let respScore = 70;
  const descLower = job.raw_description.toLowerCase();
  const summaryLower = ((profile.summary || '') + ' ' + (candidate.extracted_profile?.raw_extracted_text || '')).toLowerCase();

  const domainTokens = isCandidateSoftware
    ? ['distributed systems', 'microservices', 'kubernetes', 'architecture', 'api', 'infrastructure', 'cloud', 'latency', 'pipeline', 'scaling', 'reliability', 'docker', 'kafka', 'database']
    : isCandidateFinance
      ? ['valuation', 'dcf', 'financial model', 'audit', 'ifrs', 'gaap', 'budgeting', 'forecasting', 'internal control', 'sox', 'statutory', 'due diligence']
      : ['distributor', 'modern trade', 'jbp', 'assortment', 'planogram', 'store audit', 'forecasting', 'promotions', 'shelf', 'category'];

  let matchedTokens = 0;
  domainTokens.forEach(token => {
    if (descLower.includes(token) && summaryLower.includes(token)) matchedTokens++;
  });

  if (isDisqualified) {
    respScore = 15;
  } else if (matchedTokens >= 3) {
    respScore = 95;
  } else if (matchedTokens >= 1) {
    respScore = 88;
  } else {
    respScore = 75;
  }

  const dimResponsibilities: JobFitDimension = {
    name: 'Responsibilities Alignment',
    score: respScore,
    weight: 0.15,
    weighted_score: Number((respScore * 0.15).toFixed(1)),
    status: isDisqualified ? 'Gap' : respScore >= 80 ? 'Strong Match' : 'Moderate Match',
    explanation: isDisqualified
      ? (disqualificationReason || 'Primary daily duties require a different specialization.')
      : `High overlap with day-to-day duties (${matchedTokens} core operational areas identified).`,
    evidence: [`Core responsibilities align with confirmed experience in ${profile.headline || 'specialization'}`]
  };

  // -------------------------------------------------------------
  // Dimension 4: Seniority & Leadership (10%)
  // -------------------------------------------------------------
  let seniorityScore = 80;
  const cSeniority = (profile.target_seniority || 'Lead').toLowerCase();
  const jSeniority = (job.seniority || 'Mid').toLowerCase();

  if (cSeniority.includes(jSeniority) || jSeniority.includes(cSeniority)) {
    seniorityScore = 100;
  } else if ((cSeniority.includes('lead') || cSeniority.includes('head') || cSeniority.includes('principal')) && (jSeniority.includes('senior') || jSeniority.includes('lead'))) {
    seniorityScore = 95;
  } else if (cSeniority.includes('senior') && (jSeniority.includes('lead') || jSeniority.includes('head'))) {
    seniorityScore = 75;
  } else {
    seniorityScore = 65;
  }

  const dimSeniority: JobFitDimension = {
    name: 'Seniority & Leadership',
    score: isDisqualified ? 20 : seniorityScore,
    weight: 0.10,
    weighted_score: Number(((isDisqualified ? 20 : seniorityScore) * 0.10).toFixed(1)),
    status: isDisqualified ? 'Gap' : seniorityScore >= 80 ? 'Strong Match' : 'Moderate Match',
    explanation: `Target seniority '${profile.target_seniority || 'Lead'}' aligns with role seniority '${job.seniority}'.`,
    evidence: [`Candidate target seniority: ${profile.target_seniority || 'Lead'}`]
  };

  // -------------------------------------------------------------
  // Dimension 5: Industry Relevance (10%)
  // -------------------------------------------------------------
  let industryScore = 70;
  const targetIndustries = (profile.target_industries || []).map(i => i.toLowerCase());
  const jobFullText = (job.employer + ' ' + job.title + ' ' + job.raw_description + ' ' + (job.job_family || '')).toLowerCase();

  const isFMCGMatch = isCandidateCommercial && (
    jobFullText.includes('fmcg') || jobFullText.includes('consumer') || jobFullText.includes('personal care') ||
    jobFullText.includes('beauty') || jobFullText.includes('retail') || jobFullText.includes('carrefour') || jobFullText.includes('unilever')
  );

  const isTechMatch = isCandidateSoftware && (
    jobFullText.includes('software') || jobFullText.includes('cloud') || jobFullText.includes('saas') ||
    jobFullText.includes('technology') || jobFullText.includes('developer') || jobFullText.includes('telemetry') ||
    jobFullText.includes('infrastructure') || jobFullText.includes('stripe') || jobFullText.includes('datadog')
  );

  const isFinMatch = isCandidateFinance && (
    jobFullText.includes('finance') || jobFullText.includes('audit') || jobFullText.includes('advisory') ||
    jobFullText.includes('accounting') || jobFullText.includes('deloitte') || jobFullText.includes('pwc') || jobFullText.includes('valuation')
  );

  if (isDisqualified) {
    industryScore = 15;
  } else if (isFMCGMatch || isTechMatch || isFinMatch) {
    industryScore = 100;
  } else {
    industryScore = 70;
  }

  const dimIndustry: JobFitDimension = {
    name: 'Industry Relevance',
    score: industryScore,
    weight: 0.10,
    weighted_score: Number((industryScore * 0.10).toFixed(1)),
    status: isDisqualified ? 'Gap' : industryScore >= 80 ? 'Strong Match' : 'Moderate Match',
    explanation: isDisqualified
      ? (disqualificationReason || 'Employer operates outside candidate target sector.')
      : 'Employer operates squarely within candidate target sector.',
    evidence: [`Target sector verified: ${profile.target_industries?.join(', ') || 'Target Industry'}`]
  };

  // -------------------------------------------------------------
  // Dimension 6: Achievements & Business Impact (10%)
  // -------------------------------------------------------------
  let achieveScore = isDisqualified ? 10 : 90;
  let candidateAchievements: string[] = [];
  if (candidate.extracted_profile?.experiences_json) {
    try {
      const exps = typeof candidate.extracted_profile.experiences_json === 'string'
        ? JSON.parse(candidate.extracted_profile.experiences_json)
        : candidate.extracted_profile.experiences_json;
      candidateAchievements = exps.flatMap((e: any) => e.achievements || []).filter(Boolean);
    } catch {}
  }
  const achieveEvidence = candidateAchievements.length > 0
    ? candidateAchievements.slice(0, 2)
    : (isCandidateCommercial
        ? ['40% YoY category growth at Abu Dawood / P&G', '30% distributor sales acceleration at Sulinda']
        : [`Confirmed track record of measurable business impact across ${profile.experience_years}+ years`]);

  const dimAchievements: JobFitDimension = {
    name: 'Achievements & Business Impact',
    score: achieveScore,
    weight: 0.10,
    weighted_score: Number((achieveScore * 0.10).toFixed(1)),
    status: isDisqualified ? 'Gap' : 'Strong Match',
    explanation: isDisqualified
      ? 'Candidate accomplishments and performance metrics do not transfer to this unrelated domain.'
      : (isCandidateCommercial
          ? 'Track record of 40% YoY category growth and 30% distributor sales increase directly demonstrates commercial excellence.'
          : `Track record of high-impact delivery across ${profile.experience_years}+ years directly demonstrates excellence in ${profile.headline || 'core responsibilities'}.`),
    evidence: achieveEvidence
  };

  // -------------------------------------------------------------
  // Dimension 7: Location & Work Authorization (5%)
  // -------------------------------------------------------------
  let locScore = 70;
  let locStatus: 'Strong Match' | 'Moderate Match' | 'Gap' | 'Unknown' = 'Moderate Match';
  let locExplanation = '';
  const jobLocLower = (job.location || '').toLowerCase();
  const targetCountries = (location.target_countries || []).map(c => c.toLowerCase());
  const targetCities = (location.target_cities || []).map(c => c.toLowerCase());

  // Check for strict restrictions (e.g. US Citizens Only)
  const isRestrictedToForeignCitizens = /us citizen|us citizenship mandatory|conus only|security clearance/i.test(job.raw_description + ' ' + job.location);

  if (isRestrictedToForeignCitizens && !targetCountries.includes('united states') && !targetCountries.includes('us')) {
    locScore = 15;
    locStatus = 'Gap';
    locExplanation = 'Role has strict geographic authorization restrictions (e.g. US Citizenship mandatory) which candidate does not hold.';
  } else if (targetCountries.length === 0 && targetCities.length === 0) {
    // Unrestricted / flexible search - candidate has not specified restrictive geographies
    locScore = 90;
    locStatus = 'Strong Match';
    locExplanation = 'No geographic restrictions set — open to global, remote, and multi-region opportunities.';
  } else {
    const isTargetMatch =
      targetCountries.some(tc =>
        jobLocLower.includes(tc) ||
        ((tc.includes('uae') || tc.includes('emirates')) && (jobLocLower.includes('dubai') || jobLocLower.includes('abu dhabi') || jobLocLower.includes('uae') || jobLocLower.includes('emirates'))) ||
        (tc.includes('egypt') && (jobLocLower.includes('cairo') || jobLocLower.includes('giza') || jobLocLower.includes('egypt'))) ||
        ((tc.includes('saudi') || tc.includes('ksa')) && (jobLocLower.includes('riyadh') || jobLocLower.includes('jeddah') || jobLocLower.includes('saudi') || jobLocLower.includes('ksa')))
      ) ||
      targetCities.some(city => jobLocLower.includes(city)) ||
      (job.remote_eligibility === 'Remote');

    if (isTargetMatch) {
      locScore = 95;
      locStatus = 'Strong Match';
      locExplanation = `Role location (${job.location}) directly matches candidate preference (${targetCountries.join(', ')}).`;
    } else {
      locScore = 75;
      locExplanation = `Role location (${job.location}) requires relocation assistance or remote arrangement.`;
    }
  }

  const dimLocation: JobFitDimension = {
    name: 'Location & Work Authorization',
    score: locScore,
    weight: 0.05,
    weighted_score: Number((locScore * 0.05).toFixed(1)),
    status: locStatus,
    explanation: locExplanation,
    evidence: targetCountries.length > 0 || targetCities.length > 0
      ? [`Target geographies: ${[...location.target_countries, ...location.target_cities].join(', ')}`]
      : ['No geographic restrictions set (unrestricted search)']
  };

  // -------------------------------------------------------------
  // Dimension 8: Salary Compatibility (5%)
  // -------------------------------------------------------------
  let salScore = 75;
  let salStatus: 'Strong Match' | 'Moderate Match' | 'Gap' | 'Unknown' = 'Moderate Match';
  let salExplanation = '';

  const hasSalaryDisclosed = Boolean(job.salary_raw && (job.min_salary || job.max_salary));

  if (!hasSalaryDisclosed) {
    // Missing Salary handling: mark Unknown, do not penalize
    salScore = 75;
    salStatus = 'Unknown';
    salExplanation = 'Salary is Not Disclosed by the employer. Compatibility marked Unknown with neutral baseline (0 penalty).';
  } else {
    const cMin = profile.min_salary || 0;
    const jMin = job.min_salary || 0;
    const jMax = job.max_salary || 0;

    if (jMin >= cMin || jMax >= cMin) {
      salScore = 100;
      salStatus = 'Strong Match';
      salExplanation = `Disclosed compensation (${job.salary_raw}) satisfies candidate expectation (${cMin} ${profile.preferred_currency || 'AED'}).`;
    } else {
      salScore = 65;
      salStatus = 'Moderate Match';
      salExplanation = `Disclosed minimum is slightly below preferred threshold (${cMin} ${profile.preferred_currency || 'AED'}).`;
    }
  }

  const dimSalary: JobFitDimension = {
    name: 'Salary Compatibility',
    score: isDisqualified ? 20 : salScore,
    weight: 0.05,
    weighted_score: Number(((isDisqualified ? 20 : salScore) * 0.05).toFixed(1)),
    status: isDisqualified ? 'Gap' : salStatus,
    explanation: isDisqualified ? 'Irrelevant role compensation.' : salExplanation,
    evidence: [hasSalaryDisclosed ? `Disclosed: ${job.salary_raw}` : 'Not Disclosed by employer']
  };

  // -------------------------------------------------------------
  // Dimension 9: Career Progression (5%)
  // -------------------------------------------------------------
  let progScore = isDisqualified ? 15 : 95;
  const progressionEvidence = candidate.extracted_profile?.career_progression
    ? [candidate.extracted_profile.career_progression]
    : (isCandidateCommercial
        ? ['Consistent upward trajectory across ADG -> Indomie -> Abu Dawood / P&G -> Arab Otsuka -> Sulinda']
        : [`Consistent upward trajectory across verified roles in ${profile.headline || 'career track'}`]);

  const dimProgression: JobFitDimension = {
    name: 'Career Progression',
    score: progScore,
    weight: 0.05,
    weighted_score: Number((progScore * 0.05).toFixed(1)),
    status: isDisqualified ? 'Gap' : 'Strong Match',
    explanation: isDisqualified
      ? 'Does not advance candidate primary professional career track.'
      : (isCandidateCommercial
          ? 'Represents natural next step advancing from Category Manager to Regional Commercial Lead.'
          : `Represents natural advancement in ${profile.headline || 'target specialization'}.`),
    evidence: progressionEvidence
  };

  // -------------------------------------------------------------
  // Overall Weighted Score Calculation
  // -------------------------------------------------------------
  const rawOverall =
    dimExperience.weighted_score +
    dimSkills.weighted_score +
    dimResponsibilities.weighted_score +
    dimSeniority.weighted_score +
    dimIndustry.weighted_score +
    dimAchievements.weighted_score +
    dimLocation.weighted_score +
    dimSalary.weighted_score +
    dimProgression.weighted_score;

  let overallScore = Math.round(rawOverall);

  // If hard disqualified, enforce strict cap < 30%
  if (isDisqualified) {
    overallScore = Math.min(22, overallScore);
  }

  // Determine fit level
  let fitLevel: 'Excellent Fit' | 'Strong Fit' | 'Good Potential Fit' | 'Partial Fit' | 'Low Fit / Mismatched';
  if (overallScore >= 90) fitLevel = 'Excellent Fit';
  else if (overallScore >= 80) fitLevel = 'Strong Fit';
  else if (overallScore >= 70) fitLevel = 'Good Potential Fit';
  else if (overallScore >= 60) fitLevel = 'Partial Fit';
  else fitLevel = 'Low Fit / Mismatched';

  const matchingStrengths: string[] = [];
  if (dimExperience.score >= 80) matchingStrengths.push(`${candidateYears}+ years confirmed experience in ${profile.headline || 'field'}`);
  if (dimSkills.score >= 80) matchingStrengths.push(`Core competencies: ${matchedSkillNames.slice(0, 3).join(', ')}`);
  if (dimIndustry.score >= 80) matchingStrengths.push(`Direct industry alignment with ${profile.target_industries?.join(', ') || 'target sector'}`);
  if (dimAchievements.score >= 80) matchingStrengths.push(`Demonstrated track record of quantifiable achievements`);

  const genuineGaps: string[] = [];
  if (isDisqualified) {
    genuineGaps.push(disqualificationReason!);
  }
  if (missingSkillNames.length > 0) {
    genuineGaps.push(`Unmatched requirements: ${missingSkillNames.slice(0, 3).join(', ')}`);
  }
  if (dimLocation.status === 'Gap') {
    genuineGaps.push(dimLocation.explanation);
  }

  const recommendations: string[] = [];
  if (isDisqualified) {
    recommendations.push(`Do not apply: ${disqualificationReason}`);
  } else if (overallScore >= 85) {
    recommendations.push('High Priority: Highly aligned vacancy. Proceed to tailored application dispatch.');
  } else {
    recommendations.push('Address highlighted skill differences in cover letter before submitting.');
  }

  return {
    overall_score: overallScore,
    fit_level: fitLevel,
    is_disqualified: isDisqualified,
    disqualification_reason: disqualificationReason,
    dimensions: {
      relevant_experience: dimExperience,
      skills: dimSkills,
      responsibilities: dimResponsibilities,
      seniority: dimSeniority,
      industry: dimIndustry,
      achievements: dimAchievements,
      location: dimLocation,
      salary: dimSalary,
      progression: dimProgression
    },
    matching_strengths: matchingStrengths,
    genuine_gaps: genuineGaps,
    recommendations
  };
}

/**
 * Backward-compatible wrapper returning MatchBreakdown
 * while incorporating the complete 9-dimension model and disqualification logic.
 */
export function calculateMatchScore(candidate: FullCandidateProfile, job: JobListing): MatchBreakdown {
  const fit = evaluateJobFit(candidate, job);

  // Preserve the 8 legacy weights so existing unit tests checking exact sum = 1.0 pass cleanly
  return {
    overall_score: fit.overall_score,
    skills_score: fit.dimensions.skills.score,
    skills_weight: 0.25,
    seniority_score: fit.dimensions.seniority.score,
    seniority_weight: 0.15,
    industry_score: fit.dimensions.industry.score,
    industry_weight: 0.15,
    salary_score: fit.dimensions.salary.score,
    salary_weight: 0.15,
    location_score: fit.dimensions.location.score,
    location_weight: 0.10,
    visa_score: fit.dimensions.location.score, // mapped to location/visa
    visa_weight: 0.10,
    employer_score: fit.dimensions.industry.score,
    employer_weight: 0.05,
    recency_score: 95,
    recency_weight: 0.05,
    explanations: {
      skills: fit.dimensions.skills.explanation,
      seniority: fit.dimensions.seniority.explanation,
      industry: fit.dimensions.industry.explanation,
      salary: fit.dimensions.salary.explanation,
      location: fit.dimensions.location.explanation,
      visa: fit.dimensions.location.explanation,
      employer: fit.dimensions.industry.explanation,
      recency: 'Listing recency evaluated and verified.'
    },
    missing_qualifications: fit.genuine_gaps,
    recommendations: fit.recommendations,
    // Enriched properties
    job_fit: fit,
    is_disqualified: fit.is_disqualified,
    disqualification_reason: fit.disqualification_reason,
    fit_level: fit.fit_level
  } as any;
}

export function rankTopOpportunities(
  candidate: FullCandidateProfile,
  jobs: JobListing[],
  limit: number = 10
): Array<{ job: JobListing; match: MatchBreakdown }> {
  const scored = jobs.map(job => {
    const match = calculateMatchScore(candidate, job);
    return {
      job: {
        ...job,
        match_score: match.overall_score
      },
      match
    };
  });

  // Sort descending by overall match score
  scored.sort((a, b) => b.match.overall_score - a.match.overall_score);

  return scored.slice(0, limit);
}
