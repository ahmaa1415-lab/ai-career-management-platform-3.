import Database from 'better-sqlite3';
import { remediateAllJobs } from './remediate_all_jobs';

const db = new Database('data/career_app.db');

export async function runScheduledVerificationJob() {
  const startedAt = new Date().toISOString();
  console.log(`[VERIFICATION_SCHEDULER] Starting background job verification at ${startedAt}...`);

  try {
    await remediateAllJobs();

    const countStats = db.prepare(`
      SELECT authenticity_status, COUNT(*) as count
      FROM job_listings
      GROUP BY authenticity_status
    `).all();

    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, details, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      `audit_job_verify_${Date.now()}`,
      'system',
      'SCHEDULED_JOB_VERIFICATION_COMPLETED',
      JSON.stringify({ startedAt, completedAt: new Date().toISOString(), stats: countStats }),
      new Date().toISOString()
    );

    console.log(`[VERIFICATION_SCHEDULER] Job verification completed successfully.`);
  } catch (err: any) {
    console.error(`[VERIFICATION_SCHEDULER] Job verification failed:`, err);
  }
}

// If executed directly
if (require.main === module || process.argv[1]?.endsWith('run_verification_scheduler.ts')) {
  runScheduledVerificationJob();
}
