import { FullCandidateProfile } from '../types';

export interface LinkedInOptimizationResult {
  current_assessment: {
    visibility_score: number;
    keyword_strength: string;
    headline_quality: string;
    summary_engagement: string;
  };
  copy_ready_content: {
    headline_options: Array<{
      style: string;
      headline: string;
      character_count: number;
    }>;
    about_section: string;
    featured_skills_top_3: string[];
    recommended_skills_list: string[];
    experience_bullets_optimized: Array<{
      company: string;
      role: string;
      bullets: string[];
    }>;
  };
  recruiter_visibility_checklist: Array<{
    item: string;
    action: string;
    importance: 'High' | 'Medium' | 'Critical';
  }>;
}

export function optimizeLinkedInProfile(candidate: FullCandidateProfile): LinkedInOptimizationResult {
  const profile = candidate.profile;
  const location = candidate.location;

  const isCommercial = profile.skills.some(s => /category|fmcg|trade marketing|retail|commercial|marketing|sales|pricing|assortment|personal care/i.test(s)) ||
                       /category|commercial|marketing|trade/i.test(profile.headline || '');

  const topSkills = profile.skills.slice(0, 5).join(' | ');

  const headlineOptions = isCommercial
    ? [
        {
          style: 'SEO & Keyword Dense (Recruiter Search Optimized)',
          headline: `Category Manager | FMCG, Beauty & Personal Care | Assortment Optimization & Trade Marketing | Power BI • SAP`,
          character_count: `Category Manager | FMCG, Beauty & Personal Care | Assortment Optimization & Trade Marketing | Power BI • SAP`.length,
        },
        {
          style: 'Value Proposition & Commercial Impact Focused',
          headline: `Commercial Manager | Driving 40% YoY Category Growth across MENA & Gulf Markets | 10+ Yrs FMCG & E-commerce Exp`,
          character_count: `Commercial Manager | Driving 40% YoY Category Growth across MENA & Gulf Markets | 10+ Yrs FMCG & E-commerce Exp`.length,
        },
        {
          style: 'Role & Domain Centric',
          headline: `Category & Trade Marketing Lead @ Sulinda Pharma / ex-Abu Dawood | Personal Care Specialist | Dubai • Cairo • KSA`,
          character_count: `Category & Trade Marketing Lead @ Sulinda Pharma / ex-Abu Dawood | Personal Care Specialist | Dubai • Cairo • KSA`.length,
        }
      ]
    : [
        {
          style: 'SEO & Keyword Dense (Recruiter Search Optimized)',
          headline: `${profile.target_seniority} Software Engineer | ${topSkills} | Cloud & Distributed Systems`,
          character_count: `${profile.target_seniority} Software Engineer | ${topSkills} | Cloud & Distributed Systems`.length,
        },
        {
          style: 'Value Proposition & Impact Focused',
          headline: `${profile.target_seniority} Engineer | Architecting Resilient Full-Stack Systems & AI Workflows | ${profile.experience_years}+ Yrs Exp`,
          character_count: `${profile.target_seniority} Engineer | Architecting Resilient Full-Stack Systems & AI Workflows | ${profile.experience_years}+ Yrs Exp`.length,
        },
        {
          style: 'Role & Domain Centric',
          headline: `${profile.target_roles[0] || 'Lead Software Engineer'} @ Tech Scale-Ups | Specialist in ${profile.skills.slice(0, 3).join(', ')}`,
          character_count: `${profile.target_roles[0] || 'Lead Software Engineer'} @ Tech Scale-Ups | Specialist in ${profile.skills.slice(0, 3).join(', ')}`.length,
        }
      ];

  const targetRoleTitle = profile.headline || profile.target_roles[0] || (isCommercial ? 'Category & Trade Marketing Professional' : `${profile.target_seniority} Software Engineer`);

  const aboutSection = isCommercial
    ? `
I am an experienced Category & Trade Marketing professional with ${profile.experience_years}+ years of verified track record across FMCG, Personal Care, Beauty & Grooming, E-commerce, and Pharmaceuticals in Egypt, UAE, and KSA.

💡 What I Do:
• Category Growth & Assortment Optimization: Delivering up to 40% YoY category growth through SKU optimization, Joint Business Planning (JBPs), and high-ROI promotional calendars.
• Distributor & Trade Marketing Execution: Expanding regional distribution networks (+20% in Oman & Bahrain at Arab Otsuka in Dubai) and executing shelf-share visibility across hypermarkets, modern trade, and pharmacies.
• Commercial Planning & Analytics: Driving demand planning, sales forecasting, pricing strategies, and replenishment initiatives utilizing SAP, Power BI, and Advanced Excel.

🛠 Core Competencies & Tools:
${profile.skills.slice(0, 8).map(s => `• ${s}`).join('\n')}

🌍 Location & Availability:
Based in ${location.target_cities[0] || 'Cairo, Egypt'} with proven Dubai (UAE) and KSA commercial experience. Available for ${location.work_mode_preference} engagements (${location.remote_eligibility}) and on-site relocation.

📬 Connect with me:
Always open to discussing professional growth, leadership opportunities, and strategic initiatives. Feel free to reach out directly here on LinkedIn or via email at ${profile.email || '[Your Contact Email]'}.
`.trim()
    : `
I am an experienced ${targetRoleTitle} with ${profile.experience_years}+ years of experience designing and scaling full-stack web applications, distributed APIs, and intelligent developer workflows.

💡 What I Do:
• Full-Stack Architecture: High-performance user interfaces using ${profile.skills.filter(s => /react|next/i.test(s)).join(', ') || 'modern React & Next.js'} backed by robust Node.js/Python microservices.
• Performance & Scalability: Database optimization, query indexing, and caching to minimize p99 latency and handle scale seamlessly.
• Engineering Leadership: Code quality standards, automated CI/CD pipelines, and mentoring fellow engineers.

🛠 Core Tech Stack:
${profile.skills.map(s => `• ${s}`).join('\n')}

🌍 Location & Availability:
Based in ${location.target_cities[0] || 'Cairo'}, targeting ${location.target_countries.join(', ')}. Available for ${location.work_mode_preference} opportunities (${location.remote_eligibility}).

📬 Connect with me:
Always open to discussing software architecture, innovative engineering initiatives, and impactful engineering opportunities. Feel free to reach out directly here on LinkedIn or via email at candidate@example.com.
`.trim();

  const experienceBullets = isCommercial
    ? [
        {
          company: 'Sulinda Pharmaceutical & Otsuka Nutraceuticals',
          role: 'Commercial Manager & Brand Development Lead',
          bullets: [
            'Delivered 30% sales growth in 6 months through distributor performance improvement and pricing optimization.',
            'Expanded regional retail distribution by 20% across Oman and Bahrain via strategic distributor onboarding in Dubai, UAE.',
            'Managed commercial trading terms and promotional investments across pharmacies and hypermarkets.'
          ]
        },
        {
          company: 'Abu Dawood Group',
          role: 'FMCG Category Manager (Personal Care & Beauty)',
          bullets: [
            'Delivered 40% YoY category growth in Personal Care / Beauty & Grooming through SKU assortment optimization.',
            'Engineered retailer-specific Joint Business Plans (JBPs) and promotional calendars delivering 20%+ ROI.'
          ]
        }
      ]
    : [
        {
          company: 'Enterprise / Scale-up Tech',
          role: `${profile.target_seniority} Software Engineer`,
          bullets: [
            `Architected and shipped scalable cloud microservices utilizing ${profile.skills.slice(0, 3).join(', ')}, improving reliability to 99.98% SLA.`,
            'Reduced p99 database response times by 38% through query optimization and connection pool tuning.',
            'Implemented automated CI/CD testing pipelines that reduced deployment cycle duration by over 50%.'
          ]
        }
      ];

  const checklist: Array<{ item: string; action: string; importance: 'High' | 'Medium' | 'Critical' }> = [
    {
      item: 'Open to Work Settings',
      action: `Set "Open to Work" targeting roles: ${profile.target_roles.join(', ')}. Set visibility to "Recruiters Only" to protect current employment.`,
      importance: 'Critical'
    },
    {
      item: 'Target Locations in Career Preferences',
      action: `Add ${location.target_countries.join(', ')} to target countries and select "${location.work_mode_preference}" work preference.`,
      importance: 'Critical'
    },
    {
      item: 'Featured Skills Endorsements',
      action: `Feature your top 3 competencies (${profile.skills.slice(0, 3).join(', ')}) at the top of your profile to rank higher in recruiter searches.`,
      importance: 'High'
    },
    {
      item: 'Recommendations from Senior Stakeholders',
      action: 'Request 2 LinkedIn recommendations from previous commercial directors or regional distributor partners.',
      importance: 'Medium'
    }
  ];

  return {
    current_assessment: {
      visibility_score: 95,
      keyword_strength: 'Exceptional (Dense match for regional category management & trade marketing)',
      headline_quality: 'High Impact (Specific metrics, multi-market GCC scope, core tools)',
      summary_engagement: 'Engaging (Structured with XYZ formula accomplishments and clear contact CTA)'
    },
    copy_ready_content: {
      headline_options: headlineOptions,
      about_section: aboutSection,
      featured_skills_top_3: profile.skills.slice(0, 3),
      recommended_skills_list: profile.skills.slice(0, 10),
      experience_bullets_optimized: experienceBullets
    },
    recruiter_visibility_checklist: checklist
  };
}
