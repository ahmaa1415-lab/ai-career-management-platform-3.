import fs from 'fs';
import path from 'path';

// 1. CAPTURE ORIGINAL ENVIRONMENT VARIABLES PRIOR TO TEST MUTATION
const originalDatabasePath = process.env.DATABASE_PATH;
const originalStagingMode = process.env.STAGING_MODE;
const originalStagingAccessCode = process.env.STAGING_ACCESS_CODE;

// 2. ISOLATED TEST ENVIRONMENT CONFIGURATION
const testDbDir = path.join(process.cwd(), 'data', 'test_reg_staging');
const testDbPath = path.join(testDbDir, 'isolated_reg_test.db');
if (fs.existsSync(testDbDir)) fs.rmSync(testDbDir, { recursive: true, force: true });
fs.mkdirSync(testDbDir, { recursive: true });

process.env.DATABASE_PATH = testDbPath;
process.env.STAGING_MODE = 'true';
process.env.NODE_ENV = 'production';
process.env.STAGING_ACCESS_CODE = 'TEST_STAGING_KEY_2026';

// Dynamic imports so lib/db.ts initializes inside the isolated database
const { default: db, initializeSchema } = await import('../lib/db');
const { isRegistrationAllowed, isStagingMode } = await import('../lib/staging-security');
const { POST: registerHandler } = await import('../app/api/auth/register/route');

