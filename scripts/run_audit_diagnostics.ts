import Database from 'better-sqlite3';
import { getAllVerifiedJobs } from '../lib/jobs/aggregator';
import { rankTopOpportunities } from '../lib/jobs/matcher';
import { getFullProfile } from '../lib/onboarding';

const db = new Database('data/career_app.db');

console.log('=== DATABASE AUDIT COUNTS ===');
const totalRows = db.prepare('SELECT count(id) as count FROM job_listings').get() as { count: number };
const verifiedRows = db.prepare("SELECT count(id) as count FROM job_listings WHERE is_verified = 1 AND verification_status = 'Verified Open'").get() as { count: number };
const unverifiedRows = db.prepare("SELECT count(id) as count FROM job_listings WHERE is_verified = 0 OR verification_status != 'Verified Open'").get() as { count: number };

console.log('Total in database table:', totalRows.count);
console.log('Verified Open in database table:', verifiedRows.count);
console.log('Unverified / Broken / Expired in database table:', unverifiedRows.count);

const unverifiedList = db.prepare("SELECT id, employer, title, source_url, verification_status, is_verified FROM job_listings WHERE is_verified = 0 OR verification_status != 'Verified Open'").all();
console.log('Unverified / Broken Details:', JSON.stringify(unverifiedList, null, 2));

console.log('\n=== GET ALL VERIFIED JOBS API FUNCTION CHECK ===');
const activeJobs = getAllVerifiedJobs();
console.log('Total jobs returned by getAllVerifiedJobs():', activeJobs.length);
const badInActive = activeJobs.filter(j => j.is_verified === 0 || j.verification_status !== 'Verified Open');
console.log('Any unverified in active feed?:', badInActive.length);

console.log('\n=== VERIFY MATCH SCORING USES ACTIVE CANDIDATE RESUME & REAL JOB DESCRIPTION ===');
const users = db.prepare('SELECT id, full_name, email FROM users ORDER BY created_at DESC LIMIT 3').all() as any[];
for (const u of users) {
  const candidate = getFullProfile(u.id);
  if (candidate && candidate.profile) {
    const topOpportunities = rankTopOpportunities(candidate, activeJobs.slice(0, 5));
    console.log(`Candidate: ${u.full_name} (${candidate.profile.headline})`);
    console.log(`Active Resume ID: ${candidate.master_cv?.id}`);
    console.log(`Top Matched Job: ${topOpportunities[0]?.job.title} at ${topOpportunities[0]?.job.employer}`);
    console.log(`Overall Match Score: ${topOpportunities[0]?.match.overall_score}`);
    console.log(`Match Breakdown:`, {
      experience_score: topOpportunities[0]?.match.dimensions.relevant_experience.score,
      skills_score: topOpportunities[0]?.match.dimensions.functional_skills.score,
      industry_score: topOpportunities[0]?.match.dimensions.industry_relevance.score
    });
  }
}
