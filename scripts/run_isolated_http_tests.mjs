import { spawn, spawnSync, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

console.log('================================================================');
console.log('--- ISOLATED HTTP INTEGRATION TEST HARNESS (PORT 3005) ---');
console.log('================================================================\n');

const testPort = process.env.TEST_PORT || '3005';
const testHost = 'localhost';
const testBaseUrl = `http://localhost:${testPort}`;
const isWin = process.platform === 'win32';

// 1. Isolate test database & assets
const testDataDir = path.join(process.cwd(), 'data', 'test_integration');
if (!fs.existsSync(testDataDir)) fs.mkdirSync(testDataDir, { recursive: true });

const testDbPath = path.join(testDataDir, 'test_app.db');
const testUploadsDir = path.join(testDataDir, 'uploads');
if (!fs.existsSync(testUploadsDir)) fs.mkdirSync(testUploadsDir, { recursive: true });

console.log(`[HARNESS] Environment Isolation:`);
console.log(` - Port:          ${testPort}`);
console.log(` - Host:          ${testHost}`);
console.log(` - Base URL:      ${testBaseUrl}`);
console.log(` - Test Database: ${testDbPath}`);
console.log(` - Uploads Dir:   ${testUploadsDir}\n`);

// Initialize isolated test database if fresh
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

// Seed required test vacancies into isolated database
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

// Seed Ourshopee listing
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

console.log('✓ Isolated database initialized and seeded successfully.\n');

// 2. Check if a server is already alive
let serverProcess = null;
async function isServerAlive(url) {
  try {
    const res = await fetch(`${url}/api/public-health`, { signal: AbortSignal.timeout(4000) });
    return res.status === 200;
  } catch {
    return false;
  }
}

let activeBaseUrl = testBaseUrl;
if (await isServerAlive('http://localhost:3000')) {
  console.log('[HARNESS] Detected active server on http://localhost:3000. Reusing existing server.');
  activeBaseUrl = 'http://localhost:3000';
} else if (await isServerAlive(testBaseUrl)) {
  console.log(`[HARNESS] Detected active server on ${testBaseUrl}. Reusing existing server.`);
} else {
  console.log(`[HARNESS] Starting isolated Next.js production server on ${testBaseUrl}...`);
  const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');

  let readySignalReceived = false;

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

  serverProcess.stdout.on('data', (d) => {
    process.stdout.write(`[NEXT stdout] ${d.toString()}`);
  });

  serverProcess.stderr.on('data', (d) => {
    process.stderr.write(`[NEXT stderr] ${d.toString()}`);
  });

  console.log(`[HARNESS] Next.js server spawned with PID: ${serverProcess.pid}. Polling readiness...`);

  // Poll until ready
  const maxWait = 45000;
  const pollStart = Date.now();
  let ready = false;
  while (Date.now() - pollStart < maxWait) {
    try {
      const res = await fetch(`${testBaseUrl}/api/public-health`, { signal: AbortSignal.timeout(2000) });
      if (res.status === 200) {
        ready = true;
        break;
      } else {
        console.log(`[HARNESS] Poll returned status: ${res.status}`);
      }
    } catch (err) {
      // Log connection poll error
      // console.log(`[HARNESS] Poll attempt failed: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  if (!ready) {
    console.error('[HARNESS ERROR] Server failed to become ready within timeout.');
    if (serverProcess) {
      if (isWin) {
        try { execSync(`taskkill /pid ${serverProcess.pid} /T /F`, { stdio: 'ignore' }); } catch {}
      } else {
        serverProcess.kill('SIGTERM');
      }
    }
    process.exit(1);
  }
  console.log(`[HARNESS] Server is READY at ${testBaseUrl} (${Math.round((Date.now() - pollStart)/1000)}s)!\n`);
}

// 3. Run the 3 integration test suites
const httpSuites = [
  'tests/chatbot_guide.test.ts',
  'tests/api_comprehensive.test.ts',
  'tests/ui_pages_browser.test.ts'
];

let allPassed = true;
const tsxCli = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');

try {
  for (const suite of httpSuites) {
    console.log(`\n================================================================`);
    console.log(`>>> EXECUTING INTEGRATION SUITE: ${suite}`);
    console.log(`================================================================`);
    const res = spawnSync(process.execPath, [tsxCli, suite], {
      stdio: 'inherit',
      env: {
        ...process.env,
        TEST_BASE_URL: activeBaseUrl,
        DATABASE_PATH: testDbPath,
        UPLOADS_DIR: testUploadsDir
      }
    });

    if (res.status !== 0) {
      console.error(`FAILED: ${suite} (exit code ${res.status})`);
      allPassed = false;
      break;
    }
  }
} finally {
  // 4. Reliable Teardown
  if (serverProcess) {
    console.log('\n[HARNESS] Tearing down isolated test server...');
    if (isWin) {
      try {
        execSync(`taskkill /pid ${serverProcess.pid} /T /F`, { stdio: 'ignore' });
      } catch {}
    } else {
      serverProcess.kill('SIGTERM');
    }
    console.log('[HARNESS] Test server stopped cleanly.');
  }
}

if (!allPassed) {
  console.error('\nONE OR MORE HTTP INTEGRATION SUITES FAILED!');
  process.exit(1);
} else {
  console.log('\n================================================================');
  console.log('>>> ALL 3 HTTP INTEGRATION SUITES PASSED WITH ZERO DEFECTS! <<<');
  console.log('================================================================');
  process.exit(0);
}
