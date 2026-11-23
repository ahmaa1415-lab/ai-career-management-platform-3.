#!/usr/bin/env node
/**
 * Migration Bundle Verification Script
 *
 * Deterministically verifies that scripts/run_email_migration.mjs:
 * 1. Exists and has a non-zero byte size.
 * 2. Contains the expected migration identifier 'add_user_id_to_emails'.
 * 3. References 'better-sqlite3' and 'runEmailUserIdMigration'.
 * 4. Is fresh: mtime is greater than or equal to source files (scripts/run_email_migration.ts and lib/migrations.ts).
 */

import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const bundlePath = path.join(rootDir, 'scripts', 'run_email_migration.mjs');
const sourceCliPath = path.join(rootDir, 'scripts', 'run_email_migration.ts');
const sourceMigrationPath = path.join(rootDir, 'lib', 'migrations.ts');
const sourceCoordinationPath = path.join(rootDir, 'lib', 'coordination.ts');

console.log('[VERIFY BUNDLE] Checking migration bundle integrity...');

if (!fs.existsSync(bundlePath)) {
  console.error(`[ERROR] Bundle does not exist: ${bundlePath}`);
  console.error('Run "npm run build:migration" to generate the bundle.');
  process.exit(1);
}

const bundleStats = fs.statSync(bundlePath);
if (bundleStats.size === 0) {
  console.error(`[ERROR] Bundle is empty (0 bytes): ${bundlePath}`);
  process.exit(1);
}

const bundleContent = fs.readFileSync(bundlePath, 'utf-8');

const requiredTokens = [
  'add_user_id_to_emails',
  'runEmailUserIdMigration',
  'better-sqlite3',
  'STAGING_MODE',
  'ALLOW_STAGING_MIGRATION'
];

for (const token of requiredTokens) {
  if (!bundleContent.includes(token)) {
    console.error(`[ERROR] Bundle is missing required token: "${token}"`);
    process.exit(1);
  }
}

// Ensure the bundle is completely decoupled from Next.js server runtime (fixes ERR_MODULE_NOT_FOUND on node_modules/next/server)
const forbiddenTokens = [
  'next/server',
  'NextResponse'
];

for (const token of forbiddenTokens) {
  if (bundleContent.includes(token)) {
    console.error(`[ERROR] Bundle contains forbidden token (violates standalone Node ESM decoupling): "${token}"`);
    process.exit(1);
  }
}

// Check mtime against source files
const sourceFiles = [sourceCliPath, sourceMigrationPath, sourceCoordinationPath];
let isStale = false;

for (const src of sourceFiles) {
  if (fs.existsSync(src)) {
    const srcStats = fs.statSync(src);
    // Tolerate up to 1000ms clock skew / filesystem timestamp resolution
    if (srcStats.mtimeMs > bundleStats.mtimeMs + 1000) {
      console.error(`[ERROR] Bundle is STALE compared to source file: ${path.relative(rootDir, src)}`);
      console.error(`Source mtime: ${new Date(srcStats.mtimeMs).toISOString()}, Bundle mtime: ${new Date(bundleStats.mtimeMs).toISOString()}`);
      isStale = true;
    }
  }
}

if (isStale) {
  console.error('\n[FATAL] Stale migration bundle detected! Run "npm run build:migration" before building application.');
  process.exit(1);
}

console.log(`[VERIFY BUNDLE] Bundle integrity verified: ${bundlePath} (${bundleStats.size} bytes, fresh against all sources).`);
process.exit(0);
