# Senior Global HR & Recruitment Intelligence System
## Technical Specification, Architecture & Operational Manual

---

### 1. Executive Summary & Product Identity

The **ATS Engine** has been upgraded from a basic keyword counter into a **Senior Global HR & Recruitment Intelligence System**. 

The system operates from the perspective of an elite Talent Acquisition Director and Senior Executive Search Consultant with 15+ years of multinational corporate experience. It models both:
1. **The Human Recruiter Mindset**: 6-second initial scan, executive presence, commercial trajectory, quantified achievements, and narrative differentiation according to CIPD, SHRM, and NCRW standards.
2. **The Enterprise ATS Parser**: Strict single-column flow, layout compatibility, character set encoding, section header recognition, and multi-tier keyword categorization for platforms like Workday, Taleo, Greenhouse, and Lever.

---

### 2. Dual Primary Scoring Architecture (1 to 10 Scale)

Rather than flattening qualitative recruiter impressions and technical parsing into a single arbitrary percentage, the system produces **two distinct primary scores on a 1–10 scale**, complemented by **5 diagnostic sub-scores**:

```
+-----------------------------------------------------------------------------------------+
|                              EXECUTIVE SCORING MATRIX                                   |
+-----------------------------------------------------------------------------------------+
|  Primary Dimension 1: Human Recruiter Score (1 to 10)                                   |
|  - Overall Shortlisting Verdict: High Shortlist Priority | Competitive | Secondary      |
|  - Format & Structure (1-10)                                                            |
|  - Content Relevance & Seniority (1-10)                                                 |
|  - Language & Tone (1-10)                                                               |
|  - Achievements & Quantified Impact (1-10)                                              |
|  - Recruiter First Impression & Differentiation (1-10)                                  |
+-----------------------------------------------------------------------------------------+
|  Primary Dimension 2: ATS Compatibility Score (1 to 10)                                 |
|  - Parsing Safety: Workday / Taleo / Greenhouse Parsing Guarantee                       |
|  - Layout Structure: Single-column flow, 0 unparsable text boxes                        |
|  - Character Encoding: Plain UTF-8 clean glyphs                                         |
|  - Date Format Parsing: Standard Month YYYY recognition                                 |
+-----------------------------------------------------------------------------------------+
|  5 Diagnostic Sub-Scores (1 to 10):                                                     |
|  1. Keyword Alignment Score (1-10)                                                      |
|  2. Recruiter Readability Score (1-10)                                                  |
|  3. Achievement Impact Score (1-10)                                                     |
|  4. Localization & Anti-Bias Score (1-10)                                                |
|  5. Headhunter Discoverability Score (1-10)                                             |
+-----------------------------------------------------------------------------------------+
```

---

### 3. Step-by-Step Evaluation Methodology

#### Step 1: Human Recruiter Review (5 Evaluation Pillars)
- **Format & Structure**: Assesses layout clarity, visual hierarchy, margin balance, reading flow, and standard document length (1 page for US, 2 pages for UK/Germany/Gulf).
- **Content Relevance**: Evaluates years of verified experience against target benchmark seniority, leadership indicators, and core commercial competencies.
- **Language & Tone**: Evaluates action-verb density, conciseness, absence of passive filler phrases, and commercial vocabulary precision.
- **Achievements & Impact**: Verifies presence of quantifiable metrics, revenue/cost impacts, and category growth percentages. Flags missing metrics for candidate confirmation.
- **Overall Recruiter Impact**: Evaluates first-impression strength, unique value proposition, career progression coherence, and delivers a definitive shortlisting verdict.

#### Step 2: ATS Compliance & Multi-Tier Keyword Categorization
The engine differentiates requirements into five distinct categories:
1. **Exact Matches**: Keywords found verbatim in the candidate's CV text.
2. **Semantic / Synonym Matches**: Equivalencies recognized through industry ontology (e.g., "Assortment Planning" ↔ "Range Architecture").
3. **Terminology Gaps**: Concepts present in the candidate's background but phrased using different nomenclature.
4. **Presentation Gaps**: Competencies present but buried or understated.
5. **Genuine Experience Gaps**: Real technical or functional requirements where the candidate has no demonstrable exposure.
6. **Irrelevant / Peripheral Requirements**: Minor or out-of-scope criteria that should not distract from core positioning.

#### Step 3: Jurisdiction-Specific Localization & Anti-Bias Advisor
- **United States**: Strict 1-page standard. **Photographs are strictly prohibited** to maintain compliance with EEOC and federal anti-discrimination laws. Personal disclosures (marital status, religion, age) are flagged as severe compliance risks.
- **United Kingdom**: 2-page standard. Photos strictly discouraged under the Equality Act 2010. Emphasizes UK English spelling and right-to-work status.
- **Germany & EU**: 2-page standard (Lebenslauf format). Professional headshot is common practice; language proficiency (CEFR levels) and formal credentials emphasized.
- **UAE & Saudi Arabia (GCC)**: 2-page standard. Photos and nationality/visa status are standard market expectations. Emphasizes regional GCC trade networks and Modern Trade channel management.
- **Egypt**: 2-page standard. Photos common. Highlights distributor network management and local currency volume growth.

