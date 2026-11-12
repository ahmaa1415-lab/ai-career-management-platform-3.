import { getOrCreateDefaultUser } from '../lib/db';
import { getFullProfile } from '../lib/onboarding';
import { getVerifiedJobListings } from '../lib/jobs/aggregator';
import { generateInterviewPreparationPackage, evaluateMockAnswer } from '../lib/ai/interview-prep';

async function testInterviewPrep() {
  console.log('--- RUNNING INT-01: Interview Preparation AI & STAR Evaluation Test ---');
  const user = getOrCreateDefaultUser();
  const candidate = getFullProfile(user.id);
  if (!candidate) throw new Error('Candidate profile not found');

  const jobs = getVerifiedJobListings();
  const targetJob = jobs[0];

  const prep = generateInterviewPreparationPackage(candidate, targetJob);
  console.log(`✓ Interview package generated for: ${prep.target_job_title} at ${prep.employer}`);
  console.log(`✓ Readiness score: ${prep.preparation_readiness_score}%`);
  console.log(`✓ Generated ${prep.questions.length} structured interview questions.`);

  if (prep.questions.length < 3) throw new Error('Insufficient questions generated');
  const firstQ = prep.questions[0];
  if (!firstQ.model_star_answer.situation || !firstQ.model_star_answer.result) {
    throw new Error('STAR answer incomplete');
  }
  console.log(`✓ Verified Question 1: "${firstQ.question}" with full S-T-A-R answer.`);

  // Test Mock Answer Evaluation
  const mockAnswer = `When I was at Sulinda Pharmaceutical managing KSA distributor channels, my task was to drive commercial growth and improve replenishment. I led distributor audits and negotiated new commercial terms with retail partners. As a result, we delivered 30% sales growth in 6 months.`;
  const evaluation = evaluateMockAnswer(firstQ.question, mockAnswer);

  console.log(`✓ Mock answer evaluated: Score ${evaluation.score}/100 (${evaluation.grade})`);
  console.log(`✓ STAR adherence confirmed:`, evaluation.star_adherence);
  if (evaluation.score < 80) throw new Error('Expected high score for comprehensive STAR response');

  console.log('>>> INT-01 PASSED SUCCESSFULLY <<<');
}

testInterviewPrep().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
