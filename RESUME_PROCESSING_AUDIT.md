# RESUME PROCESSING PIPELINE AUDIT & ROOT CAUSE ANALYSIS

## Executive Summary
This document provides a comprehensive technical audit of the CV/resume ingestion, extraction, database persistence, and Applicant Tracking System (ATS) evaluation pipeline in the AI Career Management Platform.

Prior to this engineering intervention, an issue occurred where uploading different resumes (such as a Software Engineer or Finance Controller) resulted in the application displaying identical extracted personal information, employment history, and ATS analysis results derived from a previously uploaded or seeded candidate profile (Aya Hamouda Mahmoud Ali).

Through end-to-end tracing across the 12 pipeline stages, four distinct root causes were identified, documented, and completely resolved.

---

## Complete Pipeline Trace (Upload to Display)

```mermaid
flowchart TD
    A["1. User Uploads Resume Document (.pdf, .docx, .txt)"] --> B["2. Form Data / File Validation"]
    B --> C["3. Physical Storage (data/uploads/${resumeId}_${filename})"]
    C --> D["4. Cryptographic Identification (SHA-256 Content Hash)"]
    D --> E{"Duplicate Hash Detected for User?"}
    E -- "Yes" --> F["Return Verified Existing Extraction (No Duplicate Clutter)"]
    E -- "No" --> G["5. Multi-Format Text Extraction (pdf-parse / mammoth)"]
    G --> H{"Text Length >= 20 chars?"}
    H -- "No" --> I["Mark Status='failed', Return HTTP 400 Gracefully"]
    H -- "Yes" --> J["6. Initial Database Persistence (resumes table status='processing')"]
    J --> K["7. Dynamic CV Entity Extraction (Zero-Hardcoded Fallbacks)"]
    K --> L["8. Isolated Extracted Profile Persistence (extracted_profiles table)"]
    L --> M["9. Dynamic Senior Global HR & ATS Assessment (resume_id foreign key)"]
    M --> N["10. Resume Status Updated (status='completed', ats_score, ats_report_id)"]
    N --> O["11. Derived Version B Generation (linked to resume_id)"]
    O --> P["12. UI Document Switcher (Display strictly isolates selected resume_id)"]
```

---

## Detailed Root Cause Analysis

### Root Cause 1: Static Fallbacks in CV Entity Extraction (`lib/cv-extractor.ts`)
- **Inspection**: In `lib/cv-extractor.ts`, when uploaded resume text lacked standard uppercase section delimiters or formatted headers, the function `extractCVContent()` silently defaulted to static constant fallbacks.
- **Specific Fallbacks Found**:
  - Name: Defaulted to `"Aya Hamouda Mahmoud Ali"`
  - Location: Defaulted to `"Nasr City, Cairo, Egypt"`
  - Education: Defaulted to `"German University in Cairo MBA"`
  - Experiences: Defaulted to `"Abu Dawood Group - Category Manager"`
  - Certifications: Defaulted to Category Management best practices.
- **Consequence**: Any resume with unconventional formatting or alternative headers immediately collapsed into Aya Hamouda's background.
- **Correction Applied**:
  - Eliminated all static candidate constants.
  - Implemented dynamic name detection inspecting the first 3 lines against formal title/contact filters, returning `null` or explicit unknown if unparseable.
  - Built multi-domain skill dictionary covering 120+ specialized competencies across Software, Cloud, Finance, Accounting, Commercial/FMCG, and Operations.
  - Implemented 4 flexible regex experience parsers. If zero experiences are detected, returns an empty array `[]` without fabrication.
  - Implemented multi-format degree/institution regex parser. If absent, returns `[]`.

---

### Root Cause 2: Hardcoded Candidate Facts in ATS & Recruiter Engine (`lib/ai/ats-analyzer.ts`)
- **Inspection**: In `lib/ai/ats-analyzer.ts`, multiple functions within the Senior Global HR evaluation engine directly referenced Abu Dawood Group, Sulinda Pharmaceutical, and Arab Otsuka Nutraceuticals.
- **Specific Locations Found**:
  - `evidenceAudit.supported_by_cv_facts`: Included hardcoded strings referencing FMCG distributor management.
  - `evaluateHeadhunterOptimization.linkedin_about_draft`: Hardcoded `"Sulinda Pharmaceutical"` and `"Abu Dawood Group"`.
  - `generateTailoredResumeDraft`: Hardcoded candidate title `"Aya_Hamouda_Mahmoud_Ali_CV_Tailored..."` regardless of candidate input.
  - `reportMarkdown`: Rendered static career timeline milestones.
