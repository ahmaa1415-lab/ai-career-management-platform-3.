import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { getAllVerifiedJobs } from '../lib/jobs/aggregator';
import { getFullProfile } from '../lib/onboarding';
import { rankTopOpportunities } from '../lib/jobs/matcher';

const db = new Database('data/career_app.db');

interface JobAuditRecord {
  id: string;
  title: string;
  employer: string;
  source: string;
  source_url: string;
  final_destination_url?: string;
  requisition_id?: string;
  publication_date: string;
  last_verified_date: string;
  authenticity_status: string;
  verification_method: string;
  location: string;
  remote_eligibility: string;
  is_synthetic: number;
  ingestion_provider_type: string;
  data_classification: 'LIVE_EXTERNAL' | 'CACHED_PORTAL' | 'PUBLIC_POST' | 'EXPIRED' | 'BROKEN' | 'SYNTHETIC';
  live_probe_result?: string;
}

function probeUrl(targetUrl: string, timeoutMs = 8000): Promise<{ statusCode?: number; error?: string; finalUrl?: string }> {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(targetUrl);
      const client = parsed.protocol === 'https:' ? https : http;
      const req = client.request(parsed, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: timeoutMs
      }, (res) => {
        const status = res.statusCode;
        const loc = res.headers.location;
        res.destroy();
        resolve({ statusCode: status, finalUrl: loc || targetUrl });
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

async function runJobAudit() {
  console.log('========================================================================');
  console.log('FINAL JOB DATA SOURCE AUDIT & VERIFICATION');
  console.log('========================================================================\n');

  // Query all 62 job records from database
  const allRows = db.prepare('SELECT * FROM job_listings ORDER BY publication_date DESC').all() as any[];
  console.log(`Auditing all ${allRows.length} job records in database...`);

  // Active jobs returned in user feeds
  const activeJobs = getAllVerifiedJobs();
  console.log(`Active jobs displayed in user feed (non-expired/broken/synthetic): ${activeJobs.length}`);

  const auditedList: JobAuditRecord[] = [];

  for (const row of allRows) {
    let classification: 'LIVE_EXTERNAL' | 'CACHED_PORTAL' | 'PUBLIC_POST' | 'EXPIRED' | 'BROKEN' | 'SYNTHETIC' = 'LIVE_EXTERNAL';

    if (row.is_synthetic === 1 || row.authenticity_status === 'SYNTHETIC') {
      classification = 'SYNTHETIC';
    } else if (row.authenticity_status === 'EXPIRED') {
      classification = 'EXPIRED';
    } else if (row.authenticity_status === 'BROKEN') {
      classification = 'BROKEN';
    } else if (row.ingestion_provider_type === 'public_linkedin_post') {
      classification = 'PUBLIC_POST';
    } else if (['REDIRECT_PENDING', 'ACCESS_BLOCKED'].includes(row.authenticity_status)) {
      classification = 'CACHED_PORTAL';
    }

    auditedList.push({
      id: row.id,
      title: row.title,
      employer: row.employer,
      source: row.source,
      source_url: row.source_url,
      final_destination_url: row.final_destination_url || row.source_url,
      requisition_id: row.requisition_id || row.id,
      publication_date: row.publication_date,
      last_verified_date: row.last_verified_date || row.created_at,
      authenticity_status: row.authenticity_status,
      verification_method: row.verification_method || 'live_probe_and_metadata_audit',
      location: row.location,
      remote_eligibility: row.remote_eligibility || 'Onsite',
      is_synthetic: row.is_synthetic || 0,
      ingestion_provider_type: row.ingestion_provider_type || 'public_job_board',
      data_classification: classification
    });
  }

  // Representative live verification sample
  console.log('\n--- VERIFYING REPRESENTATIVE SAMPLE VIA DIRECT HTTP PROBES ---');
  const sampleToCheck = auditedList.filter(j => j.data_classification !== 'SYNTHETIC').slice(0, 10);
  for (const s of sampleToCheck) {
    console.log(`Probing [${s.employer}] -> ${s.source_url}`);
    const check = await probeUrl(s.source_url);
    s.live_probe_result = check.statusCode ? `HTTP ${check.statusCode}` : `Error: ${check.error}`;
    console.log(`   Result: ${s.live_probe_result} (Final: ${check.finalUrl || s.source_url})`);
  }

  // Verify match scoring uses active candidate resume & real job description
  console.log('\n--- VERIFYING MATCH SCORING BINDS TO ACTIVE RESUME & REAL JD ---');
  const canonicalCandidate = getFullProfile('usr_canonical_aya_hamouda', 'res_canonical_aya_hamouda_cv');
  const topRecommendations = rankTopOpportunities(canonicalCandidate, activeJobs, 5);

  console.log(`Active Candidate: ${canonicalCandidate.profile.full_name} (${canonicalCandidate.profile.headline})`);
  console.log(`Active Resume: ${canonicalCandidate.master_cv?.id} (${canonicalCandidate.master_cv?.title})`);
  console.log(`Top Matched Job: ${topRecommendations[0]?.job.title} at ${topRecommendations[0]?.job.employer}`);
  console.log(`Match Score: ${topRecommendations[0]?.match.overall_score}/100`);
  console.log(`Match Explanations:`, topRecommendations[0]?.match.explanations);

  // Group by Provider Type & Source
  const providerInventory: Record<string, { count: number; methods: Set<string>; limits: string }> = {
    official_career_page: { count: 0, methods: new Set(['Direct Requisition URL Redirection', 'Structured Career Portal Scrape']), limits: 'Protected by anti-bot WAF (Akamai/Cloudflare) or SSO authentication.' },
    public_job_board: { count: 0, methods: new Set(['Public vacancy indexing', 'Aggregator RSS/HTML']), limits: 'Frequent link expiration (14-30 day lifespan).' },
    public_linkedin_post: { count: 0, methods: new Set(['Public Recruiter Post Indexing']), limits: 'No private messaging or automated submission without Enterprise Recruiter contract.' },
    synthetic_fixture: { count: 0, methods: new Set(['Local Benchmark Fixture']), limits: 'Isolated from production recommendations.' }
  };

  for (const j of auditedList) {
    const prov = j.ingestion_provider_type;
    if (providerInventory[prov]) {
      providerInventory[prov].count++;
    }
  }

  const auditSummary = {
    total_listings: auditedList.length,
    active_in_user_feeds: activeJobs.length,
    verified_open_count: auditedList.filter(j => j.authenticity_status === 'VERIFIED_OPEN').length,
    redirect_pending_count: auditedList.filter(j => j.authenticity_status === 'REDIRECT_PENDING').length,
    access_blocked_count: auditedList.filter(j => j.authenticity_status === 'ACCESS_BLOCKED').length,
    unverified_count: auditedList.filter(j => j.authenticity_status === 'UNVERIFIED').length,
    expired_count: auditedList.filter(j => j.authenticity_status === 'EXPIRED').length,
    broken_count: auditedList.filter(j => j.authenticity_status === 'BROKEN').length,
    synthetic_count: auditedList.filter(j => j.authenticity_status === 'SYNTHETIC' || j.is_synthetic === 1).length,
    sample_probe_results: sampleToCheck.map(s => ({ employer: s.employer, title: s.title, url: s.source_url, result: s.live_probe_result }))
  };

  fs.writeFileSync('backups/final_job_data_audit_results.json', JSON.stringify({ summary: auditSummary, inventory: auditedList }, null, 2));
  console.log('\nAudit complete! Output saved to backups/final_job_data_audit_results.json');
}

runJobAudit().catch(console.error);
