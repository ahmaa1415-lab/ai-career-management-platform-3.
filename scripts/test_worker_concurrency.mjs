import { BackgroundWorkerManager } from './background_worker.mjs';
import path from 'path';
import fs from 'fs';

async function testWorkerConcurrency() {
  console.log('=== [BACKGROUND WORKER CONCURRENCY & LEASE TEST] ===\n');

  const testDbDir = path.join(process.cwd(), 'data', 'staging_worker_test');
  const testDbPath = path.join(testDbDir, 'worker_test.db');

  if (fs.existsSync(testDbDir)) {
    fs.rmSync(testDbDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDbDir, { recursive: true });

  const workerManager1 = new BackgroundWorkerManager(testDbPath);
  const workerManager2 = new BackgroundWorkerManager(testDbPath);

  const jobName = 'nightly_job_refresh';
  const worker1Id = 'instance_pod_alpha_pid101';
  const worker2Id = 'instance_pod_beta_pid202';

  console.log(`1. Worker 1 (${worker1Id}) attempting to acquire lease on "${jobName}"...`);
  const acquired1 = workerManager1.acquireLock(jobName, 60000, worker1Id);
  console.log(`   - Worker 1 Lease Acquired: ${acquired1} (EXPECTED: true)`);

  console.log(`\n2. Worker 2 (${worker2Id}) attempting to acquire same lease while Worker 1 is running...`);
  const acquired2 = workerManager2.acquireLock(jobName, 60000, worker2Id);
  console.log(`   - Worker 2 Lease Acquired: ${acquired2} (EXPECTED: false - Duplicate execution blocked)`);

  console.log(`\n3. Worker 1 completes job and releases lease...`);
  workerManager1.releaseLock(jobName, worker1Id);
  console.log(`   - Worker 1 Lock Released.`);

  console.log(`\n4. Worker 2 retries acquisition after release...`);
  const acquired3 = workerManager2.acquireLock(jobName, 60000, worker2Id);
  console.log(`   - Worker 2 Lease Acquired: ${acquired3} (EXPECTED: true - Available after release)`);

  workerManager2.releaseLock(jobName, worker2Id);
  workerManager1.close();
  workerManager2.close();

  fs.rmSync(testDbDir, { recursive: true, force: true });

  const passed = acquired1 === true && acquired2 === false && acquired3 === true;
  console.log(`\n=== [WORKER LEASE TEST RESULT: ${passed ? 'PASSED ALL CHECKS' : 'FAILED'}] ===`);
  if (!passed) process.exit(1);
}

testWorkerConcurrency().catch(err => {
  console.error(err);
  process.exit(1);
});
