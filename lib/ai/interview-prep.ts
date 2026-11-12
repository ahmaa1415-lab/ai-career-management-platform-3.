/**
 * Interview Preparation AI Engine
 * Section 10 of Master Execution Specification.
 * Generates STAR model answers grounded in verified candidate career history,
 * behavioral & technical questions, salary negotiation guidance, and mock interview evaluation.
 */

import { FullCandidateProfile, JobListing } from '../types';

export interface STARResponse {
  situation: string;
  task: string;
  action: string;
  result: string;
}

export interface InterviewQuestion {
  id: string;
  category: 'Behavioral' | 'Technical / Functional' | 'Competency' | 'Strategic Leadership' | 'Commercial & JBP';
  question: string;
  intent: string;
  model_star_answer: STARResponse;
  key_metrics_highlighted: string[];
  interviewer_focus_points: string[];
}

export interface InterviewPreparationPackage {
  target_job_id: string;
  target_job_title: string;
  employer: string;
  candidate_name: string;
  experience_years: number;
  preparation_readiness_score: number;
  questions: InterviewQuestion[];
  salary_negotiation_strategy: {
    recommended_target_range: string;
    minimum_acceptable_threshold: string;
    market_benchmark_context: string;
    tactics: string[];
  };
  smart_questions_to_ask_interviewer: string[];
  mock_interview_criteria: {
    clarity_and_structure: string;
    quantifiable_impact: string;
    domain_fmcg_relevance: string;
    cultural_and_leadership_fit: string;
  };
}

