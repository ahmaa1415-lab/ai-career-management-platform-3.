import { spawn, spawnSync, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const testSuites = [
  'tests/db.test.ts',
  'tests/onboarding_gate.test.ts',
  'tests/ats_analyzer.test.ts',
  'tests/matcher.test.ts',
  'tests/cv_first_workflow.test.ts',
  'tests/workflow_crm_email.test.ts',
  'tests/security.test.ts',
  'tests/chatbot_guide.test.ts',
  'tests/linkedin_integration.test.ts',
  'tests/company_portal_accounts.test.ts',
  'tests/autonomous_auto_apply.test.ts',
  'tests/linkedin_post_parser.test.ts',
  'tests/real_resume_aya_hamouda.test.ts',
  'tests/portal_integrations.test.ts',
  'tests/interview_prep.test.ts',
  'tests/agents_orchestrator.test.ts',
  'tests/notifications.test.ts',
  'tests/job_intelligence_scenarios.test.ts',
  'tests/global_hr_recruitment_intelligence.test.ts',
  'tests/resume_versioning_and_isolation.test.ts',
  'tests/auth_and_integrations.test.ts',
  'tests/api_comprehensive.test.ts',
  'tests/ui_pages_browser.test.ts',
  'tests/ten_modules_verification.test.ts',
  'tests/upload_sync_acceptance.test.ts',
  'tests/three_users_dynamic_isolation.test.ts'
];

const httpSuites = new Set([
  'tests/chatbot_guide.test.ts',
  'tests/api_comprehensive.test.ts',
  'tests/ui_pages_browser.test.ts'
]);

console.log('===============================================================');
console.log('   AI CAREER MANAGEMENT & JOB SEARCH APPLICATION - TEST SUITE   ');
console.log('===============================================================\n');

const testPort = process.env.TEST_PORT || '3005';
const isWin = process.platform === 'win32';
const testDataDir = path.join(process.cwd(), 'data', 'test_integration');
if (!fs.existsSync(testDataDir)) fs.mkdirSync(testDataDir, { recursive: true });

const testDbPath = path.join(testDataDir, 'test_app.db');
const testUploadsDir = path.join(testDataDir, 'uploads');
if (!fs.existsSync(testUploadsDir)) fs.mkdirSync(testUploadsDir, { recursive: true });

async function isServerAlive(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/public-health`, { signal: AbortSignal.timeout(10000) });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function prepareIsolatedTestDb() {
  process.env.DATABASE_PATH = testDbPath;
  process.env.UPLOADS_DIR = testUploadsDir;

  const dbModule = await import('../lib/db.ts');
  const db = dbModule.default;
  dbModule.initializeSchema();
  const { getOrCreateDefaultUser } = dbModule;
  const defaultUser = getOrCreateDefaultUser();

  const { ensureDefaultUserCredentials } = await import('../lib/auth.ts');
  ensureDefaultUserCredentials();

  const { initializeRecruitmentInbox } = await import('../lib/email/inbox.ts');
  initializeRecruitmentInbox(defaultUser.id);
  db.prepare('UPDATE emails SET user_id = ? WHERE user_id IS NULL').run(defaultUser.id);

  const { syncAndDeduplicateJobs } = await import('../lib/jobs/aggregator.ts');
  syncAndDeduplicateJobs();

  const { updateLinkedInIntegration } = await import('../lib/integrations.ts');
  updateLinkedInIntegration(defaultUser.id, {
    profile_url: 'https://linkedin.com/in/aya-senior-fullstack-engineer',
    client_id: 'li_client_test_id',
    client_secret: 'oauth_token_verified_prod_secret',
    status: 'Connected',
    sync_enabled: 1
  });

  const { saveOnboarding } = await import('../lib/onboarding.ts');
  saveOnboarding(defaultUser.id, {
    profile: {
      headline: 'Lead Full Stack & AI Systems Engineer',
      summary: 'Senior software engineering professional with 8+ years experience.',
      current_status: 'Employed',
      experience_years: 8,
      skills: ['TypeScript', 'Next.js', 'React', 'Node.js', 'Python', 'SQL'],
      languages: ['English', 'Arabic'],
      target_roles: ['Lead Full Stack Engineer', 'Senior Software Engineer'],
      target_industries: ['Fintech', 'Enterprise SaaS'],
      target_seniority: 'Senior / Lead',
      salary_expectation_currency: 'EUR',
      salary_expectation_min: 80000,
      salary_expectation_max: 110000,
      work_modes: ['Remote', 'Hybrid']
    },
    location: {
      target_countries: ['Germany', 'UAE', 'Remote'],
      open_to_relocation: 1,
      current_location: 'Cairo, Egypt'
    },
    permissions: {
      job_research_authorized: 1,
      cv_analysis_authorized: 1,
      read_emails_authorized: 1,
      draft_emails_authorized: 1,
      disclose_data_authorized: 1,
      scheduled_automation_desired: 1
    }
  });

  db.prepare(`
    INSERT INTO job_listings (
      id, employer, title, location, source, source_url, publication_date,
      requirements, is_verified, company_portal_url, portal_platform, application_type, raw_description,
      authenticity_status
    ) VALUES (
      'job_de_09', 'Klarna', 'Senior Software Engineer (Backend)', 'Berlin, Germany', 'LinkedIn Jobs',
      'https://klarna.wd3.myworkdayjobs.com/Klarna_Careers/job/senior-backend', '2026-11-01',
      '["TypeScript", "Node.js", "PostgreSQL", "Distributed Systems"]', 1,
      'https://klarna.wd3.myworkdayjobs.com/Klarna_Careers', 'Workday', 'company_site_account',
      'Klarna is hiring a Senior Software Engineer via Workday portal.', 'VERIFIED_OPEN'
    ) ON CONFLICT(id) DO UPDATE SET
      company_portal_url = excluded.company_portal_url,
      portal_platform = excluded.portal_platform,
      application_type = excluded.application_type,
      authenticity_status = 'VERIFIED_OPEN'
  `).run();

  db.prepare(`
    INSERT INTO job_listings (
      id, employer, title, location, source, source_url, publication_date,
      salary_raw, requirements, experience_required_years, seniority, visa_sponsorship,
      remote_eligibility, is_verified, raw_description, application_type, portal_platform,
      authenticity_status
    ) VALUES (
      'post_li_ourshopee_02',
      'Ourshopee',
      'Category Manager - Beauty, Cosmetics & Health (LinkedIn Recruiter Post)',
      'Dubai, UAE',
      'LinkedIn Post',
      'https://www.linkedin.com/posts/ourshopee-dubai-category-manager',
      '2026-11-06',
      'Competitive UAE Package (Direct HR: mansi.deo@ourshopee.com)',
      '["Category Management", "Beauty", "Cosmetics", "Health", "5+ years experience", "UAE experience mandatory"]',
      5,
      'Senior',
      'Yes',
      'Onsite',
      1,
      'We are hiring a Category Manager for Beauty, Cosmetics & Health. UAE experience mandatory. Email: mansi.deo@ourshopee.com',
      'recruiter_post',
      'Direct Email',
      'VERIFIED_OPEN'
    ) ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      authenticity_status = 'VERIFIED_OPEN'
  `).run();
}

let serverProcess: any = null;
let activeBaseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';

function stopTestServer() {
  if (serverProcess) {
    console.log('\n[RUN_ALL] Stopping background test server...');
    try {
      if (isWin) {
        execSync(`taskkill /pid ${serverProcess.pid} /T /F`, { stdio: 'ignore' });
      } else {
        serverProcess.kill('SIGTERM');
      }
    } catch {}
    serverProcess = null;
    console.log('[RUN_ALL] Background test server stopped.');
  }
}

process.on('SIGINT', () => { stopTestServer(); process.exit(130); });
process.on('SIGTERM', () => { stopTestServer(); process.exit(143); });
process.on('exit', () => { stopTestServer(); });

async function ensureServerRunning() {
  if (await isServerAlive(activeBaseUrl)) {
    console.log(`[RUN_ALL] Using active server at ${activeBaseUrl}`);
    return;
  }
  const fallbackUrl = `http://localhost:${testPort}`;
  if (await isServerAlive(fallbackUrl)) {
    activeBaseUrl = fallbackUrl;
    console.log(`[RUN_ALL] Using active server at ${activeBaseUrl}`);
    return;
  }

  console.log(`[RUN_ALL] No active HTTP server detected. Initializing isolated Next.js server on ${fallbackUrl}...`);
  await prepareIsolatedTestDb();

  const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
  serverProcess = spawn(process.execPath, [nextBin, 'start', '-p', testPort, '-H', '0.0.0.0'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: testPort,
      DATABASE_PATH: testDbPath,
      UPLOADS_DIR: testUploadsDir,
      NODE_ENV: 'production'
    }
  });

  serverProcess.stdout.on('data', (d: Buffer) => {
    process.stdout.write(`[SERVER stdout] ${d.toString()}`);
  });
  serverProcess.stderr.on('data', (d: Buffer) => {
    process.stderr.write(`[SERVER stderr] ${d.toString()}`);
  });

  const pollStart = Date.now();
  const maxWait = 90000;
  let ready = false;
  while (Date.now() - pollStart < maxWait) {
    if (await isServerAlive(fallbackUrl)) {
      ready = true;
      break;
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  if (!ready) {
    console.error('[RUN_ALL ERROR] Failed to start test server within 90 seconds.');
    stopTestServer();
    process.exit(1);
  }

  activeBaseUrl = fallbackUrl;
  console.log(`[RUN_ALL] Isolated test server ready at ${activeBaseUrl} (${Math.round((Date.now() - pollStart)/1000)}s).\n`);
}

async function runAllSuites() {
  await ensureServerRunning();

  let allPassed = true;
  const results: Array<{ suite: string; status: 'PASSED' | 'FAILED' }> = [];
  const tsxCli = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');

  try {
    for (const suite of testSuites) {
      console.log(`\n>>> EXECUTING: ${suite}`);
      const isHttp = httpSuites.has(suite);
      const childEnv = isHttp
        ? {
            ...process.env,
            TEST_BASE_URL: activeBaseUrl,
            DATABASE_PATH: testDbPath,
            UPLOADS_DIR: testUploadsDir
          }
        : {
            ...process.env,
            TEST_BASE_URL: activeBaseUrl
          };

      const res = spawnSync(process.execPath, [tsxCli, suite], {
        stdio: 'inherit',
        env: childEnv
      });

      if (res.status === 0) {
        results.push({ suite, status: 'PASSED' });
      } else {
        console.error(`FAILED: ${suite} (exit code ${res.status})`);
        results.push({ suite, status: 'FAILED' });
        allPassed = false;
      }
    }
  } finally {
    stopTestServer();
  }

  console.log('\n===============================================================');
  console.log('                     FINAL TEST SUMMARY                        ');
  console.log('===============================================================');
  results.forEach(r => {
    console.log(`[${r.status === 'PASSED' ? '✓ PASS' : '✗ FAIL'}] ${r.suite}`);
  });
  console.log('===============================================================');

  if (!allPassed) {
    console.error('\nONE OR MORE TEST SUITES FAILED!');
    process.exit(1);
  } else {
    console.log(`\nALL ${testSuites.length} CORE TEST SUITES PASSED VERIFICATION WITH 0 DEFECTS!`);
    process.exit(0);
  }
}

runAllSuites().catch(err => {
  console.error('[RUN_ALL FATAL ERROR]', err);
  stopTestServer();
  process.exit(1);
});
