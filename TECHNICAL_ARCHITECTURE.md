# TECHNICAL ARCHITECTURE: AI Career Management Application

## 1. System Overview

```
+-----------------------------------------------------------------------------------+
|                                  USER BROWSER                                     |
|  React 19 / Next.js Client Components (Tailwind CSS, Lucide Icons, Accessible UI) |
+-----------------------------------------------------------------------------------+
                                         |
                                         | HTTP / JSON / SSE
                                         v
+-----------------------------------------------------------------------------------+
|                               NEXT.JS SERVER CORE                                 |
|                                                                                   |
|  +-------------------+  +-------------------+  +-------------------------------+  |
|  |   App Router UI   |  |   API Endpoints   |  |     Security & Auth Filter    |  |
|  |  (14 Core Pages)  |  |  (/api/* Routes)  |  |  (Input Sanitizer / CSRF)     |  |
|  +-------------------+  +-------------------+  +-------------------------------+  |
|                                         |                                         |
|  +-----------------------------------------------------------------------------+  |
|  |                              BUSINESS LOGIC                                 |  |
|  |  - Gating & Onboarding Engine        - 8-Criterion Matcher (25/15/.../5%)   |  |
|  |  - ATS Scoring & Keyword Analyzer   - Multi-Source Job Discovery Scraper   |  |
|  |  - CV & Cover Letter Tailorer        - Human Approval Gatekeeper            |  |
|  |  - LinkedIn Profile Optimizer        - Recruitment CRM Pipeline Engine      |  |
|  |  - Daily Report Generator (Cairo TZ) - AI Prompt-Injection Sanitizer        |  |
|  +-----------------------------------------------------------------------------+  |
|                                         |                                         |
|  +-----------------------------------------------------------------------------+  |
|  |                         PERSISTENCE & DATA ACCESS                           |  |
|  |  better-sqlite3: data/career_app.db (WAL Mode, ACID Transactions, Pragma FK)|  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
       |                                                            |
       v                                                            v
+-----------------------------+              +--------------------------------------+
|       LOCAL DISK / OS       |              |         EXTERNAL SERVICES            |
| - data/career_app.db        |              | - Real Web Search / Job Feeds        |
| - uploads/cv_documents/     |              | - Google OAuth2 & Gmail API (Client) |
| - exports/daily_reports/    |              | - Modular LLM Engine (Gemini / Local)|
+-----------------------------+              +--------------------------------------+
```

---

## 2. Technology Stack & Decision Rationale

| Layer | Selected Technology | Alternative Considered | Selection Rationale |
|---|---|---|---|
| **Frontend & Backend** | Next.js 15+ (App Router) | Vite + Express | Single unified full-stack TypeScript framework, server actions, zero-latency server-side rendering, and integrated API routing. |
| **Language** | TypeScript 5+ | Plain JavaScript | Strict static typing across database entities, API contracts, and matching algorithms to prevent runtime defects. |
| **Styling** | Tailwind CSS 3.4+ | Vanilla CSS / CSS Modules | Rapid, responsive, professional layout composition with strict design token consistency. |
| **Database** | SQLite via `better-sqlite3` | PostgreSQL / MySQL | Full ACID compliance, lightning-fast synchronous operations, zero external daemons required, resilient local file persistence (`data/career_app.db`). |
| **Authentication** | Encrypted Cookie Session | Third-party Auth0/Clerk | Self-contained, works 100% locally without external cloud dependencies or API keys. |
| **AI Orchestration** | Modular Engine (Rules + NLP + Adapter) | Raw LLM API call | Resilient offline rule-based scoring (exact deterministic percentages) paired with pluggable AI adapters. Eliminates hallucinated scores. |

---

## 3. Database Schema Design (SQLite)

### Table: `users`
- `id` (TEXT PRIMARY KEY)
- `email` (TEXT UNIQUE NOT NULL)
- `full_name` (TEXT NOT NULL)
- `created_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)
- `updated_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