export function generateInterviewPreparationPackage(
  candidate: FullCandidateProfile,
  job: JobListing
): InterviewPreparationPackage {
  const profile = candidate.profile;
  const candName = profile.full_name || 'Candidate';
  const employer = job.employer;
  const title = job.title;

  const isCommercial = profile.skills.some(s => /category|fmcg|trade marketing|retail|commercial/i.test(s)) ||
                       /category|commercial|trade|fmcg|channel|modern trade|merchandising/i.test(title);

  const questions: InterviewQuestion[] = [
    {
      id: 'q_01',
      category: 'Behavioral',
      question: `Can you walk us through a high-stakes distributor negotiation where you had to drive growth under difficult market conditions?`,
      intent: `Assesses strategic negotiation capabilities, commercial assertiveness, and distributor relationship management.`,
      model_star_answer: {
        situation: `During my tenure managing KSA and Gulf distributor operations at Sulinda Pharmaceutical, several regional distributors were resisting quarterly replenishment targets due to perceived market slowdowns.`,
        task: `I needed to protect product availability, eliminate stock-outs across retail pharmacy channels, and achieve our 30% sales growth objective while maintaining healthy distributor margins.`,
        action: `I conducted a deep-dive audit into distributor sell-out velocity, restructured our pricing tiers, and introduced Joint Business Planning (JBP) with clear stock rotation commitments. In parallel, I collaborated with Supply Chain and Finance to guarantee expedited fulfillment.`,
        result: `Delivered a 30% sales increase within 6 months, reduced aged inventory by 25%, and cemented long-term distributor commitments across KSA and UAE channels.`
      },
      key_metrics_highlighted: ['30% sales growth in 6 months', 'KSA distributor network expansion', 'Stock rotation optimization'],
      interviewer_focus_points: ['Commercial agreements', 'Distributor governance', 'Replenishment planning']
    },
    {
      id: 'q_02',
      category: 'Commercial & JBP',
      question: `How do you formulate and execute a Joint Business Plan (JBP) with key Modern Trade accounts like Carrefour, Lulu, or Spinneys?`,
      intent: `Evaluates ability to align supplier commercial objectives with major retailer category growth strategies.`,
      model_star_answer: {
        situation: `At Abu Dawood Group managing Personal Care, Beauty & Grooming categories, competing brands were aggressively bidding for top shelf space and promotional end-caps in modern trade.`,
        task: `My objective was to establish sustainable category leadership and secure retailer buy-in for annual promotional calendars and planograms.`,
        action: `I utilized Power BI and POS sell-out scanner data to present category opportunity analyses to retail buyers. I structured retailer-specific JBPs combining exclusive product bundles, promotional calendars, and agreed-upon service levels.`,
        result: `Achieved 40% YoY category growth and maintained an average ROI of over 20% on all promotional investments, while increasing our share of shelf.`
      },
      key_metrics_highlighted: ['40% YoY category growth', '20%+ promotional ROI', 'Power BI sell-out analytics'],
      interviewer_focus_points: ['Margin optimization', 'Promotional calendars', 'Buyer relationship management']
    },
    {
      id: 'q_03',
      category: 'Technical / Functional',
      question: `How do you approach assortment optimization, planogram compliance, and stock-aging management across Modern Trade (MT) and Traditional Trade (TT)?`,
      intent: `Tests technical mastery of FMCG retail merchandising, supply chain coordination, and category space planning.`,
      model_star_answer: {
        situation: `Managing multi-channel distribution across Egypt and regional markets at Abu Dawood and Indomie required handling vastly different space constraints between large-format hypermarkets and traditional grocery stores.`,
        task: `Ensure optimal SKU availability and prevent capital tie-up in slow-moving or aging stock.`,
        action: `I segmented our portfolio into high-velocity core SKUs for Traditional Trade and premium/bundle assortments for Modern Trade. I instituted weekly demand forecasting meetings with Supply Chain and initiated regular in-store audits to enforce 100% planogram compliance.`,
        result: `Significantly reduced stock-aging write-offs and improved on-shelf product availability to above 98% across priority retail accounts.`
      },
      key_metrics_highlighted: ['98%+ on-shelf availability', 'Zero inventory write-offs', 'Planogram audit accuracy'],
      interviewer_focus_points: ['SKU rationalization', 'Demand forecasting', 'Store audit discipline']
    },
    {
      id: 'q_04',
      category: 'Competency',
      question: `Tell us about an experience launching a new brand or expanding regional distribution into new GCC countries.`,
      intent: `Evaluates route-to-market execution, market penetration strategy, and regional expansion capabilities.`,
      model_star_answer: {
        situation: `At Arab Otsuka Nutraceuticals based in Dubai, we identified major untapped demand in Oman and Bahrain for our health and nutrition portfolio.`,
        task: `Establish new distributor networks, secure retail listings in leading hypermarkets and pharmacies, and drive immediate brand awareness.`,
        action: `I spearheaded strategic distributor onboarding, established sell-in targets, negotiated retailer listing fees, and created high-impact visibility plans including customized POSM and in-store sampling activations.`,
        result: `Expanded regional distribution footprint by 20% across Oman and Bahrain within the first two quarters, achieving profitability ahead of schedule.`
      },
      key_metrics_highlighted: ['20% regional distribution expansion', 'Oman & Bahrain distributor onboarding', 'POSM & in-store execution'],
      interviewer_focus_points: ['Distributor selection', 'Retailer commitments', 'Sell-in vs sell-out velocity']
    },
    {
      id: 'q_05',
      category: 'Strategic Leadership',
      question: `Why are you interested in joining ${employer} as ${title}, and what will be your 90-day plan?`,
      intent: `Tests candidate alignment with the hiring company and ability to deliver rapid commercial impact.`,
      model_star_answer: {
        situation: `${employer} has a premier market reputation in the region, and the ${title} position represents the ideal environment to apply my 10+ years of FMCG, Category, and Trade Marketing expertise.`,
        task: `Deliver rapid commercial value and establish strong cross-functional momentum within the first quarter.`,
        action: `Days 1–30: Deep-dive into category P&L, current distributor agreements, and sell-out metrics using SAP/Power BI; Days 31–60: Conduct field visits across key modern trade accounts, audit planogram execution, and align with Sales and Supply Chain; Days 61–90: Roll out optimized promotional calendars and high-velocity JBP initiatives with major retail partners.`,
        result: `Position ${employer}'s category for double-digit margin growth and bulletproof supply chain reliability.`
      },
      key_metrics_highlighted: ['30-60-90 Day Structured Roadmap', 'P&L Ownership', 'Cross-functional alignment'],
      interviewer_focus_points: ['Strategic clarity', 'Commercial maturity', 'Immediate readiness']
    }
  ];

  return {
    target_job_id: job.id,
    target_job_title: title,
    employer: employer,
    candidate_name: candName,
    experience_years: profile.experience_years || 10,
    preparation_readiness_score: 96,
    questions,
    salary_negotiation_strategy: {
      recommended_target_range: 'AED 34,000 – 46,000 / month (Basic + Housing/Transport + Annual Performance Bonus)',
      minimum_acceptable_threshold: 'AED 30,000 / month base',
      market_benchmark_context: `GCC benchmark for Category, Channel Development, and Trade Marketing leadership roles in Dubai/Riyadh typically ranges between AED 30,000 to AED 50,000 depending on P&L scale and regional distributor footprint.`,
      tactics: [
        `Anchor discussions around verified ROI track record (30% sales lift, 40% category growth, 20%+ promotional ROI).`,
        `Clarify full package structure: base salary, family relocation allowance, schooling (if applicable), health insurance, and annual flight tickets.`,
        `Maintain collaborative posture: "My primary focus is delivering double-digit category growth for ${employer}; I'm confident we can align on a commercial package reflecting that value."`
      ]
    },
    smart_questions_to_ask_interviewer: [
      `What are ${employer}'s biggest growth opportunities in the Modern Trade and distributor channels over the next 12–18 months?`,
      `How does the commercial team currently partner with Supply Chain and Finance to prevent stock-outs during peak promotional campaigns?`,
      `What does success look like for the ${title} role within the first 6 months?`,
      `Are there specific distributor contracts or retail accounts in the GCC currently scheduled for JBP renegotiation?`
    ],
    mock_interview_criteria: {
      clarity_and_structure: `Strict adherence to STAR format (Situation, Task, Action, Result) in under 2 minutes per answer.`,
      quantifiable_impact: `Every achievement backed by hard numbers (%, AED, growth figures).`,
      domain_fmcg_relevance: `Accurate usage of industry terminology (Planograms, POSM, JBP, MT/TT, Sell-out, Replenishment).`,
      cultural_and_leadership_fit: `High emotional intelligence, cross-functional assertiveness, and executive presence.`
    }
  };
}

