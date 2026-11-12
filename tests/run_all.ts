import { spawnSync } from 'child_process';
import path from 'path';

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

console.log('===============================================================');
console.log('   AI CAREER MANAGEMENT & JOB SEARCH APPLICATION - TEST SUITE   ');
console.log('===============================================================\n');

let allPassed = true;
const results: Array<{ suite: string; status: 'PASSED' | 'FAILED' }> = [];

const tsxCli = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');

for (const suite of testSuites) {
  console.log(`\n>>> EXECUTING: ${suite}`);
  const res = spawnSync(process.execPath, [tsxCli, suite], { stdio: 'inherit' });
  if (res.status === 0) {
    results.push({ suite, status: 'PASSED' });
  } else {
    console.error(`FAILED: ${suite} (exit code ${res.status})`);
    results.push({ suite, status: 'FAILED' });
    allPassed = false;
  }
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
}