### Table: `profiles`
- `id` (TEXT PRIMARY KEY)
- `user_id` (TEXT NOT NULL REFERENCES users(id))
- `onboarding_completed` (INTEGER DEFAULT 0)
- `headline` (TEXT)
- `summary` (TEXT)
- `current_status` (TEXT) -- Employed, Unemployed, Freelancer, Notice Period
- `experience_years` (REAL)
- `skills` (TEXT) -- JSON array of strings
- `languages` (TEXT) -- JSON array of strings
- `target_roles` (TEXT) -- JSON array of strings
- `target_industries` (TEXT) -- JSON array of strings
- `target_seniority` (TEXT) -- Junior, Mid, Senior, Lead, Director, VP, C-Level
- `min_salary` (INTEGER)
- `preferred_currency` (TEXT)
- `preferred_companies` (TEXT) -- JSON array
- `excluded_companies` (TEXT) -- JSON array
- `availability` (TEXT) -- Immediate, 1 Month, 2 Months, etc.
- `created_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)
- `updated_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

### Table: `profile_locations`
- `id` (TEXT PRIMARY KEY)
- `user_id` (TEXT NOT NULL REFERENCES users(id))
- `target_countries` (TEXT NOT NULL) -- JSON array (e.g. ["Egypt", "UAE", "Germany", "Remote"])
- `target_cities` (TEXT NOT NULL) -- JSON array (e.g. ["Cairo", "Dubai", "Berlin"])
- `relocation_willing` (INTEGER NOT NULL) -- 0 or 1
- `relocation_timeline` (TEXT) -- Immediate, 3 months, 6 months
- `visa_sponsorship_required` (INTEGER NOT NULL) -- 0 or 1
- `work_authorizations` (TEXT) -- JSON array
- `remote_eligibility` (TEXT) -- Global, EMEA, Egypt-only, US-only
- `work_mode_preference` (TEXT NOT NULL) -- Remote, Hybrid, Onsite, Any
- `updated_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

### Table: `profile_permissions`
- `id` (TEXT PRIMARY KEY)
- `user_id` (TEXT NOT NULL REFERENCES users(id))
- `job_research_authorized` (INTEGER DEFAULT 0)
- `cv_analysis_authorized` (INTEGER DEFAULT 0)
- `gmail_connected` (INTEGER DEFAULT 0)
- `read_emails_authorized` (INTEGER DEFAULT 0)
- `draft_emails_authorized` (INTEGER DEFAULT 0)
- `send_emails_authorized` (INTEGER DEFAULT 0)
- `submit_applications_authorized` (INTEGER DEFAULT 0)
- `disclose_data_authorized` (INTEGER DEFAULT 0)
- `scheduled_automation_desired` (INTEGER DEFAULT 0)
- `updated_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

### Table: `resumes`
- `id` (TEXT PRIMARY KEY)
- `user_id` (TEXT NOT NULL REFERENCES users(id))
- `title` (TEXT NOT NULL)
- `type` (TEXT NOT NULL) -- Master, Tailored, ATS, Role-Specific, Country-Specific
- `target_role` (TEXT)
- `target_country` (TEXT)
- `raw_text` (TEXT NOT NULL)
- `structured_json` (TEXT) -- JSON containing experience, education, skills, projects
- `ats_score` (REAL)
- `version` (INTEGER DEFAULT 1)
- `created_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

### Table: `job_listings`
- `id` (TEXT PRIMARY KEY)
- `employer` (TEXT NOT NULL)
- `title` (TEXT NOT NULL)
- `location` (TEXT NOT NULL)
- `source` (TEXT NOT NULL) -- LinkedIn, Indeed, Bayt, Wuzzuf, GulfTalent, Wellfound, Direct
- `source_url` (TEXT NOT NULL)
- `publication_date` (TEXT)
- `application_deadline` (TEXT)
- `salary_raw` (TEXT)
- `min_salary` (INTEGER)
- `max_salary` (INTEGER)
- `currency` (TEXT)
- `requirements` (TEXT) -- JSON array
- `experience_required_years` (REAL)
- `seniority` (TEXT)
- `visa_sponsorship` (TEXT) -- Yes, No, Unknown
- `remote_eligibility` (TEXT) -- Remote, Hybrid, Onsite
- `is_verified` (INTEGER DEFAULT 1)
- `raw_description` (TEXT)
- `created_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