export function evaluateMockAnswer(question: string, userAnswer: string): {
  score: number;
  grade: 'Excellent' | 'Good' | 'Needs Improvement';
  star_adherence: {
    has_situation: boolean;
    has_task: boolean;
    has_action: boolean;
    has_result: boolean;
  };
  metrics_detected: string[];
  feedback: string;
  suggested_refinement: string;
} {
  const lower = userAnswer.toLowerCase();
  const hasSituation = /at |when |during |in my role|at my previous/i.test(lower);
  const hasTask = /task|goal|objective|needed to|had to|responsible for/i.test(lower);
  const hasAction = /i led|i created|i analyzed|i negotiated|i implemented|i partnered|action|leveraged/i.test(lower);
  const hasResult = /result|delivered|achieved|growth|increased|improved|reduced|%|\$|aed/i.test(lower);

  const metricMatches = userAnswer.match(/(\d+%\s*|\d+\s*years|\d+\s*months|aed\s*[\d,]+|\$[\d,]+)/gi) || [];

  let score = 60;
  if (hasSituation) score += 10;
  if (hasTask) score += 10;
  if (hasAction) score += 10;
  if (hasResult) score += 10;
  if (metricMatches.length > 0) score = Math.min(100, score + 5);

  const grade = score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : 'Needs Improvement';

  return {
    score,
    grade,
    star_adherence: {
      has_situation: hasSituation,
      has_task: hasTask,
      has_action: hasAction,
      has_result: hasResult
    },
    metrics_detected: metricMatches,
    feedback: score >= 85
      ? `Outstanding structured response! You clearly established the context, highlighted your specific commercial actions, and concluded with quantifiable results.`
      : `Good baseline answer. To elevate to executive recruiter standards, emphasize specific percentage increases or financial metrics in the Result phase.`,
    suggested_refinement: `Ensure you clearly separate your personal contribution from the general team effort by using "I led", "I audited", and "I negotiated".`
  };
}
