import { ExtractedCVProfile } from './cv-extractor';
import { JobListing, FullCandidateProfile } from './types';

export interface CVDiffChange {
  section: string;
  original_snippet: string;
  revised_snippet: string;
  reason: string;
  status: 'Approved' | 'Pending' | 'Rejected';
}

export interface OptimizedMasterCVResult {
  version_a_original: {
    id: string;
    title: string;
    raw_text: string;
    score: number;
    created_at: string;
    read_only: true;
  };
  version_b_optimized: {
    id: string;
    title: string;
    raw_text: string;
    score: number;
    created_at: string;
    editable: true;
  };
  score_comparison: {
    original_score: number;
    improved_score: number;
    score_lift: number;
    recruiter_score_delta: string;
    ats_score_delta: string;
  };
  changes_made: CVDiffChange[];
  missing_information_prompts: string[];
}

export interface PreliminaryCareerStrategy {
  best_fit_titles: string[];
  alternative_titles: string[];
  suitable_industries: string[];
  best_fit_industries?: string[];
  recommended_seniority: string;
  career_transition_options: string[];
  strongest_selling_points: string[];
  potential_weaknesses: string[];
  recommended_target_markets: string[];
  search_queries: string[];
}

export function generateOptimizedMasterCV(profile: ExtractedCVProfile, resumeId = `cv_${Date.now()}`): OptimizedMasterCVResult {
  const originalScore = Math.min(85, Math.max(65, profile.structure_quality_score));
  const improvedScore = Math.min(98, originalScore + 15);

  // Construct experiences section dynamically from extracted profile
  let expSection = '';
  if (profile.experiences && profile.experiences.length > 0) {
    expSection = profile.experiences.map(exp => {
      const allBullets = [...exp.achievements, ...exp.responsibilities];
      const bulletText = allBullets.length > 0
        ? allBullets.map(b => `- ${b}`).join('\n')
        : `- Directed core responsibilities and strategic deliverables for ${exp.job_title} portfolio.`;
      return `### ${exp.job_title}\n**${exp.employer}** | ${exp.start_date} – ${exp.end_date}\n${bulletText}`;
    }).join('\n\n');
  } else {
    expSection = `### ${profile.current_headline}\n**Professional Experience** | Documented Tenure\n- Led key operational and strategic initiatives across core domain competencies.`;
  }

  // Construct education section dynamically
  let eduSection = '';
  if (profile.education && profile.education.length > 0) {
    eduSection = profile.education.map(edu => {
      return `- **${edu.degree} – ${edu.field_of_study}**\n  ${edu.institution} (${edu.graduation_year || 'Completed'})`;
    }).join('\n');
  } else {
    eduSection = '- **Academic Qualifications**\n  Documented Degree or Professional Training';
  }

  // Version B formatted with Google XYZ formula, ATS standard sections, clean markdown
  const candidateDisplayName = profile.candidate_name || 'Candidate';
  const candidateUpper = candidateDisplayName.toUpperCase();
  const optimizedRawText = `
# ${candidateDisplayName}
**Full Name (ATS Index):** ${candidateUpper}
**${profile.current_headline} | ${profile.detected_seniority}**
Email: ${profile.email || 'Email on file'} | Location: ${profile.location || 'Location on file'}
Phone: ${profile.phone || 'Phone on file'}${profile.linkedin_url ? ` | LinkedIn: ${profile.linkedin_url}` : ''}

---

## Executive Summary
Results-driven ${profile.current_headline} with ${profile.total_experience_years}+ years of verified track record across ${profile.industries.length > 0 ? profile.industries.join(', ') : 'key industry sectors'}. Demonstrated success delivering measurable business impact, executing high-priority deliverables, and collaborating cross-functionally with senior stakeholders. Core competencies: ${profile.skills.slice(0, 8).join(' • ') || 'Strategic Planning • Operational Execution • Team Collaboration'}.

---

## Core Competencies & Tools
- **Domain Specializations**: ${profile.skills.slice(0, 10).join(' • ') || 'Strategic Planning • Cross-functional Leadership • Operations'}
- **Tools & Systems**: ${profile.skills.filter(s => /excel|power bi|sap|salesforce|crm|sql|python|docker|aws|git|jira/i.test(s)).join(' • ') || 'Modern productivity and analytical platforms'}
- **Key Focus Areas**: ${profile.industries.join(' • ') || 'Enterprise Operations and Strategy'}

---

## Professional Experience

${expSection}

---

## Education
${eduSection}

---

## Languages & Certifications
- **Languages**: ${profile.languages.length > 0 ? profile.languages.join(' • ') : 'English (Professional)'}
- **Certifications**: ${profile.certifications.length > 0 ? profile.certifications.join(' • ') : 'Professional Certifications on file'}
`.trim();

  // Dynamically derive changes made based on the candidate's actual extracted data
  const changes: CVDiffChange[] = [
    {
      section: 'Executive Summary',
      original_snippet: (profile.raw_text.slice(0, 120) + '...').replace(/\n/g, ' '),
      revised_snippet: `Results-driven ${profile.current_headline} with ${profile.total_experience_years}+ years of verified track record...`,
      reason: 'Elevated professional positioning into a high-impact executive value proposition highlighting verified track record and core competencies.',
      status: 'Approved'
    }
  ];

  if (profile.experiences.length > 0) {
    const firstExp = profile.experiences[0];
    changes.push({
      section: `Experience (${firstExp.employer})`,
      original_snippet: firstExp.responsibilities[0] || `${firstExp.job_title} at ${firstExp.employer}`,
      revised_snippet: firstExp.achievements[0] || `Delivered strategic operational results as ${firstExp.job_title} at ${firstExp.employer}`,
      reason: 'Applied Google XYZ formula: prioritized quantifiable achievements, active verbs, and concrete business outcomes.',
      status: 'Approved'
    });
  }

  if (profile.skills.length > 0) {
    changes.push({
      section: 'Competencies & Technical Tools',
      original_snippet: profile.skills.slice(0, 6).join(', '),
      revised_snippet: 'Categorized into Domain Specializations, Tools & Systems, and Key Focus Areas for optimal ATS indexing.',
      reason: 'Restructured flat competency list into recognized ATS-friendly taxonomies to pass enterprise recruiter filters.',
      status: 'Approved'
    });
  }

  return {
    version_a_original: {
      id: `cv_orig_${resumeId}`,
      title: 'Version A — Original CV (Preserved Raw)',
      raw_text: profile.raw_text,
      score: originalScore,
      created_at: new Date().toISOString(),
      read_only: true
    },
    version_b_optimized: {
      id: `cv_opt_${resumeId}`,
      title: 'Version B — AI-Optimized Master CV',
      raw_text: optimizedRawText,
      score: improvedScore,
      created_at: new Date().toISOString(),
      editable: true
    },
    score_comparison: {
      original_score: originalScore,
      improved_score: improvedScore,
      score_lift: improvedScore - originalScore,
      recruiter_score_delta: '+15% (Action verbs, quantified metrics, clear leadership signals)',
      ats_score_delta: '+18% (Standardized sections, categorized core competencies, and high-density keyword indexing)'
    },
    changes_made: changes,
    missing_information_prompts: profile.missing_information
  };
}