### Table: `applications`
- `id` (TEXT PRIMARY KEY)
- `user_id` (TEXT NOT NULL REFERENCES users(id))
- `job_id` (TEXT NOT NULL REFERENCES job_listings(id))
- `status` (TEXT NOT NULL) -- Pipeline stage (Discovered ... Hired)
- `match_score` (REAL NOT NULL)
- `match_details_json` (TEXT NOT NULL) -- JSON with 8 criteria scores and reasoning
- `tailored_cv_id` (TEXT REFERENCES resumes(id))
- `cover_letter` (TEXT)
- `screening_responses` (TEXT) -- JSON key-value
- `disclosures_accepted` (INTEGER DEFAULT 0)
- `human_approved` (INTEGER DEFAULT 0)
- `approved_at` (DATETIME)
- `submission_type` (TEXT) -- Manual, Automated
- `submission_confirmed` (INTEGER DEFAULT 0)
- `applied_at` (DATETIME)
- `recruiter_name` (TEXT)
- `recruiter_email` (TEXT)
- `notes` (TEXT)
- `created_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)
- `updated_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

### Table: `emails`
- `id` (TEXT PRIMARY KEY)
- `application_id` (TEXT REFERENCES applications(id))
- `category` (TEXT NOT NULL) -- Opportunity, Recruiter Message, Confirmation, Interview, Assessment, Offer, Rejection, Followup
- `sender` (TEXT NOT NULL)
- `recipient` (TEXT NOT NULL)
- `subject` (TEXT NOT NULL)
- `body` (TEXT NOT NULL)
- `is_draft` (INTEGER DEFAULT 1)
- `is_sent` (INTEGER DEFAULT 0)
- `sent_at` (DATETIME)
- `created_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

### Table: `audit_logs`
- `id` (TEXT PRIMARY KEY)
- `user_id` (TEXT)
- `action` (TEXT NOT NULL) -- e.g. ONBOARDING_SUBMITTED, APPLICATION_APPROVED, EMAIL_DRAFTED, EMAIL_SENT
- `details` (TEXT) -- JSON details
- `ip_address` (TEXT)
- `timestamp` (DATETIME DEFAULT CURRENT_TIMESTAMP)

### Table: `daily_reports`
- `id` (TEXT PRIMARY KEY)
- `report_date` (TEXT NOT NULL)
- `timezone` (TEXT DEFAULT 'Africa/Cairo')
- `content_markdown` (TEXT NOT NULL)
- `metrics_json` (TEXT NOT NULL)
- `generated_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

---

## 4. Key Subsystem Architectures

### 4.1 Onboarding Gatekeeper
Every server action and client component checks `profiles.onboarding_completed`. If `0`, access to job search, application creation, and email drafting is prohibited with an HTTP 403 / UI gate.

### 4.2 8-Criterion Matching Engine
Formula:
$$\text{Score} = (S \times 0.25) + (L \times 0.15) + (I \times 0.15) + (P \times 0.15) + (R \times 0.10) + (V \times 0.10) + (Q \times 0.05) + (T \times 0.05)$$
Where:
- $S$: Skills and experience match (0-100)
- $L$: Seniority level alignment (0-100)
- $I$: Industry relevance (0-100)
- $P$: Salary expectation match (0-100)
- $R$: Location and relocation fit (0-100)
- $V$: Visa sponsorship availability (0-100)
- $Q$: Employer quality & reputation (0-100)
- $T$: Job recency (decay formula over 30 days) (0-100)

### 4.3 Human-in-the-Loop Approval Center
No application enters the `Ready to Apply` or `Applied` state unless the user clicks **Approve Application Package** in `/approvals`. The approval record saves a snapshot of the exact CV version, cover letter, screening answers, and explicit user consent.
