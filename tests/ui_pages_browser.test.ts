import { createSession } from '../lib/auth';

console.log('================================================================');
console.log('--- RUNNING UI-01: ALL 21 WEB PAGES & BROWSER RENDERING TEST ---');
console.log('================================================================');

const BASE_URL = 'http://localhost:3000';

// Generate verified authenticated session for candidate browsing
const testSession = createSession('user_default_01', { rememberMe: true, userAgent: 'HeadlessBrowserTest' });
const cookieHeader = `career_session=${testSession.token}`;

const PAGES = [
  { path: '/', titleKeyword: 'Antigravity', expectedText: 'Autonomous Career Platform' },
  { path: '/control-center', titleKeyword: 'Antigravity', expectedText: 'MY CAREER CONTROL CENTER' },
  { path: '/profile', titleKeyword: 'Antigravity', expectedText: 'Career Profile' },
  { path: '/onboarding', titleKeyword: 'Antigravity', expectedText: 'Onboarding' },
  { path: '/resumes', titleKeyword: 'Antigravity', expectedText: 'Resume Studio' },
  { path: '/ats-analyzer', titleKeyword: 'Antigravity', expectedText: 'ATS' },
  { path: '/linkedin', titleKeyword: 'Antigravity', expectedText: 'LinkedIn' },
  { path: '/discovery', titleKeyword: 'Antigravity', expectedText: 'Job Discovery' },
  { path: '/top-opportunities', titleKeyword: 'Antigravity', expectedText: 'Top' },
  { path: '/applications', titleKeyword: 'Antigravity', expectedText: 'Application' },
  { path: '/approvals', titleKeyword: 'Antigravity', expectedText: 'Approval Center' },
  { path: '/interview-prep', titleKeyword: 'Antigravity', expectedText: 'Interview Preparation' },
  { path: '/inbox', titleKeyword: 'Antigravity', expectedText: 'Recruitment Inbox' },
  { path: '/crm', titleKeyword: 'Antigravity', expectedText: 'CRM' },
  { path: '/reports', titleKeyword: 'Antigravity', expectedText: 'Analytics' },
  { path: '/notifications', titleKeyword: 'Antigravity', expectedText: 'Notifications' },
  { path: '/settings', titleKeyword: 'Antigravity', expectedText: 'Settings' },
  // Additional Specialized Screens
  { path: '/login', titleKeyword: 'Antigravity', expectedText: 'Candidate Authentication' },
  { path: '/register', titleKeyword: 'Antigravity', expectedText: 'Create Executive Account' },
  { path: '/forgot-password', titleKeyword: 'Antigravity', expectedText: 'Account Recovery' },
  { path: '/reset-password', titleKeyword: 'Antigravity', expectedText: 'Password Recovery' },
  { path: '/cover-letter', titleKeyword: 'Antigravity', expectedText: 'Cover Letter Studio' },
  { path: '/audit-log', titleKeyword: 'Antigravity', expectedText: 'Audit Log' },
  { path: '/integrations', titleKeyword: 'Antigravity', expectedText: 'Portal Integrations' },
  { path: '/job-intelligence', titleKeyword: 'Antigravity', expectedText: 'Intelligence Hub' }
];

async function verifyAllWebPages() {
  let passed = 0;

  for (const page of PAGES) {
    const url = `${BASE_URL}${page.path}`;
    try {
      // For login and register, test without session cookie to verify unauthenticated landing
      const isPublicAuthPage = page.path === '/login' || page.path === '/register';
      let res: Response | null = null;
      let lastErr: any = null;

      // Allow up to 3 attempts with 120s timeout to accommodate on-demand first-time SSR compilation
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          res = await fetch(url, {
            headers: isPublicAuthPage ? {} : { Cookie: cookieHeader },
            signal: AbortSignal.timeout(120000)
          });
          if (res.status === 200) break;
        } catch (err: any) {
          lastErr = err;
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      if (!res || res.status !== 200) {
        throw lastErr || new Error(`Expected HTTP 200, got ${res?.status}`);
      }
      const html = await res.text();
      if (!html || html.length < 200) {
        throw new Error('Response HTML payload too short or empty');
      }
      if (!html.toLowerCase().includes(page.expectedText.toLowerCase())) {
        throw new Error(`Expected content text "${page.expectedText}" not found in page HTML`);
      }
      console.log(`[✓ PASS] Route ${page.path} (HTTP 200, ${html.length} bytes rendered)`);
      passed++;
    } catch (err: any) {
      console.error(`[✗ FAIL] Route ${page.path}:`, err.message);
      throw err;
    }
  }

  console.log('\n================================================================');
  console.log(`>>> ALL ${passed}/${PAGES.length} WEB UI PAGES RENDERED CLEANLY WITH ZERO ERRORS! <<<`);
  console.log('================================================================');
}

verifyAllWebPages().catch(err => {
  console.error('\nUI VERIFICATION FAILED:', err);
  process.exit(1);
});
