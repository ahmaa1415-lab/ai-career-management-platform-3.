# IMPLEMENTATION PLAN: AI Career Management & Job Search Application

## 1. Project Goal
Deliver a fully functioning, locally hosted, persistent, production-grade AI Career Management Application with 14 functional modules, rigid onboarding gates, recruiter/ATS intelligence, multi-source job discovery, weighted matching engine, human-in-the-loop application workflow, recruitment CRM, Gmail recruitment mailbox, and daily Cairo-time reporting.

---

## 2. Implementation Milestones

### Milestone 1: Core Engine & Persistent Database (Phases 0 & 1)
- **Target**: Set up Next.js App Router, Tailwind CSS configuration, SQLite database schema with `better-sqlite3`, migrations, and global UI shell.
- **Deliverables**:
  - `lib/db.ts`: SQLite database with schema tables for Profiles, Resumes, Jobs, Applications, Approvals, Emails, AuditLogs, Reports.
  - `lib/auth.ts`: Session tokens and user security context.
  - Global navigation sidebar with 14 modules:
    1. Dashboard
    2. Career Profile
    3. Onboarding
    4. Resume Studio
    5. ATS Analyzer
    6. LinkedIn Optimization
    7. Job Discovery
    8. Top 10 Opportunities
    9. Application Workspace
    10. Approval Center
    11. Recruitment Inbox
    12. Application CRM
    13. Analytics & Reports
    14. Settings & Security
- **Verification**: Database migration executes cleanly; all 14 routes load with responsive components, headers, and navigation states.

### Milestone 2: Mandatory Onboarding & Gating (Phase 2)
- **Target**: Block all job discovery and application processing until Onboarding is 100% complete.
- **Deliverables**:
  - Multi-step onboarding form with validation:
    - Step 1: Professional identity, CV upload/text, LinkedIn profile, experience, achievements, education, skills.
    - Step 2: Location questions (**Explicit**: target countries, target cities, relocation willingness, timeline, visa requirements, remote eligibility).
    - Step 3: Explicit permissions (Job research, CV analysis, Gmail connection, email drafting, email sending, application submission, data disclosure, automated scheduling).
  - Profile confirmation screen & gatekeeper middleware/hooks.
- **Verification**: Accessing Job Discovery or Application Workspace before onboarding redirects or renders an explicit gating warning with zero mock bypass.

### Milestone 3: CV & LinkedIn Intelligence (Phase 3)
- **Target**: Recruiter and ATS evaluation engines, skills gap analysis, tailored CV versions, and LinkedIn optimizer.
- **Deliverables**:
  - `lib/ai/ats-analyzer.ts`: Exact keyword density, formatting score, experience relevance, country-specific advice (US, UK, EU, Gulf/MENA formats).
  - `lib/ai/resume-tailorer.ts`: Master CV vs Tailored CV generator, cover letter generator, screening questions answers.
  - `lib/ai/linkedin-optimizer.ts`: Headline, About, Experience bullet rewrites, search keyword index.
- **Verification**: Unit tests on parsing, scoring logic, keyword gap detection, and copy-ready output rendering.

### Milestone 4: Real Job Discovery & Matching Engine (Phases 4 & 5)
- **Target**: Real job aggregation from accessible sources (Remote boards, Bayt, Indeed, GulfTalent, Wuzzuf, Wellfound) and 8-criterion weighted scoring.
- **Deliverables**:
  - `lib/jobs/aggregator.ts`: Multi-source job scraper/aggregator querying live endpoints and real indexed listings.
  - Deduplication engine (fuzzy company + title + location matching).
  - `lib/jobs/matcher.ts`: Exact weighted scoring algorithm:
    - Skills & Experience: 25%
    - Seniority: 15%
    - Industry: 15%
    - Salary: 15%
    - Location & Relocation: 10%
    - Visa Sponsorship: 10%
    - Employer Quality: 5%
    - Recency: 5%
  - Top 10 Opportunities ranked view with transparent score breakdown and missing criteria explanations.
- **Verification**: Run job search against user parameters; inspect returned jobs, deduplication, and mathematical correctness of weighted scores.

### Milestone 5: Application Workflow & Human Approval Center (Phase 6)
- **Target**: 14-step preparation pipeline with strict human approval gates.
- **Deliverables**:
  - Tailored package preview: Tailored CV, Cover Letter, Answers to Screening Questions, Personal Data Disclosure list.
  - Approval Center (`/approvals`): Approve, Reject, or Modify packages.
  - Zero unauthorized submissions: explicit audit log entry for every approval.
- **Verification**: Application cannot transition from `Approval Pending` to `Applied` or `Ready to Apply` without explicit user action recorded in database.

### Milestone 6: Gmail Integration & Recruitment Inbox (Phase 7)
- **Target**: Dedicated recruitment mailbox with classification, draft generation, and send protection.
- **Deliverables**:
  - OAuth status checker and connection configuration.
  - Sandbox/Mock connector with realistic recruiter threads when external OAuth credentials are not provided.
  - Email categorization: Job Opportunity, Recruiter Message, Application Confirmation, Interview, Assessment, Offer, Rejection, Follow-up.
  - Draft generation (Reply, Interview Thank You, Follow-up) strictly in draft mode. Send button disabled without confirmation.
- **Verification**: Inbox loads categorized emails; drafting produces clean email templates; sending requires dual-confirmation.

### Milestone 7: Recruitment CRM & Analytics (Phase 8)
- **Target**: Full-featured CRM with 15 pipeline stages, Kanban board, Table view, Calendar view, and Export.
- **Deliverables**:
  - Pipeline stages: Discovered → Qualified → Shortlisted → Tailored → Approval Pending → Ready to Apply → Applied → Confirmation Received → Follow-up → Interview → Assessment → Offer → Negotiation → Hired / Rejected / Closed.
  - Interactive drag-and-drop or status selector, search, filter, tags, recruiter contact details.
  - CSV/JSON export capability.
- **Verification**: Status transitions persist across page reloads in SQLite database.

### Milestone 8: Automation, Daily Reporting & Security (Phases 9 & 10)
- **Target**: 11:00 PM Cairo scheduler, comprehensive daily summary generator, security defenses.
- **Deliverables**:
  - Daily report generator summarizing metrics, top matches, actions taken, blockers, and next day priorities.
  - Security suite: Input sanitization, Prompt Injection firewall for AI inputs, CSRF tokens, Audit Logging table.
- **Verification**: Run report generator via API; verify correct timezone calculation (Africa/Cairo UTC+2); test prompt injection defenses with adversarial payloads.

### Milestone 9: End-to-End Automated Testing & Delivery (Phases 11-13)
- **Target**: Automated test suite executing all feature tests; project documentation; user guide.
- **Verification**: Automated test script exits with code 0; all test logs recorded in `TESTING_PLAN.md`.
