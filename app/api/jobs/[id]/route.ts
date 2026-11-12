import { NextResponse } from 'next/server';
import { getJobById } from '@/lib/jobs/aggregator';
import { getFullProfile } from '@/lib/onboarding';
import { evaluateJobFit } from '@/lib/jobs/matcher';
import { evaluateATSKeywords } from '@/lib/ai/ats-analyzer';
import { verifyJobListing } from '@/lib/jobs/verifier';

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const job = getJobById(id);
    if (!job) {
      return NextResponse.json({ error: 'Job listing not found' }, { status: 404 });
    }

    const candidate = getFullProfile();
    const verification = verifyJobListing(job);

    let jobFit = null;
    let atsKeywords = null;

    if (candidate) {
      jobFit = evaluateJobFit(candidate, job);
      const cvText = candidate.master_cv?.raw_text || candidate.profile.summary || '';
      atsKeywords = evaluateATSKeywords(cvText, job.requirements || []);
    }

    return NextResponse.json({
      job,
      verification,
      jobFit,
      atsKeywords
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
