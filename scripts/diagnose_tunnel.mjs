import fs from 'fs';

const origin = 'http://127.0.0.1:3000';
const tunnel = 'https://limiting-surrounding-herein-settlement.trycloudflare.com';
const paths = ['/', '/login', '/register'];

async function testUrl(url, userAgent) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      headers: { 'User-Agent': userAgent },
      redirect: 'manual',
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const elapsed = Date.now() - start;
    const body = await res.text();
    const headers = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });

    const isNextJsPage =
      body.includes('__next') ||
      body.includes('/_next/') ||
      body.includes('Career Management Platform') ||
      body.includes('تسجيل الدخول') ||
      body.includes('Next.js');

    const isCloudflareBlock =
      body.includes('Attention Required! | Cloudflare') ||
      body.includes('Cloudflare Ray ID') ||
      body.includes('cf-browser-verification') ||
      body.includes('Just a moment...');

    return {
      url,
      userAgent: userAgent.slice(0, 40) + '...',
      status: res.status,
      statusText: res.statusText,
      elapsedMs: elapsed,
      contentType: res.headers.get('content-type') || null,
      headers,
      redirected: res.status >= 300 && res.status < 400,
      redirectUrl: res.headers.get('location') || null,
      isNextJsPage,
      isCloudflareBlock,
      bodySnippet: body.slice(0, 200).replace(/\s+/g, ' ')
    };
  } catch (err) {
    return {
      url,
      userAgent: userAgent.slice(0, 40) + '...',
      elapsedMs: Date.now() - start,
      error: err.name === 'AbortError' ? 'TIMEOUT_10S' : err.message
    };
  }
}

async function runDiagnostics() {
  const output = [];
  function log(msg) {
    output.push(msg);
    console.log(msg);
  }

  log('===============================================================');
  log('CLOUDFLARE TUNNEL — EXTERNAL ACCESS DIAGNOSTIC EXECUTION');
  log('Local Origin: ' + origin);
  log('Public Tunnel: ' + tunnel);
  log('Timestamp: ' + new Date().toISOString());
  log('===============================================================\n');

  const standardUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const chatGptUa = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ChatGPT-User/1.0; +https://openai.com/bot)';
  const oaiSearchBotUa = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 (compatible; OAI-SearchBot/1.0; +https://openai.com/bot)';

  log('>>> 1. LOCAL ORIGIN TESTS (127.0.0.1:3000) <<<');
  for (const p of paths) {
    const r = await testUrl(origin + p, standardUa);
    log(JSON.stringify(r, null, 2));
  }

  log('\n>>> 2. PUBLIC HTTPS TUNNEL TESTS (Standard Browser User-Agent) <<<');
  for (const p of paths) {
    const r = await testUrl(tunnel + p, standardUa);
    log(JSON.stringify(r, null, 2));
  }

  log('\n>>> 3. PUBLIC HTTPS TUNNEL TESTS (ChatGPT-User User-Agent) <<<');
  for (const p of paths) {
    const r = await testUrl(tunnel + p, chatGptUa);
    log(JSON.stringify(r, null, 2));
  }

  log('\n>>> 4. PUBLIC HTTPS TUNNEL TESTS (OAI-SearchBot User-Agent) <<<');
  for (const p of paths) {
    const r = await testUrl(tunnel + p, oaiSearchBotUa);
    log(JSON.stringify(r, null, 2));
  }

  log('\n>>> 5. ROBOTS.TXT CHECK <<<');
  const robotsRes = await testUrl(tunnel + '/robots.txt', chatGptUa);
  log(JSON.stringify(robotsRes, null, 2));

  log('\n>>> 6. SECURITY SENSITIVE EXPOSURE CHECKS <<<');
  const sensitivePaths = [
    '/.env',
    '/.env.local',
    '/.git/config',
    '/data/career_platform.db',
    '/data/uploads/',
    '/api/security'
  ];
  for (const sp of sensitivePaths) {
    const r = await testUrl(tunnel + sp, standardUa);
    log(`Probe: ${sp} -> HTTP ${r.status} (${r.statusText || 'OK'}), NextJsPage: ${r.isNextJsPage}, Redirect: ${r.redirectUrl || 'none'}`);
  }

  fs.writeFileSync('scripts/diagnostic_output.json', JSON.stringify(output, null, 2), 'utf-8');
  log('\nDiagnostic completed. Output saved to scripts/diagnostic_output.json');
}

runDiagnostics();
