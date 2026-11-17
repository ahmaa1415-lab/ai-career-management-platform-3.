import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { getFullProfile } from '@/lib/onboarding';
import { getVerifiedJobListings } from '@/lib/jobs/aggregator';
import { generateInterviewPreparationPackage, evaluateMockAnswer } from '@/lib/ai/interview-prep';

export async function GET(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    const user = authUser;
    const candidate = getFullProfile(user.id);
    if (!candidate) {
      return NextResponse.json({ error: 'Candidate profile not initialized' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('job_id');

    const jobs = getVerifiedJobListings();
    const targetJob = jobId
      ? jobs.find(j => j.id === jobId) || jobs[0]
      : jobs[0];

    if (!targetJob) {
      return NextResponse.json({ error: 'No job listings found for preparation' }, { status: 404 });
    }

    const packageData = generateInterviewPreparationPackage(candidate, targetJob);

    return NextResponse.json({
      success: true,
      data: packageData,
      available_jobs: jobs.map(j => ({ id: j.id, title: j.title, employer: j.employer, location: j.location }))
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    const user = authUser;
    const candidate = getFullProfile(user.id);
    if (!candidate) {
      return NextResponse.json({ error: 'Candidate profile not initialized' }, { status: 400 });
    }

    const body = await req.json();
    const action = body.action || 'generate';

    if (action === 'evaluate_answer') {
      const { question, user_answer } = body;
      if (!question || !user_answer) {
        return NextResponse.json({ error: 'Both question and user_answer are required' }, { status: 400 });
      }

      const evaluation = evaluateMockAnswer(question, user_answer);
      return NextResponse.json({
        success: true,
        evaluation
      });
    }

    if (action === 'generate') {
      const jobId = body.job_id;
      const jobs = getVerifiedJobListings();
      const targetJob = jobs.find(j => j.id === jobId) || jobs[0];

      const packageData = generateInterviewPreparationPackage(candidate, targetJob);
      return NextResponse.json({
        success: true,
        data: packageData
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
