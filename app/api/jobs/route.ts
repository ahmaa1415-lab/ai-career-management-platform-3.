import { NextResponse } from 'next/server';
import { getAllVerifiedJobs } from '@/lib/jobs/aggregator';
import { getFullProfile } from '@/lib/onboarding';
import { rankTopOpportunities } from '@/lib/jobs/matcher';
import { getAuthenticatedUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req, { allowDefaultFallback: false });
    const userId = authUser ? authUser.id : undefined;
    const { searchParams } = new URL(req.url);
    const topOnly = searchParams.get('top') === 'true';
    const resumeId = searchParams.get('resume_id') || undefined;
    const qualityFilter = searchParams.get('quality') as any || undefined;

    // Load candidate using strict authenticated user identity and specific active resume
    const candidate = userId ? getFullProfile(userId, resumeId) : null;

    // Determine target career domain dynamically from candidate's profile/resume
    let targetDomain: 'commercial' | 'technology' | 'finance' | 'all' = 'all';
    if (candidate && candidate.profile) {
      const headline = (candidate.profile.headline || '').toLowerCase();
      const skills = (candidate.profile.skills || []).join(' ').toLowerCase();

      if (/commercial|category|trade marketing|retail|fmcg|brand manager|shopper/i.test(headline) || /category management|trade marketing|planogram|jbp/i.test(skills)) {
        targetDomain = 'commercial';
      } else if (/software|cloud|developer|engineer|devops|full stack|backend|frontend|architect/i.test(headline) || /kubernetes|aws|docker|microservices|golang|python/i.test(skills)) {
        targetDomain = 'technology';
      } else if (/finance|audit|accounting|cpa|controller|valuation/i.test(headline) || /financial model|ifrs|internal audit/i.test(skills)) {
        targetDomain = 'finance';
      }
    }

    // Retrieve jobs filtered by data quality and candidate domain
    const jobs = getAllVerifiedJobs({
      qualityFilter,
      targetDomain: targetDomain !== 'all' ? targetDomain : undefined
    });

    const headers = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' };

    if (topOnly && candidate) {
      const top10 = rankTopOpportunities(candidate, jobs);
      return NextResponse.json({ opportunities: top10 }, { headers });
    }

    if (candidate) {
      const scoredJobs = jobs.map(job => {
        const top = rankTopOpportunities(candidate, [job])[0];
        return {
          ...job,
          match_score: top.match.overall_score,
          match_breakdown: top.match
        };
      });
      scoredJobs.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
      return NextResponse.json({ jobs: scoredJobs }, { headers });
    }

    return NextResponse.json({ jobs }, { headers });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