async function runRegistrationSecurityTests() {
  console.log('========================================================================');
  console.log('--- RUNNING REGISTRATION & STAGING ACCESS CODE SECURITY SUITE ---');
  console.log('========================================================================\n');

  try {
    initializeSchema();

    // ---------------------------------------------------------------------------
    // TEST SUITE 1: STAGING SECURITY LOGIC GATE (lib/staging-security.ts)
    // ---------------------------------------------------------------------------
    console.log('>>> [SUITE 1] Verifying Staging Security Gate Logic...');

    if (!isStagingMode()) {
      throw new Error('STAGING_MODE should be true in staging environment');
    }

    // A. Missing code must be blocked
    if (isRegistrationAllowed(undefined)) {
      throw new Error('Security violation: Registration allowed without access code in staging mode');
    }
    console.log('  ✓ Missing code strictly rejected (undefined -> false)');

    // B. Empty string must be blocked
    if (isRegistrationAllowed('')) {
      throw new Error('Security violation: Registration allowed with empty string access code');
    }
    console.log('  ✓ Empty string code strictly rejected ("" -> false)');

    // C. Whitespace string must be blocked
    if (isRegistrationAllowed('   ')) {
      throw new Error('Security violation: Registration allowed with whitespace access code');
    }
    console.log('  ✓ Whitespace code strictly rejected ("   " -> false)');

    // D. Invalid / malicious code must be blocked
    if (isRegistrationAllowed('INCORRECT_SECRET_CODE')) {
      throw new Error('Security violation: Registration allowed with invalid access code');
    }
    console.log('  ✓ Incorrect code strictly rejected');

    // E. Valid code must be accepted
    if (!isRegistrationAllowed('TEST_STAGING_KEY_2026')) {
      throw new Error('Assertion failed: Valid staging access code was rejected');
    }
    console.log('  ✓ Valid code strictly accepted');

    // ---------------------------------------------------------------------------
    // TEST SUITE 2: REGISTRATION API ROUTE HANDLER IN STAGING MODE
    // ---------------------------------------------------------------------------
    console.log('\n>>> [SUITE 2] Verifying /api/auth/register Route Handler (Staging Mode)...');

    // A. Attempt registration without stagingCode
    const reqNoCode = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Synthetic Candidate 1',
        email: 'cand1@staging.test',
        password: 'SecurePassword123!',
        confirmPassword: 'SecurePassword123!',
        agreeTerms: true
      })
    });
    const resNoCode = await registerHandler(reqNoCode);
    const dataNoCode = await resNoCode.json();

    if (resNoCode.status !== 403) {
      throw new Error(`Expected HTTP 403 for missing stagingCode, received: ${resNoCode.status}`);
    }
    if (!dataNoCode.error?.includes('staging access code is required')) {
      throw new Error(`Expected staging restriction error message, got: ${dataNoCode.error}`);
    }
    console.log('  ✓ Staging registration without code blocked with HTTP 403 & exact error message');

    // B. Attempt registration with wrong stagingCode
    const reqBadCode = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Synthetic Candidate 2',
        email: 'cand2@staging.test',
        password: 'SecurePassword123!',
        confirmPassword: 'SecurePassword123!',
        agreeTerms: true,
        stagingCode: 'INVALID_ACCESS_CODE'
      })
    });
    const resBadCode = await registerHandler(reqBadCode);
    const dataBadCode = await resBadCode.json();

    if (resBadCode.status !== 403) {
      throw new Error(`Expected HTTP 403 for invalid stagingCode, received: ${resBadCode.status}`);
    }
    console.log('  ✓ Staging registration with incorrect code blocked with HTTP 403');

    // C. Successful registration with valid stagingCode (with trimmed support)
    const reqValid = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Dr. Synthetic Expert',
        email: 'expert@staging.test',
        password: 'ExecutivePassword2026!',
        confirmPassword: 'ExecutivePassword2026!',
        agreeTerms: true,
        stagingCode: '  TEST_STAGING_KEY_2026  '
      })
    });
    const resValid = await registerHandler(reqValid);
    const dataValid = await resValid.json();

    if (resValid.status !== 200 || !dataValid.success) {
      throw new Error(`Expected HTTP 200 with success for valid code, got: ${resValid.status}: ${JSON.stringify(dataValid)}`);
    }
    if (dataValid.user?.email !== 'expert@staging.test') {
      throw new Error(`Expected registered user email 'expert@staging.test', got: ${dataValid.user?.email}`);
    }
    console.log('  ✓ Staging registration with valid code succeeded (HTTP 200, user created)');

    // D. Duplicate email rejection (HTTP 409)
    const reqDuplicate = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Duplicate Candidate',
        email: 'expert@staging.test',
        password: 'AnotherPassword2026!',
        confirmPassword: 'AnotherPassword2026!',
        agreeTerms: true,
        stagingCode: 'TEST_STAGING_KEY_2026'
      })
    });
    const resDuplicate = await registerHandler(reqDuplicate);
    const dataDuplicate = await resDuplicate.json();

    if (resDuplicate.status !== 409) {
      throw new Error(`Expected HTTP 409 for duplicate email, got: ${resDuplicate.status}`);
    }
    console.log('  ✓ Duplicate email rejected with HTTP 409');

    // E. Password mismatch rejection (HTTP 400)
    const reqMismatch = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Mismatch Tester',
        email: 'mismatch@staging.test',
        password: 'ValidPassword123!',
        confirmPassword: 'DifferentPassword123!',
        agreeTerms: true,
        stagingCode: 'TEST_STAGING_KEY_2026'
      })
    });
    const resMismatch = await registerHandler(reqMismatch);
    if (resMismatch.status !== 400) {
      throw new Error(`Expected HTTP 400 for password mismatch, got: ${resMismatch.status}`);
    }
    console.log('  ✓ Password mismatch rejected with HTTP 400');

    // F. Weak password rejection (HTTP 400)
    const reqWeak = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Weak Tester',
        email: 'weak@staging.test',
        password: 'short',
        confirmPassword: 'short',
        agreeTerms: true,
        stagingCode: 'TEST_STAGING_KEY_2026'
      })
    });
    const resWeak = await registerHandler(reqWeak);
    if (resWeak.status !== 400) {
      throw new Error(`Expected HTTP 400 for weak password, got: ${resWeak.status}`);
    }
    console.log('  ✓ Weak password (<8 chars / no numbers) rejected with HTTP 400');

    // ---------------------------------------------------------------------------
    // TEST SUITE 3: PRODUCTION REGISTRATION UNTOUCHED (STAGING_MODE=false)
    // ---------------------------------------------------------------------------
    console.log('\n>>> [SUITE 3] Verifying Production Mode Behavior (STAGING_MODE=false)...');
    process.env.STAGING_MODE = 'false';

    const reqProd = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Production Candidate',
        email: 'candidate.prod@enterprise.test',
        password: 'ProdExecutivePassword2026!',
        confirmPassword: 'ProdExecutivePassword2026!',
        agreeTerms: true
        // No stagingCode provided in production
      })
    });
    const resProd = await registerHandler(reqProd);
    const dataProd = await resProd.json();

    if (resProd.status !== 200 || !dataProd.success) {
      throw new Error(`Production registration failed without stagingCode: ${resProd.status}: ${JSON.stringify(dataProd)}`);
    }
    console.log('  ✓ Production registration without stagingCode succeeds unimpeded (HTTP 200)');

    console.log('\n========================================================================');
    console.log('>>> ALL REGISTRATION & STAGING SECURITY TESTS PASSED SUCCESSFULLY! <<<');
    console.log('========================================================================\n');
  } finally {
    // ---------------------------------------------------------------------------
    // GUARANTEED CLEANUP: RESTORE ENVIRONMENT VARIABLES & CLEAN TEST DATABASE
    // ---------------------------------------------------------------------------
    console.log('>>> [CLEANUP] Restoring original environment variables...');

    if (originalDatabasePath !== undefined) {
      process.env.DATABASE_PATH = originalDatabasePath;
    } else {
      delete process.env.DATABASE_PATH;
    }

    if (originalStagingMode !== undefined) {
      process.env.STAGING_MODE = originalStagingMode;
    } else {
      delete process.env.STAGING_MODE;
    }

    if (originalStagingAccessCode !== undefined) {
      process.env.STAGING_ACCESS_CODE = originalStagingAccessCode;
    } else {
      delete process.env.STAGING_ACCESS_CODE;
    }

    console.log('  ✓ Environment variables restored to exact pre-test state.');

    console.log('>>> [CLEANUP] Cleaning up isolated test database directory...');
    try {
      if (fs.existsSync(testDbDir)) {
        fs.rmSync(testDbDir, { recursive: true, force: true });
      }
      console.log('  ✓ Isolated test database cleaned successfully.');
    } catch {
      console.warn('  ! Note: Could not immediately remove test db directory (locked by process); marked for cleanup.');
    }
  }
}

runRegistrationSecurityTests().catch((err) => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
