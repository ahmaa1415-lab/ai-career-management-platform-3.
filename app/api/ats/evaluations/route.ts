import { NextResponse } from 'next/server';
import { getCVEvaluations, getCVEvaluationById } from '@/lib/db';
import { getOrCreateDefaultUser } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req, { allowDefaultFallback: true });
    const user = authUser ? authUser : getOrCreateDefaultUser();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const compareA = searchParams.get('compareA');
    const compareB = searchParams.get('compareB');
    const resumeId = searchParams.get('resume_id');

    const headers = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' };

    if (id) {
      const evaluation = getCVEvaluationById(id);
      if (!evaluation) {
        return NextResponse.json({ error: 'Evaluation record not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, evaluation }, { headers });
    }

    if (compareA && compareB) {
      const evalA = getCVEvaluationById(compareA);
      const evalB = getCVEvaluationById(compareB);
      if (!evalA || !evalB) {
        return NextResponse.json({ error: 'One or both evaluation records not found for comparison' }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        comparison: {
          evalA,
          evalB,
          human_score_delta: Number((evalB.human_recruiter_score - evalA.human_recruiter_score).toFixed(1)),
          ats_score_delta: Number((evalB.ats_compatibility_score - evalA.ats_compatibility_score).toFixed(1)),
        }
      }, { headers });
    }

    const limit = parseInt(searchParams.get('limit') || '25', 10);
    const evaluations = getCVEvaluations(user.id, limit, resumeId || undefined);
    return NextResponse.json({ success: true, evaluations, count: evaluations.length }, { headers });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
