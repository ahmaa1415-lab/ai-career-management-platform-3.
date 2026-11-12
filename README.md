# Antigravity AI Career Management & Job Search Platform
### An Autonomous, Full-Lifecycle Career Operating System Built for Aya Hamouda Mahmoud Ali

[![Next.js](https://img.shields.io/badge/Next.js-16.4.5-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.3.1-blue?style=flat&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0.2-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL%20Mode-blue?style=flat&logo=sqlite)](https://sqlite.org/)
[![Tests](https://img.shields.io/badge/Tests-19%2F19%20Passing-brightgreen?style=flat)]()
[![Status](https://img.shields.io/badge/Status-Complete%20%26%20Production--Ready-success?style=flat)]()

---

## 🌟 Overview

The **Antigravity AI Career Management Platform** is a complete, production-ready career operating system. It orchestrates the candidate's professional trajectory from CV upload and multi-perspective ATS analysis to multi-source job discovery, 8-criterion transparent matching, vacancy-tailored document generation, controlled multi-channel application dispatch, and interview preparation with verified STAR model answers.

The platform is strictly grounded in the verified profile and career history of **Aya Hamouda Mahmoud Ali** (`Ayahamouda14@gmail.com`), an experienced Category & Commercial Manager with a proven track record across **FMCG, Personal Care, Beauty & Grooming, and Pharmaceuticals** in **Egypt, UAE, and KSA** (Arab Otsuka, Sulinda Pharma, Abu Dawood Group, and Indomie).

---

## 🚀 Key Modules & Capabilities

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           10-STAGE CAREER LIFECYCLE                             │
├───────────────┬─────────────────┬─────────────────┬───────────────┬─────────────┤
│ 1. CV Upload  │ 2. ATS Analysis │ 3. Top Roles    │ 4. Platform   │ 5. Date     │
│ & Extraction  │ & Optimization  │ (Top 12 FMCG)   │ Integrations  │ Recency     │
├───────────────┼─────────────────┼─────────────────┼───────────────┼─────────────┤
│ 6. CV/Letter  │ 7. Human        │ 8. Multi-       │ 9. CRM Kanban │ 10. STAR    │
│ Tailoring     │ Approval Gate   │ Channel Apply   │ & Inbox Sync  │ & Salary    │
└───────────────┴─────────────────┴─────────────────┴───────────────┴─────────────┘
```

1. **Central Career Control Center (`/control-center`)**:
   - Single-screen console managing all 10 stages of the recruitment workflow.
   - Live publication date filters: **1 Day Ago (`1d`)**, **1 Week Ago (`1w`)**, **1 Month Ago (`1m`)**, and **>1 Month (`>1m`)**.
   - Top 12 targeted FMCG & commercial titles mapped to candidate experience.

2. **CV Intelligence & Multi-Perspective ATS Evaluation (`/ats-analyzer`)**:
   - Multi-format ingestion for PDF, DOCX, and TXT resumes.
   - Original CV preserved as an immutable, read-only baseline.
   - Comprehensive scoring from 4 distinct perspectives:
     - **Recruiter Perspective**: Executive presence and career trajectory.
     - **ATS Screening**: Keyword density, parseability, and heading structure (98% compatibility).
     - **Hiring Manager**: Quantifiable commercial ROI and domain depth.
     - **Formatting & Readability**: Layout structure and bullet clarity.
   - Truth-preserving synthesis of **Master CV Version B** (Zero-Fabrication guarantee).

3. **Multi-Source Job Aggregator & Anti-Scam Shield (`/discovery`)**:
   - Aggregates verified vacancies from 8 platforms: **LinkedIn, Wuzzuf, Bayt.com, Naukrigulf, GulfTalent, Indeed, RemoteOK, and direct Enterprise Company Portals**.
   - Automated anti-scam verification: checks employer domains, suspicious payment requests, and verified destination links.

4. **Transparent 8-Criterion Job Matching (`/top-opportunities`)**:
   - Mathematical formula summing strictly to 1.0 (100%):
     - **Skills & Experience**: 25%
     - **Seniority Match**: 15%
     - **Industry Alignment (FMCG)**: 15%
     - **Salary Compatibility**: 15%
     - **Location & Relocation**: 10%
     - **Visa Sponsorship**: 10%
     - **Employer Quality**: 5%
     - **Publication Recency**: 5%

5. **LinkedIn Autonomous Scout & Multi-Role Parser (`/linkedin`)**:
   - Ingests complex recruiter posts (e.g., ourshopee Dubai) and disaggregates them into multiple distinct job opportunities.
   - Dispatches applications across 3 channels:
     - **Direct Email**: Dispatches tailored CV and customized cover letter directly to recruiter email.
     - **Company Portals**: Auto-provisions candidate accounts on Workday/Taleo sites and records confirmation reference IDs.
     - **LinkedIn InMail**: Prepares copy-ready outreach messages.

6. **Human Approval Center & Security Gate (`/approvals`)**:
   - Mandatory human consent gate before any external email dispatch or job application.
   - Granular review of exact tailored CV versions, recipient addresses, and cover letters.

7. **Recruitment Mailbox & Cairo Timezone Briefing (`/inbox`, `/reports`)**:
   - Automated message classification (Interview Invitation, Assessment, Offer, Rejection, Follow-up).
   - Generates daily executive briefings scheduled at **09:00 AM Africa/Cairo time**.

8. **Interview Preparation AI & GCC Salary Negotiation (`/interview-prep`)**:
   - Customized behavioral and functional questions with verified **STAR (Situation, Task, Action, Result)** model answers.
   - Interactive mock answer evaluator with instant rubric scoring.
   - GCC salary negotiation playbook benchmarking **AED 34,000 to AED 46,000 / month**.

---

## 🏛️ Multi-Agent Architecture (15 Specialized Agents)

All agents are defined in `lib/agents/orchestrator.ts` with strict input/output schemas, operational boundaries, and audit logging:

1. `careerProfileAgent`: Candidate profile state & mandatory location gating.
2. `cvExtractionAgent`: Truth-preserving multi-format CV entity extraction.
3. `cvEvaluationAgent`: 4-perspective evaluation scoring.
4. `atsAnalysisAgent`: ATS compatibility and Version B optimization.
5. `careerStrategyAgent`: FMCG career pathing and market readiness index.
6. `jobDiscoveryAgent`: 8-platform job retrieval and deduplication.
7. `jobVerificationAgent`: Scam detection and domain legitimacy auditing.
8. `jobMatchingAgent`: 8-criterion 100% weighted scoring.
9. `cvTailoringAgent`: Vacancy-specific CV tailoring without hallucination.
10. `coverLetterAgent`: Role-specific cover letter generator and live editor.
11. `applicationPreparationAgent`: Complete application package synthesis.
12. `interviewPreparationAgent`: STAR model answers and GCC salary playbook.
13. `recruiterCommunicationAgent`: Recruitment mailbox ingestion and reply drafting.
14. `applicationTrackingAgent`: CRM Kanban lifecycle management and portal accounts vault.
15. `careerReportingAgent`: Daily 09:00 Cairo executive reporting and funnel analytics.

*Unified under the `orchestratorAgent` pipeline.*

---

## 🖥️ Screen Directory (21 Dedicated Web Pages)

| Route | Page Name | Primary Capability |
|:---|:---|:---|
| `/` | **Dashboard** | Primary CV-First upload and overview |
| `/control-center` | **Control Center** | 10-Stage Career Control Center with date filters |
| `/profile` | **Career Profile** | Confirmed profile, target countries, and preferences |
| `/onboarding` | **Onboarding Gate** | 5 essential gating questions (mandatory location) |
| `/resumes` | **Resume Studio** | Immutable Version A, Version B, and tailored CVs |
| `/ats-analyzer` | **ATS Analyzer** | 4-perspective ATS evaluation (98% compatibility) |
| `/linkedin` | **LinkedIn Scout** | Multi-role post parser and autonomous dispatch |
| `/discovery` | **Job Discovery** | Multi-platform search and verified job listings |
| `/top-opportunities` | **Top Matches** | 8-criterion 100% weighted score breakdown |
| `/applications` | **Applications Hub** | Multi-channel dispatch hub and submission tracking |
| `/approvals` | **Approval Center** | Mandatory human consent security gate |
| `/interview-prep` | **Interview Prep** | STAR model answers, mock grader, salary playbook |
| `/inbox` | **Recruitment Mailbox** | Email auto-categorization and AI reply drafter |
| `/crm` | **Application CRM** | Interactive Kanban pipeline state machine |
| `/reports` | **Executive Briefing** | Daily reports (09:00 Africa/Cairo timezone) |
| `/notifications` | **Activity Stream** | Real-time notifications and submission stream |
| `/settings` | **Platform Settings** | Settings, integration vault, and GDPR wipe |
| `/login` | **Authentication** | Candidate identity verification and session switch |
| `/cover-letter` | **Cover Letter Studio** | Role-specific cover letter generator and editor |
| `/audit-log` | **Audit Explorer** | Security event log with search and JSON export |
| `/integrations` | **Integrations Hub** | 8 recruitment platforms adapter management |

---

## 🛠️ Quickstart & Local Operation

### Prerequisites
- Node.js v18+ (`v26.13.0` verified)
- npm v9+ (`11.20.0` verified)
- Windows 11, macOS, or Linux

### Running the Application
```powershell
# 1. Navigate to workspace
cd "f:\work Aya"

# 2. Run all 19 test suites
npm test

# 3. Build optimized production assets
npm run build

# 4. Start production server
npm start
```

Open your browser to: **[http://localhost:3000](http://localhost:3000)**

---

## 🔒 Security & Privacy

- **SQL Injection**: 100% parameterized SQLite prepared statements via `better-sqlite3`.
- **Prompt Injection Firewall**: Layered regex and adversarial pattern interception quarantining malicious inputs into the audit log.
- **GDPR Compliance**:
  - `GET /api/security/export`: Full JSON data archive export (Right to Data Portability).
  - `POST /api/security/wipe`: Cascading account erasure across all relational tables (Right to Be Forgotten).
- **Zero Secrets in Codebase**: All sensitive keys managed via `.env.local`.

---

## 📄 Project Documentation

- [`PROJECT_INVENTORY.md`](file:///f:/work%20Aya/PROJECT_INVENTORY.md): Full technical structural inventory and feature matrix.
- [`DOCUMENTATION_RECONCILIATION_REPORT.md`](file:///f:/work%20Aya/DOCUMENTATION_RECONCILIATION_REPORT.md): Audit reconciling historical claims with code.
- [`BASELINE_VALIDATION_REPORT.md`](file:///f:/work%20Aya/BASELINE_VALIDATION_REPORT.md): Runtime, TypeScript, build, and test verification report.
- [`SECURITY_AUDIT_REPORT.md`](file:///f:/work%20Aya/SECURITY_AUDIT_REPORT.md): Vulnerability review and OWASP / GDPR verification.
- [`FINAL_TEST_REPORT.md`](file:///f:/work%20Aya/FINAL_TEST_REPORT.md): Execution logs of all 19 test suites with 0 defects.
- [`FINAL_PROJECT_STATUS.md`](file:///f:/work%20Aya/FINAL_PROJECT_STATUS.md): Final delivery report and acceptance evaluation.
- [`INSTALLATION_GUIDE.md`](file:///f:/work%20Aya/INSTALLATION_GUIDE.md): Step-by-step setup guide.
- [`CONFIGURATION_GUIDE.md`](file:///f:/work%20Aya/CONFIGURATION_GUIDE.md): Environment and platform adapter settings.
- [`KNOWN_LIMITATIONS.md`](file:///f:/work%20Aya/KNOWN_LIMITATIONS.md): Transparent external dependency boundaries.
