import { NextResponse } from 'next/server';
import {
  getLinkedInRecruiterActivity,
  getLinkedInCompanyUpdates,
  getLinkedInIndustryInsights,
  searchLinkedInIntelligence
} from '@/lib/linkedin/intelligence';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');
    const type = searchParams.get('type'); // 'recruiters', 'companies', 'insights', or all
    const company = searchParams.get('company') || undefined;
    const location = searchParams.get('location') || undefined;
    const topic = searchParams.get('topic') || undefined;

    if (query) {
      const searchResults = searchLinkedInIntelligence(query);
      return NextResponse.json(searchResults);
    }

    const recruiters = (!type || type === 'recruiters')
      ? getLinkedInRecruiterActivity({ company, location })
      : [];

    const companies = (!type || type === 'companies')
      ? getLinkedInCompanyUpdates({ company })
      : [];

    const insights = (!type || type === 'insights')
      ? getLinkedInIndustryInsights({ topic })
      : [];

    return NextResponse.json({
      recruiters,
      companies,
      insights,
      total_count: recruiters.length + companies.length + insights.length
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