#### Step 4: Headhunter & LinkedIn Recruiter Simulator
- **Boolean Search Query Generation**: Produces copy-ready boolean search queries tailored for LinkedIn Recruiter (e.g. `("Category Manager" OR "Trade Marketing") AND ("FMCG" OR "Personal Care") AND ("Assortment" OR "JBP")`).
- **Corporate ATS Search Queries**: Boolean syntax optimized for internal candidate database retrieval.
- **Alternative Executive Search Titles**: Identifies adjacent market titles (e.g. MT Activation Manager, Projects and Trade Manager, Channel Development Manager).
- **3 Copy-Ready Executive Headlines**: High-conversion LinkedIn headlines crafted for senior placement.
- **LinkedIn "About" Summary Draft**: First-person executive career narrative ready for immediate copy-pasting.

#### Step 5: Priority-Ordered Action Plan (P1 to P7)
Roadmap items are prioritized strictly by impact:
- **P1**: Critical parsing or eligibility blockers.
- **P2**: Major role positioning mismatches.
- **P3**: Missing factual evidence or scope indicators.
- **P4**: Weak or unquantified achievement statements.
- **P5**: Keyword optimization and terminology alignment.
- **P6**: Formatting and layout improvements.
- **P7**: Headhunter and recruiter discoverability enhancements.

#### Step 6: Zero-Fabrication Tailored Resume Generation (Version B)
- Derives a clean, role-tailored plain-text CV (Version B) while **preserving 100% of the candidate's factual employment timeline, company names, job titles, and dates**.
- When numerical figures (e.g. annual category revenue, promotional ROI percentage) are missing, the system **never hallucinates or invents numbers**. Instead, it generates explicit bracketed prompts:
  `[Candidate confirmation needed: specify annual category sales volume or portfolio value]`
- The tailored draft can be saved directly to the candidate's Resumes vault with a single click.

---

### 4. Database Schema & Persistence

All evaluation audits are stored in the SQLite database table `cv_evaluations`:

```sql
CREATE TABLE IF NOT EXISTS cv_evaluations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'user_default_01',
  resume_id TEXT,
  cv_version TEXT NOT NULL DEFAULT 'Original',
  cv_title TEXT,
  job_id TEXT,
  target_role TEXT NOT NULL,
  target_country TEXT NOT NULL,
  target_industry TEXT NOT NULL,
  human_recruiter_score REAL NOT NULL,
  ats_compatibility_score REAL NOT NULL,
  keyword_alignment_score REAL NOT NULL,
  recruiter_readability_score REAL NOT NULL,
  achievement_impact_score REAL NOT NULL,
  localization_score REAL NOT NULL,
  headhunter_discoverability_score REAL NOT NULL,
  job_fit_score REAL,
  criterion_scores_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  recommendations_json TEXT NOT NULL,
  action_plan_json TEXT NOT NULL,
  tailored_cv_text TEXT,
  full_report_markdown TEXT NOT NULL,
  evaluation_date TEXT NOT NULL
);
```

#### Historical Version Comparison
The API endpoint `GET /api/ats/evaluations?compareA=<id>&compareB=<id>` compares two audits side-by-side, calculating score deltas (`human_score_delta`, `ats_score_delta`) to show the candidate's improvement trajectory.

---

### 5. Verified API Contracts

1. **`POST /api/ats/analyze`**:
   - Request Body:
     ```json
     {
       "cv_text": "...",
       "target_role": "Category Manager",
       "target_country": "United Arab Emirates",
       "target_industry": "FMCG & Consumer Goods",
       "job_description": "Optional JD text"
     }
     ```
   - Response: Returns complete `SeniorGlobalHREvaluationResult` object including both 1–10 scores, diagnostic matrix, 7 audit steps, markdown report, and legacy 0–100 fields for backward compatibility.

2. **`GET /api/ats/evaluations`**:
   - Returns list of historical evaluations sorted descending by date.
   - Supports `?id=<id>` for single record retrieval.
   - Supports `?compareA=<id>&compareB=<id>` for delta comparison.

---

### 6. Verification & Test Evidence

The upgrade was verified across the test infrastructure:
- **`tests/global_hr_recruitment_intelligence.test.ts`**: 9/9 verification scenarios passing cleanly.
- **`tests/ats_analyzer.test.ts`**: 100% passing.
- **`tests/job_intelligence_scenarios.test.ts`**: 10/10 passing.
- **`tests/ui_pages_browser.test.ts`**: 24/24 UI pages rendered with HTTP 200.
- **`tests/run_all.ts`**: **21/21 core test suites passed with 0 defects**.