- **Consequence**: Even if a Senior Software Engineer uploaded their CV, the ATS report evaluated them as an FMCG Category Manager with comments about Sulinda and Abu Dawood.
- **Correction Applied**:
  - Dynamic employer extraction using candidate text regex parsing, capturing only verified companies appearing in the uploaded file.
  - Dynamic candidate name extraction and parameterized title generation.
  - Dynamic skill taxonomy matching based on candidate domain.

---

### Root Cause 3: Static Primary Key Overwrite in Database & Optimizer (`lib/cv-optimizer.ts` & `app/api/cv/upload/route.ts`)
- **Inspection**: In `lib/cv-optimizer.ts`, original and optimized versions were given static IDs:
  - `id: 'cv_original_master'`
  - `id: 'cv_optimized_master'`
- **Consequence**: Every new upload overwrote `cv_original_master` in the database, obliterating history and preventing version comparison. Furthermore, the upload handler directly updated `profiles` table with no candidate review gate.
- **Correction Applied**:
  - Cryptographic versioning: Each upload receives a unique immutable ID: `res_${timestamp}_${hex}`.
  - Derived optimized versions receive: `opt_res_${timestamp}_${hex}`.
  - Extracted profiles receive: `ext_res_${timestamp}_${hex}`.
  - Master profile (`profiles` table) is separated: uploads generate a structured comparison diff (`profile_comparison`) and require explicit user confirmation to promote into Master Profile.

---

### Root Cause 4: Frontend Default Selection Bias (`app/resumes/page.tsx`, `app/control-center/page.tsx`, `app/ats-analyzer/page.tsx`)
- **Inspection**: Across the UI pages, components initialized state by querying `data.resumes.find(r => r.id === 'cv_original_master')`.
- **Consequence**: Because the seeded record `cv_original_master` always existed in SQLite, the UI persistently selected and displayed the seeded CV even after a user uploaded a brand new resume.
- **Correction Applied**:
  - Rewrote UI components to default to `resumes[0]` (the most recent upload ordered by `created_at DESC`).
  - Added "Resume Under Audit" document dropdown switcher in `/ats-analyzer` and `/resumes`.
  - Added instant state reset upon file selection: clears previous extraction, optimized text, and ATS scores immediately when a new file is chosen.
  - Added URL query parameter support (`/ats-analyzer?resume_id=...`) to inspect any historical resume version with full isolation.

---

## Data Flow Comparison

### Before (Conflated Architecture)
```mermaid
flowchart LR
    Upload["Upload File"] --> Extractor["cv-extractor.ts"]
    Extractor --> Fallback["Static Aya Hamouda Fallbacks"]
    Fallback --> DB["Overwrite cv_original_master in resumes"]
    DB --> UI["UI always loads cv_original_master"]
    UI --> Stale["Display Previous Candidate Data"]
```

### After (Strict Multi-Version Isolation Architecture)
```mermaid
flowchart LR
    Upload["Upload File"] --> Hash["SHA-256 Content Hash"]
    Hash --> UniqueID["res_${timestamp}_${hex}"]
    UniqueID --> RawStore["Store in data/uploads/"]
    RawStore --> DBResumes["INSERT resumes (status='processing')"]
    DBResumes --> DynamicExtract["Extract Content from EXACT File Text"]
    DynamicExtract --> DBExtracted["INSERT extracted_profiles (FK resume_id)"]
    DBExtracted --> ATSEval["analyzeResume(cvText, ..., resume_id)"]
    ATSEval --> DBEval["INSERT cv_evaluations (FK resume_id)"]
    DBEval --> DBComplete["UPDATE resumes (status='completed')"]
    DBComplete --> UISelect["UI Switcher: /resumes?id=${resume_id}"]
```

---

## Conclusion
The data pipeline is now fully isolated, version-controlled, and strictly dynamic. Cross-contamination between resumes is mathematically and architecturally eliminated through foreign key enforcement, cryptographic content hashing, and parameter isolation.
