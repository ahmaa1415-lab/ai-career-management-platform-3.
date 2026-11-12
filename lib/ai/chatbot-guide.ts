import { detectPromptInjection, sanitizeUntrustedInput } from '../security';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface QuickLink {
  label: string;
  path: string;
}

export interface GuideResponse {
  response: string;
  quickLinks: QuickLink[];
  suggestedQuestions: string[];
}

export const DEFAULT_SUGGESTED_QUESTIONS = [
  '🚀 How do I get started?',
  '📄 Where do I upload my CV?',
  '🎯 How does job matching score work?',
  '🛡️ What is the Approval Center?',
  '🌍 How do target countries & relocation work?',
  '📊 How does the Application CRM work?'
];

/**
 * Intelligent domain knowledge base and conversational engine for new users
 */
export function generateGuideResponse(
  userQuery: string,
  currentPath = '/',
  history: ChatMessage[] = []
): GuideResponse {
  const sanitized = sanitizeUntrustedInput(userQuery);
  const injection = detectPromptInjection(sanitized);

  if (injection.isMalicious) {
    return {
      response: `🛡️ **Security Alert: Adversarial Input Detected**\n\nYour message contained an instruction that triggered our prompt injection firewall (\`${injection.matchedPattern}\`). Antigravity strictly enforces human oversight and AI safety guidelines.\n\nHow else may I safely guide your career journey?`,
      quickLinks: [{ label: 'Review Security Settings', path: '/settings' }],
      suggestedQuestions: ['🚀 How do I get started?', '🛡️ What is the Approval Center?']
    };
  }

  const query = sanitized.toLowerCase();

  // 0a. Human Approval Center & Permission Questions
  if (
    query.includes('without my approval') ||
    query.includes('without approval') ||
    query.includes('approval center') ||
    query.includes('human approval')
  ) {
    return {
      response: `🛡️ **Human Approval Center — Zero Autonomous Submissions**\n\n- **Strict Safety Gate**: Antigravity **NEVER** sends an email, recruiter message, or job application automatically without your authorization.\n- **Preparation**: The AI prepares the complete application package (tailored CV, personalized cover letter, screening answers, and disclosures).\n- **Human Verification**: You inspect every field in the **Approval Center**.\n- Only when you click **Approve** or authorize **⚡ Apply Everywhere** is the application marked ready or the recruiter email dispatched!`,
      quickLinks: [
        { label: 'Open Approval Center', path: '/approvals' },
        { label: 'Inspect Application Workspace', path: '/applications' },
        { label: 'Review Security Controls', path: '/settings' }
      ],
      suggestedQuestions: [
        '📊 How does the Application CRM work?',
        '📬 How does the Recruitment Inbox work?',
        '🎯 How does job matching score work?'
      ]
    };
  }

  // 0b. Autonomous Autopilot & Apply Everywhere
  if (
    query.includes('apply everywhere') ||
    query.includes('autopilot') ||
    query.includes('on my behalf') ||
    query.includes('run automaticly') ||
    query.includes('run automatically') ||
    (query.includes('auto apply') && !query.includes('without')) ||
    (query.includes('automatic') && !query.includes('approval'))
  ) {
    return {
      response: `⚡ **Autonomous Autopilot & Apply Everywhere Engine**\n\nYes! The platform is equipped with full **Autonomous Autopilot** capabilities to apply everywhere on your behalf:\n\n1. **Multi-Platform Coverage**: Scans vacancies across **LinkedIn Jobs**, **RemoteOK**, **Bayt**, **Indeed**, **Wuzzuf**, **GulfTalent**, and **Direct Company Portals** (GitLab, Supabase, Careem, Delivery Hero, Automattic, Stripe, etc.).\n2. **AI Tailoring**: Automatically generates bespoke **Version B CVs**, tailored cover letters, and fills screening questionnaires for every matching role.\n3. **Automated Submission**: Dispatches the applications with status marked \`Applied\` in your CRM and records official confirmation timestamps.\n4. **Automated Recruiter Outreach**: Drafts and queues introductory messages in your Recruitment Inbox.\n\nYou can trigger **⚡ Apply Everywhere Autonomously** with a single click from the **Control Center**, **Approval Center**, or **Applications Workspace**!`,
      quickLinks: [
        { label: '⚡ Run Autopilot in Control Center', path: '/control-center' },
        { label: '🛡️ Review Approval Center', path: '/approvals' },
        { label: '📁 Applications Workspace', path: '/applications' }
      ],
      suggestedQuestions: [
        '🎯 How does job matching score work?',
        '📊 How does the Application CRM work?',
        '🔗 How does LinkedIn integration work?'
      ]
    };
  }

  // 0c. Company Site Redirection & Account Creation (LinkedIn & External ATS)
  if (
    query.includes('company site') ||
    query.includes('create an account') ||
    query.includes('create account') ||
    query.includes('company portal') ||
    query.includes('external portal') ||
    query.includes('workday') ||
    query.includes('greenhouse') ||
    query.includes('lever') ||
    (query.includes('lead') && query.includes('account'))
  ) {
    return {
      response: `🏢 **External Company Site Redirections & Automated Account Creation**\n\nWhen a job application on LinkedIn or an aggregator leads to an external company career website requiring you to create an account (e.g. **Workday**, **Greenhouse**, **Lever**, or proprietary enterprise portals):\n\n1. **Automatic Detection**: The system detects that the listing requires an external company candidate account.\n2. **Automated Account Provisioning**: Antigravity automatically registers a candidate account on the company's portal using your verified email (\`candidate@example.com\`) and secure credentials.\n3. **Application Autofill & Submission**: Your candidate profile (name, contact, work authorization, relocation timeline) and bespoke tailored CV (\`Aya_CV_Company_Position_Date\`) are automatically populated and submitted.\n4. **Official Reference Tracking**: The system captures your official **Application Confirmation Reference Number** (e.g. \`APP-KLA-202611-9214\`).\n5. **Company Portal Vault**: All created company accounts are stored in your **Company Portal Vault** in [Settings](/settings) and [Application CRM](/crm) with direct login links so you can access your account at any time!`,
      quickLinks: [
        { label: '🏢 View Company Portal Vault in Settings', path: '/settings' },
        { label: '📊 Track in CRM', path: '/crm' },
        { label: '★ Career Control Center', path: '/control-center' }
      ],
      suggestedQuestions: [
        '⚡ How does auto-apply everywhere work?',
        '🔗 How does LinkedIn integration work?',
        '🛡️ What is the Approval Center?'
      ]
    };
  }

  // 0c-2. Dealing with LinkedIn Posts (Multi-Role Announcements with Direct Recruiter Email CTAs)
  if (
    query.includes('attached posts') ||
    query.includes('deal with posts') ||
    query.includes('posts like') ||
    query.includes('hiring post') ||
    query.includes('recruiter post') ||
    query.includes('ourshopee') ||
    (query.includes('post') && (query.includes('email') || query.includes('roles') || query.includes('linkedin')))
  ) {
    return {
      response: `📢 **How Antigravity Deals with Multi-Role LinkedIn Hiring Posts (e.g. Ourshopee Dubai)**\n\nWhen a recruiter or company shares an announcement listing multiple open positions with an email address to send CVs to (like Ourshopee: Finance Manager, Category Manager, Buyer, Procurement Coordinator; direct email: \`mansi.deo@ourshopee.com\`):\n\n1. **AI Multi-Role Disaggregation**: The post is parsed and split into separate, distinct vacancies. Each position (title, years of experience, mandatory qualifications like CA or UAE experience, location: Dubai, work mode: On-site) is extracted and individually indexed.\n2. **Direct Recruiter Contact Extraction**: The parser captures the recruiter's name (\`Mansi Deo\`) and destination email (\`mansi.deo@ourshopee.com\`).\n3. **Candidate Matching**: The platform scores each extracted position against your career profile to identify which roles fit your experience and location preferences.\n4. **Bespoke Version B CV**: A job-specific tailored CV is created (e.g. \`Aya_CV_Ourshopee_FinanceManager_Date\`).\n5. **Direct Recruiter Application Email**: An introduction cover email is automatically drafted referencing the LinkedIn post, highlighting your relevant qualifications, confirming on-site availability, and attaching your tailored CV.\n6. **Autonomous Auto-Apply or Human Approval**: With one click, the application is dispatched directly to the recruiter's inbox and logged in your Application CRM and Mailbox!`,
      quickLinks: [
        { label: '📥 Paste & Parse LinkedIn Post in Discovery', path: '/discovery' },
        { label: '★ Career Control Center', path: '/control-center' },
        { label: '📬 Recruitment Mailbox', path: '/inbox' }
      ],
      suggestedQuestions: [
        '⚡ How does auto-apply everywhere work?',
        '🏢 What if LinkedIn leads to a company site to create an account?',
        '📊 How does the Application CRM work?'
      ]
    };
  }

  // 0d. LinkedIn Integration & Recruiter SEO
  if (
    query.includes('linkedin') ||
    query.includes('linkedin integration') ||
    query.includes('oauth')
  ) {
    return {
      response: `🔗 **LinkedIn Integration & Recruiter SEO Engine**\n\nThe platform integrates directly with LinkedIn to maximize your recruiter visibility:\n\n- **External Service Integration**: Manage OAuth 2.0 credentials and profile URL under [Settings](/settings).\n- **Recruiter SEO Optimization**: Generates copy-ready headlines (SEO keyword dense, impact-focused, role-centric) and About section under [LinkedIn Optimization](/linkedin).\n- **Profile Synchronization**: Synchronizes 18+ technical skills and target roles directly with the LinkedIn Recruiter search index.\n- **Apply Everywhere**: Discovers and applies to verified LinkedIn listings (e.g. Delivery Hero Berlin, Careem Dubai) on your behalf.`,
      quickLinks: [
        { label: '⚙️ Configure LinkedIn in Settings', path: '/settings' },
        { label: '📈 Open LinkedIn Optimizer', path: '/linkedin' }
      ],
      suggestedQuestions: [
        '⚡ How does auto-apply work?',
        '🎯 How does job matching score work?'
      ]
    };
  }

  // 1. Getting Started & How to Use
  if (
    query.includes('get started') ||
    query.includes('how to start') ||
    query.includes('new user') ||
    query.includes('where to start') ||
    query.includes('tutorial') ||
    query.includes('guide me') ||
    query.includes('how does it work')
  ) {
    return {
      response: `👋 **Welcome to Antigravity AI Career Management!**\n\nThe fastest way to get started is our **CV-First Autonomous Workflow**:\n\n1. **Upload your CV** (PDF, DOCX, or TXT) on the **Dashboard** — no lengthy questionnaire needed!\n2. **AI Instant Analysis**: The system extracts your experience, calculates your ATS score, and generates an improved **Master CV (Version B)**.\n3. **Confirm 5 Essential Questions**: Confirm your target countries, relocation options, visa needs, salary, and work mode.\n4. **Automatic Discovery**: Verified vacancies are fetched and scored against your profile using our transparent 8-criterion matching engine.\n5. **Review & Approve**: Tailored application packages are prepared for your review in the **Approval Center** before any dispatch!`,
      quickLinks: [
        { label: '🚀 Start on Dashboard', path: '/' },
        { label: '★ Career Control Center', path: '/control-center' },
        { label: '📝 Mandatory Onboarding', path: '/onboarding' }
      ],
      suggestedQuestions: [
        '📄 Where do I upload my CV?',
        '🎯 How does job matching score work?',
        '🛡️ What is the Approval Center?'
      ]
    };
  }

  // 2. CV Upload & Version Management
  if (
    query.includes('upload') ||
    query.includes('cv') ||
    query.includes('resume') ||
    query.includes('version b') ||
    query.includes('master cv')
  ) {
    return {
      response: `📄 **CV Upload & Dual Version System**\n\n- **Where to upload**: Directly on the [Dashboard](/) or [Resume Studio](/resumes).\n- **Formats supported**: **PDF**, **Word (DOCX)**, or **Plain Text (TXT)**.\n- **Dual Version Integrity**:\n  - **Version A (Original)**: Kept read-only on disk and never altered or overwritten.\n  - **Version B (AI-Optimized Master CV)**: Rewritten into achievement-oriented statements (XYZ formula), ATS keyword optimization, and zero fabricated facts!\n- **Tailored CVs**: When applying to a specific role, packages are strictly named \`Aya_CV_Company_Position_Date.pdf\`.`,
      quickLinks: [
        { label: 'Upload CV on Dashboard', path: '/' },
        { label: 'Inspect Resume Studio', path: '/resumes' },
        { label: 'Run ATS Analyzer', path: '/ats-analyzer' }
      ],
      suggestedQuestions: [
        '🎯 How does the ATS score work?',
        '🚀 What are the 5 essential questions?',
        '🛡️ What is the Approval Center?'
      ]
    };
  }

  // 3. Target Countries & Relocation Options
  if (
    query.includes('country') ||
    query.includes('countries') ||
    query.includes('relocation') ||
    query.includes('timeline') ||
    query.includes('location') ||
    query.includes('visa')
  ) {
    return {
      response: `🌍 **Target Countries & Relocation Parameters**\n\n- **Target Countries Multi-Select Dropdown**:\n  - We **never assume** your target markets. You can select multiple countries using our interactive dropdown.\n  - Use quick regional presets like **+ Top Markets (EMEA & Remote)**, **+ GCC**, or **+ Europe**, or type any custom country.\n- **Relocation Options & Timelines**:\n  1. **Relocation immediately**\n  2. **Less than 1 month**\n  3. **1: 3 months** (1 to 3 months)\n  4. **No relocation** (Remote or local only)\n- **Visa Sponsorship**: Specify whether relocation requires visa sponsorship, which directly adjusts your opportunity score!`,
      quickLinks: [
        { label: 'Set Countries on Dashboard', path: '/' },
        { label: 'Update Career Profile', path: '/profile' },
        { label: 'View Discovery Vacancies', path: '/discovery' }
      ],
      suggestedQuestions: [
        '🎯 How does job matching score work?',
        '🚀 How do I get started?',
        '💼 Where are the job listings from?'
      ]
    };
  }

  // 4. Job Matching Engine & 8 Criteria
  if (
    query.includes('match') ||
    query.includes('score') ||
    query.includes('ranking') ||
    query.includes('criteria') ||
    query.includes('top 10') ||
    query.includes('algorithm')
  ) {
    return {
      response: `🎯 **Transparent 8-Criterion Weighted Matching Engine**\n\nEvery vacancy is scored from 0% to 100% using an exact mathematical formula:\n\n1. **Core Skills & Technical Stack (25%)** — Direct match against verified technical capabilities.\n2. **Seniority Alignment (15%)** — Lead, Staff, Senior vs. job seniority tier.\n3. **Target Industry Match (15%)** — FinTech, Cloud, AI, E-Commerce, Developer Tools.\n4. **Compensation Alignment (15%)** — Meets or exceeds your minimum annual USD expectation.\n5. **Location & Relocation (10%)** — Alignment with your target countries and relocation willingness.\n6. **Visa Sponsorship (10%)** — Employer visa support matches your sponsorship requirement.\n7. **Job Description Quality (5%)** — Clarity, role definition, and team signals.\n8. **Publication Recency (5%)** — Prioritizes newly listed vacancies.\n\n*Note: Excluded companies drop the match score to 0% immediately.*`,
      quickLinks: [
        { label: 'View Top 10 Opportunities', path: '/top-opportunities' },
        { label: 'Job Discovery Engine', path: '/discovery' },
        { label: 'Career Control Center', path: '/control-center' }
      ],
      suggestedQuestions: [
        '🛡️ What is the Approval Center?',
        '📄 Where do I upload my CV?',
        '📊 How does the Application CRM work?'
      ]
    };
  }

  // 5. Human Approval Center & Safety Gating
  if (
    query.includes('approval') ||
    query.includes('safety') ||
    query.includes('auto-apply') ||
    query.includes('send') ||
    query.includes('human') ||
    query.includes('gate')
  ) {
    return {
      response: `🛡️ **Human Approval Center — Zero Autonomous Submissions**\n\n- **Strict Safety Gate**: Antigravity **NEVER** sends an email, recruiter message, or job application automatically.\n- **Preparation**: The AI prepares the complete application package (tailored CV, personalized cover letter, screening answers, and disclosures).\n- **Human Verification**: You inspect every field in the **Approval Center**.\n- Only when you click **Approve** or **Confirm** is the application marked ready or the recruiter email dispatched!`,
      quickLinks: [
        { label: 'Open Approval Center', path: '/approvals' },
        { label: 'Inspect Application Workspace', path: '/applications' },
        { label: 'Review Security Controls', path: '/settings' }
      ],
      suggestedQuestions: [
        '📊 How does the Application CRM work?',
        '📬 How does the Recruitment Inbox work?',
        '🎯 How does job matching score work?'
      ]
    };
  }

  // 6. Recruitment Inbox & Email Drafting
  if (
    query.includes('inbox') ||
    query.includes('email') ||
    query.includes('gmail') ||
    query.includes('recruiter') ||
    query.includes('draft')
  ) {
    return {
      response: `📬 **Recruitment Inbox & Intelligent Email Drafter**\n\n- **Categorized Threads**: Automatically separates recruiter inquiries into **Interview Requests**, **Offers**, **Coding Assessments**, and **Application Updates**.\n- **AI Reply Drafting**: Generates professional, tailored responses matching your compensation expectations and notice period.\n- **Dual Confirmation**: Even drafted replies require your explicit click on **Send Confirmed Email** before outbound transmission!`,
      quickLinks: [
        { label: 'Open Recruitment Inbox', path: '/inbox' },
        { label: 'View Application CRM', path: '/crm' },
        { label: 'Configure Mailbox Settings', path: '/settings' }
      ],
      suggestedQuestions: [
        '📊 How does the Application CRM work?',
        '🛡️ What is the Approval Center?',
        '🕒 What is the 11 PM Cairo Daily Report?'
      ]
    };
  }

  // 7. CRM & Pipeline Stages
  if (
    query.includes('crm') ||
    query.includes('kanban') ||
    query.includes('pipeline') ||
    query.includes('status') ||
    query.includes('stages')
  ) {
    return {
      response: `📊 **Application CRM & Kanban Pipeline**\n\n- **15 Lifecycle Stages**: From *Identified* and *Tailoring* to *Approval Pending*, *Applied*, *Screening*, *Interview*, *Offer*, and *Hired*.\n- **Dual Views**: Interactive drag-ready **Kanban Board** and searchable **Relational Table**.\n- **Data Portability**: One-click **Export to CSV** and **Export to JSON** anytime!`,
      quickLinks: [
        { label: 'Open Application CRM', path: '/crm' },
        { label: 'Review Analytics & Reports', path: '/reports' },
        { label: 'View Control Center CRM Tab', path: '/control-center' }
      ],
      suggestedQuestions: [
        '🕒 What is the 11 PM Cairo Daily Report?',
        '🛡️ What is the Approval Center?',
        '🔒 How do I export or wipe my data?'
      ]
    };
  }

  // 8. Daily Executive Report & Africa/Cairo Timezone
  if (
    query.includes('daily') ||
    query.includes('cairo') ||
    query.includes('report') ||
    query.includes('timezone') ||
    query.includes('11') ||
    query.includes('schedule')
  ) {
    return {
      response: `🕒 **Daily 11:00 PM Africa/Cairo Executive Briefing**\n\n- Every evening at **11:00 PM (Africa/Cairo time)**, Antigravity aggregates:\n  - New matching vacancies discovered across Remote and EMEA boards\n  - Applications awaiting your approval in the Approval Center\n  - New recruiter messages and scheduling requests\n  - Active CRM interview pipelines and next steps\n- Live clock in the top navigation bar displays real-time Cairo local time!`,
      quickLinks: [
        { label: 'View Daily Reports', path: '/reports' },
        { label: 'Career Control Center (Daily Tab)', path: '/control-center' }
      ],
      suggestedQuestions: [
        '📊 How does the Application CRM work?',
        '🚀 How do I get started?',
        '🔒 How do I export or wipe my data?'
      ]
    };
  }

  // 9. Security, GDPR & Data Purge
  if (
    query.includes('security') ||
    query.includes('gdpr') ||
    query.includes('export') ||
    query.includes('delete') ||
    query.includes('wipe') ||
    query.includes('privacy')
  ) {
    return {
      response: `🔒 **Security Controls & GDPR Rights**\n\n- **SQL Injection Shield**: 100% prepared parameterized queries via SQLite.\n- **Prompt Injection Firewall**: Untrusted job postings and emails pass through adversarial regex filters.\n- **GDPR Portability**: Download a complete JSON archive of all your candidate records and audit logs anytime.\n- **Right to Be Forgotten**: Permanently wipe all your data from the database with confirmation phrase \`DELETE ALL MY DATA\`.`,
      quickLinks: [
        { label: 'Settings & Security Page', path: '/settings' },
        { label: 'Download GDPR JSON Export', path: '/api/security/export' }
      ],
      suggestedQuestions: [
        '🛡️ What is the Approval Center?',
        '🚀 How do I get started?',
        '📄 Where do I upload my CV?'
      ]
    };
  }

  // Context-aware fallback based on current route
  let contextTip = '';
  if (currentPath === '/approvals') {
    contextTip = `\n\n💡 *Tip for this page*: You are on the **Approval Center**. Review and click **Approve Application** to release application packages to the CRM stage.`;
  } else if (currentPath === '/control-center') {
    contextTip = `\n\n💡 *Tip for this page*: You are on the **Career Control Center**. Use the top 10 tabs to inspect every phase of your career pipeline in one unified dashboard.`;
  } else if (currentPath === '/discovery') {
    contextTip = `\n\n💡 *Tip for this page*: You are in **Job Discovery**. Click **Run Aggregator Sync** to scan RemoteOK, Bayt, Indeed, and Wuzzuf for newly posted roles.`;
  } else if (currentPath === '/top-opportunities') {
    contextTip = `\n\n💡 *Tip for this page*: Click **Prepare Application** on any of your Top 10 matches to auto-tailor your CV and cover letter.`;
  }

  return {
    response: `I'm here to help you get the most out of **Antigravity AI Career Management**! 🚀${contextTip}\n\nHere are some popular topics you can explore:\n- **CV-First Workflow**: Upload your CV on the Dashboard to get instant scores and jobs without lengthy surveys.\n- **Opportunity Matching**: How our 8-criterion weighted engine scores and ranks vacancies.\n- **Approval Center**: How human-in-the-loop gating protects your career.\n- **CRM & Inbox**: Tracking interviews and managing recruiter replies.`,
    quickLinks: [
      { label: '🚀 Dashboard (CV Upload)', path: '/' },
      { label: '★ Career Control Center', path: '/control-center' },
      { label: '🎯 Top Opportunities', path: '/top-opportunities' }
    ],
    suggestedQuestions: DEFAULT_SUGGESTED_QUESTIONS.slice(0, 4)
  };
}
