import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { VERIFIED_SOURCE_LISTINGS } from '../lib/jobs/aggregator';
import db from '../lib/db';

interface AuditRecord {
  id: string;
  title: string;
  employer: string;
  source: string;
  source_url: string;
  company_portal_url?: string;
  publication_date: string;
  last_verified?: string;
  status: string;
  location: string;
  work_arrangement: string;
  classification: 'LIVE_EXTERNAL' | 'CURATED_BENCHMARK' | 'TEST_FIXTURE' | 'SYNTHETIC_MOCK';
  http_check_status?: number | string;
  notes?: string;
}

// Function to test URL with timeout
function testUrl(targetUrl: string, timeoutMs = 7000): Promise<{ statusCode?: number; error?: string }> {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(targetUrl);
      const client = parsed.protocol === 'https:' ? https : http;
      const req = client.request(parsed, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: timeoutMs
      }, (res) => {
        resolve({ statusCode: res.statusCode });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ error: 'TIMEOUT' });
      });

      req.on('error', (err) => {
        resolve({ error: err.message });
      });

      req.end();
    } catch (e: any) {
      resolve({ error: e.message });
    }
  });
}

async function runAudit() {
  console.log('========================================================================');
  console.log('STARTING JOB DATA SOURCE & LIVE LINK INTEGRITY AUDIT');
  console.log(`Current Timestamp: ${new Date().toISOString()}`);
  console.log(`Total Curated Job Listings: ${VERIFIED_SOURCE_LISTINGS.length}`);
  console.log('========================================================================\n');

  // Query Database job_listings
  const dbJobs = db.prepare('SELECT * FROM job_listings').all() as any[];
  console.log(`Database job_listings row count: ${dbJobs.length}`);

  const auditResults: AuditRecord[] = [];

  // Groupings for provider/source inventory
  const sourcesMap: Record<string, { count: number; employers: Set<string>; types: Set<string> }> = {};

  for (const job of VERIFIED_SOURCE_LISTINGS) {
    let classification: 'LIVE_EXTERNAL' | 'CURATED_BENCHMARK' | 'TEST_FIXTURE' | 'SYNTHETIC_MOCK' = 'CURATED_BENCHMARK';

    if (job.id.startsWith('fixture_') || job.id.startsWith('scenario_') || job.id.startsWith('test_')) {
      classification = 'TEST_FIXTURE';
    } else if (job.source_url && (job.source_url.includes('example.com') || job.source_url.includes('sample'))) {
      classification = 'SYNTHETIC_MOCK';
    } else if (job.source_url && (job.source_url.startsWith('https://') || job.source_url.startsWith('http://'))) {
      classification = 'LIVE_EXTERNAL';
    }

    const srcKey = job.source || 'Unknown';
    if (!sourcesMap[srcKey]) {
      sourcesMap[srcKey] = { count: 0, employers: new Set(), types: new Set() };
    }
    sourcesMap[srcKey].count++;
    sourcesMap[srcKey].employers.add(job.employer);
    sourcesMap[srcKey].types.add(job.application_type || 'direct');

    auditResults.push({
      id: job.id,
      title: job.title,
      employer: job.employer,
      source: job.source,
      source_url: job.source_url,
      company_portal_url: job.company_portal_url,
      publication_date: job.publication_date,
      last_verified: (job as any).last_verified_at || job.publication_date,
      status: job.is_verified ? 'Verified Open' : 'Unverified',
      location: job.location,
      work_arrangement: job.remote_eligibility || 'Onsite',
      classification
    });
  }

  // Representative sample verification of live external job links
  console.log('Selecting representative sample of live external links to verify HTTP connectivity...');
  const sampleJobs = auditResults.filter(j => j.classification === 'LIVE_EXTERNAL').slice(0, 15);

  for (const s of sampleJobs) {
    const urlToCheck = s.source_url;
    console.log(`Checking [${s.employer}] -> ${urlToCheck}`);
    const check = await testUrl(urlToCheck);
    s.http_check_status = check.statusCode ? `HTTP ${check.statusCode}` : `Error: ${check.error}`;
    console.log(`   Result: ${s.http_check_status}`);
  }

  // Provider inventory
  console.log('\n========================================================================');
  console.log('JOB SOURCE INVENTORY & INTEGRATION METHODS');
  console.log('========================================================================');
  for (const [src, data] of Object.entries(sourcesMap)) {
    console.log(`- Source: "${src}"`);
    console.log(`  Count: ${data.count}`);
    console.log(`  Employers: ${Array.from(data.employers).slice(0, 4).join(', ')}${data.employers.size > 4 ? ` (+${data.employers.size - 4} more)` : ''}`);
    console.log(`  Application Types: ${Array.from(data.types).join(', ')}`);
  }

  // Classification summary
  const summary = {
    total_listings: auditResults.length,
    live_external_listings: auditResults.filter(r => r.classification === 'LIVE_EXTERNAL').length,
    curated_benchmark_listings: auditResults.filter(r => r.classification === 'CURATED_BENCHMARK').length,
    test_fixture_listings: auditResults.filter(r => r.classification === 'TEST_FIXTURE').length,
    synthetic_mock_listings: auditResults.filter(r => r.classification === 'SYNTHETIC_MOCK').length,
    verified_sample_count: sampleJobs.length,
    sample_checks: sampleJobs.map(s => ({
      id: s.id,
      employer: s.employer,
      title: s.title,
      url: s.source_url,
      status: s.http_check_status
    }))
  };

  fs.writeFileSync('backups/job_data_audit.json', JSON.stringify({ summary, all_listings: auditResults }, null, 2));
  console.log('\nAudit data written to backups/job_data_audit.json');
}

runAudit().catch(console.error);
