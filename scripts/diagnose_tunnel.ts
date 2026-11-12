const origin = 'http://127.0.0.1:3000';
const tunnel = 'https://limiting-surrounding-herein-settlement.trycloudflare.com';
const paths = ['/', '/login', '/register'];

interface DiagnosticResult {
  url: string;
  userAgent: string;
  status?: number;
  statusText?: string;
  elapsedMs: number;
  contentType?: string;
  headers?: Record<string, string>;
  redirected?: boolean;
  redirectUrl?: string;
  isNextJsPage?: boolean;
  isCloudflareBlock?: boolean;
  bodySnippet?: string;
  error?: string;
}

async function testUrl(url: string, userAgent: string): Promise<DiagnosticResult> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': userAgent },
      redirect: 'manual'
    });
    const elapsed = Date.now() - start;
    const body = await res.text();
    const headers: Record<string, string> = {};
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
      userAgent,
      status: res.status,
      statusText: res.statusText,
      elapsedMs: elapsed,
      contentType: res.headers.get('content-type') || undefined,
      headers,
      redirected: res.status >= 300 && res.status < 400,
      redirectUrl: res.headers.get('location') || undefined,
      isNextJsPage,
      isCloudflareBlock,
      bodySnippet: body.slice(0, 300).replace(/\s+/g, ' ')
    };
  } catch (err: any) {
    return {
      url,
      userAgent,
      elapsedMs: Date.now() - start,
      error: err.message
    };
  }
}

async function runDiagnostics() {
  console.log('===============================================================');
  console.log('CLOUDFLARE TUNNEL — EXTERNAL ACCESS DIAGNOSTIC EXECUTION');
  console.log('Local Origin: ' + origin);
  console.log('Public Tunnel: ' + tunnel);
  console.log('Timestamp: ' + new Date().toISOString());
  console.log('===============================================================\n');

  const standardUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const chatGptUa = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ChatGPT-User/1.0; +https://openai.com/bot)';
  const oaiSearchBotUa = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 (compatible; OAI-SearchBot/1.0; +https://openai.com/bot)';

  console.log('>>> 1. LOCAL ORIGIN TESTS (127.0.0.1:3000) <<<');
  for (const p of paths) {
    const r = await testUrl(origin + p, standardUa);
    console.log(JSON.stringify(r, null, 2));
  }

  console.log('\n>>> 2. PUBLIC HTTPS TUNNEL TESTS (Standard Browser User-Agent) <<<');
  for (const p of paths) {
    const r = await testUrl(tunnel + p, standardUa);
    console.log(JSON.stringify(r, null, 2));
  }

  console.log('\n>>> 3. PUBLIC HTTPS TUNNEL TESTS (ChatGPT-User User-Agent) <<<');
  for (const p of paths) {
    const r = await testUrl(tunnel + p, chatGptUa);
    console.log(JSON.stringify(r, null, 2));
  }

  console.log('\n>>> 4. PUBLIC HTTPS TUNNEL TESTS (OAI-SearchBot User-Agent) <<<');
  for (const p of paths) {
    const r = await testUrl(tunnel + p, oaiSearchBotUa);
    console.log(JSON.stringify(r, null, 2));
  }

  console.log('\n>>> 5. ROBOTS.TXT CHECK <<<');
  const robotsRes = await testUrl(tunnel + '/robots.txt', chatGptUa);
  console.log(JSON.stringify(robotsRes, null, 2));

  console.log('\n>>> 6. SECURITY SENSITIVE EXPOSURE CHECKS <<<');
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
    console.log(`Probe: ${sp} -> HTTP ${r.status} (${r.statusText || 'OK'}), Length snippet: ${r.bodySnippet?.slice(0, 60)}`);
  }
}

runDiagnostics();