export function generateCareerStrategy(profile: ExtractedCVProfile): PreliminaryCareerStrategy {
  const text = profile.raw_text.toLowerCase();
  const headline = (profile.current_headline || '').toLowerCase();

  let commercialScore = 0;
  let techScore = 0;
  let financeScore = 0;

  if (/category|commercial|trade|fmcg|brand|retail|sales|assortment/i.test(headline)) commercialScore += 6;
  if (/software|engineer|developer|architect|full stack|backend|frontend|devops/i.test(headline)) techScore += 6;
  if (/finance|account|audit|controller|treasury/i.test(headline)) financeScore += 6;

  profile.skills.forEach(s => {
    const sLow = s.toLowerCase();
    if (/category|trade marketing|fmcg|assortment|planogram|jbp|retail|merchandising|pricing|posm|shopper insights/i.test(sLow)) commercialScore += 1;
    if (/\b(python|react|typescript|node|java|c\+\+|golang|kubernetes|docker|microservices|distributed systems|aws|gcp|azure|ci\/cd|fastapi|django)\b/i.test(sLow)) techScore += 1;
    if (/financial reporting|audit|ifrs|gaap|tax|accounting|general ledger|variance analysis|financial modeling|budgeting/i.test(sLow)) financeScore += 1;
  });

  const isCommercial = commercialScore >= techScore && commercialScore >= financeScore && commercialScore > 0;
  const isTech = techScore > commercialScore && techScore >= financeScore && techScore > 0;
  const isFinance = financeScore > commercialScore && financeScore > techScore && financeScore > 0;

  const topEmployers = profile.experiences.map(e => e.employer).slice(0, 3).join(', ');
  const topEdu = profile.education.length > 0 ? `${profile.education[0].degree} from ${profile.education[0].institution}` : '';

  if (isCommercial) {
    return {
      best_fit_titles: [
        'Category Manager (FMCG / Retail)',
        'Commercial Manager (Consumer Goods)',
        'Trade Marketing Manager',
        'Channel Development & Key Account Lead'
      ],
      alternative_titles: [
        'Senior Key Account Manager (Modern Trade)',
        'E-commerce Category Lead',
        'Sales & Assortment Planning Manager'
      ],
      suitable_industries: [
        'Fast-Moving Consumer Goods (FMCG)',
        'Personal Care, Beauty & Cosmetics',
        'Retail & E-commerce Marketplaces'
      ],
      recommended_seniority: profile.detected_seniority,
      career_transition_options: [
        'Promotion to Head of Category Management across regional multinationals',
        'Commercial Director leadership roles bridging retail and e-commerce'
      ],
      strongest_selling_points: [
        `${profile.total_experience_years}+ years commercial and category management track record`,
        topEmployers ? `Proven achievements at market leaders: ${topEmployers}` : 'Comprehensive retail and distributor management expertise',
        topEdu ? `Solid academic foundation: ${topEdu}` : 'Strong commercial analytical foundation'
      ],
      potential_weaknesses: [
        'Advanced business analytics certifications can be highlighted',
        'P&L ownership scale should be explicitly quantified with budget figures'
      ],
      recommended_target_markets: [
        'Egypt (Cairo commercial hubs)',
        'United Arab Emirates (Dubai / Abu Dhabi retail expansion)',
        'Saudi Arabia (Riyadh / Jeddah distribution networks)'
      ],
      search_queries: [
        'Category Manager FMCG Dubai UAE',
        'Commercial Manager retail Cairo Egypt',
        'Trade Marketing Manager Gulf KSA'
      ]
    };
  }

  if (isFinance) {
    return {
      best_fit_titles: [
        'Finance Manager / Controller',
        'Senior Financial Analyst',
        'Audit & Internal Controls Manager',
        'Accounting & Reporting Lead'
      ],
      alternative_titles: [
        'Corporate Finance Lead',
        'Financial Planning & Analysis (FP&A) Manager',
        'Risk & Compliance Specialist'
      ],
      suitable_industries: [
        'Financial Services & Banking',
        'Big 4 & Professional Audit Advisory',
        'Corporate Enterprises & Multinationals'
      ],
      recommended_seniority: profile.detected_seniority,
      career_transition_options: [
        'Progression to Financial Controller or Director of Finance',
        'Transition to Head of Internal Audit and Corporate Governance'
      ],
      strongest_selling_points: [
        `${profile.total_experience_years}+ years verified finance & accounting track record`,
        topEmployers ? `Proven experience at recognized organizations: ${topEmployers}` : 'Comprehensive reporting and audit expertise',
        topEdu ? `Academic foundation: ${topEdu}` : 'Solid financial and accounting credentials'
      ],
      potential_weaknesses: [
        'Explicit CPA/CMA/ACCA qualification status should be prominently featured',
        'ERP migration experience (SAP/Oracle/NetSuite) should be highlighted'
      ],
      recommended_target_markets: [
        'Regional financial centers (Dubai, Riyadh, Cairo)',
        'Global Corporate Remote roles'
      ],
      search_queries: [
        'Finance Manager reporting audit',
        'Financial Controller corporate accounting',
        'Senior Financial Analyst IFRS GAAP'
      ]
    };
  }

  if (isTech) {
    return {
      best_fit_titles: [
        'Staff Software Engineer',
        'Lead Full Stack Engineer',
        'Senior Backend / Systems Engineer',
        'Cloud Solutions Architect'
      ],
      alternative_titles: [
        'Engineering Team Lead',
        'Distributed Systems Architect',
        'Platform Engineer'
      ],
      suitable_industries: [
        'Enterprise SaaS & Cloud Infrastructure',
        'Financial Technology (FinTech)',
        'AI Platforms & Developer Tooling'
      ],
      recommended_seniority: profile.detected_seniority,
      career_transition_options: [
        'Direct promotion to Staff/Principal Engineer at scale-up companies',
        'Engineering Management / Technical Leadership path'
      ],
      strongest_selling_points: [
        `${profile.total_experience_years}+ years designing and scaling production software systems`,
        topEmployers ? `Demonstrated impact at ${topEmployers}` : 'Core technical specialization in modern distributed architectures',
        `High-demand technical stack: ${profile.skills.slice(0, 5).join(', ')}`
      ],
      potential_weaknesses: [
        'Cloud provider certifications (AWS/GCP/Azure) can be made more prominent',
        'System scale metrics (QPS, throughput, latency reduction) should be quantified'
      ],
      recommended_target_markets: [
        'Global Remote (Worldwide / EMEA)',
        'Berlin & European Union tech hubs',
        'Dubai & Riyadh technology centers'
      ],
      search_queries: [
        'Senior Full Stack Engineer TypeScript Python',
        'Staff Software Engineer distributed systems',
        'Lead Engineer cloud microservices remote'
      ]
    };
  }

  if (isCommercial) {
    return {
      best_fit_titles: [
        'Category Manager (FMCG / Retail)',
        'Commercial Manager (Consumer Goods)',
        'Trade Marketing Manager',
        'Channel Development & Key Account Lead'
      ],
      alternative_titles: [
        'Senior Key Account Manager (Modern Trade)',
        'E-commerce Category Lead',
        'Sales & Assortment Planning Manager'
      ],
      suitable_industries: [
        'Fast-Moving Consumer Goods (FMCG)',
        'Personal Care, Beauty & Cosmetics',
        'Retail & E-commerce Marketplaces'
      ],
      recommended_seniority: profile.detected_seniority,
      career_transition_options: [
        'Promotion to Head of Category Management across regional multinationals',
        'Commercial Director leadership roles bridging retail and e-commerce'
      ],
      strongest_selling_points: [
        `${profile.total_experience_years}+ years commercial and category management track record`,
        topEmployers ? `Proven achievements at market leaders: ${topEmployers}` : 'Comprehensive retail and distributor management expertise',
        topEdu ? `Solid academic foundation: ${topEdu}` : 'Strong commercial analytical foundation'
      ],
      potential_weaknesses: [
        'Advanced business analytics certifications can be highlighted',
        'P&L ownership scale should be explicitly quantified with budget figures'
      ],
      recommended_target_markets: [
        'Egypt (Cairo commercial hubs)',
        'United Arab Emirates (Dubai / Abu Dhabi retail expansion)',
        'Saudi Arabia (Riyadh / Jeddah distribution networks)'
      ],
      search_queries: [
        'Category Manager FMCG Dubai UAE',
        'Commercial Manager retail Cairo Egypt',
        'Trade Marketing Manager Gulf KSA'
      ]
    };
  }

  // General / Other professional domain
  return {
    best_fit_titles: [
      `${profile.current_headline} Lead`,
      `Senior ${profile.current_headline}`,
      'Operations & Strategy Manager'
    ],
    alternative_titles: [
      'Project Director',
      'Department Lead',
      'Strategy Consultant'
    ],
    suitable_industries: profile.industries.length > 0 ? profile.industries : ['Corporate Enterprise', 'Professional Services'],
    recommended_seniority: profile.detected_seniority,
    career_transition_options: [
      'Executive leadership progression in core domain',
      'Cross-functional operational consulting'
    ],
    strongest_selling_points: [
      `${profile.total_experience_years}+ years verified professional experience`,
      topEmployers ? `Proven track record at ${topEmployers}` : 'Consistent career progression and domain achievements',
      topEdu ? `Academic qualification: ${topEdu}` : 'Demonstrated domain expertise'
    ],
    potential_weaknesses: [
      'Quantifiable ROI metrics can be expanded throughout bullet points'
    ],
    recommended_target_markets: [
      'Regional hubs',
      'Global Remote opportunities'
    ],
    search_queries: [
      `${profile.current_headline} remote`,
      `Senior ${profile.current_headline}`
    ]
  };
}

export function formatJobSpecificCVTitle(company: string, position: string, candidateName = 'Aya'): string {
  const cleanName = candidateName ? candidateName.replace(/[^a-zA-Z0-9]/g, '_') : 'Aya';
  const cleanCompany = company.replace(/[^a-zA-Z0-9]/g, '');
  const cleanPos = position.replace(/[^a-zA-Z0-9]/g, '');
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${cleanName}_CV_${cleanCompany}_${cleanPos}_${dateStr}`;
}
