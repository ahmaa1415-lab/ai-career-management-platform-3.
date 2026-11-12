# RESUME VERSIONING & DATA ISOLATION IMPLEMENTATION GUIDE

## Overview
This document outlines the architectural enhancements, schema migrations, API routes, and user interface controls implemented to deliver complete resume versioning, immutable audit trails, and strict data isolation across multi-candidate environments.

---

## 1. Database Schema Enhancements

### 1.1 New Dedicated Relational Table: `extracted_profiles`
Provides 1-to-1 or 1-to-many isolation between uploaded resume documents and their machine-extracted profile representations.

```sql
CREATE TABLE IF NOT EXISTS extracted_profiles (
  id TEXT PRIMARY KEY,
  resume_id TEXT NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_name TEXT,
  email TEXT,
  phone TEXT,
  location TEXT,
  linkedin_url TEXT,
  github_url TEXT,
  current_headline TEXT,
  career_progression TEXT,
  detected_seniority TEXT,
  total_experience_years REAL DEFAULT 0,
  experiences_json TEXT DEFAULT '[]',
  education_json TEXT DEFAULT '[]',
  certifications_json TEXT DEFAULT '[]',
  skills_json TEXT DEFAULT '[]',
  languages_json TEXT DEFAULT '[]',
  industries_json TEXT DEFAULT '[]',
  missing_information_json TEXT DEFAULT '[]',
  raw_extracted_text TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 1.2 Upgraded `resumes` Table Columns
Expanded with 13 metadata and state machine tracking attributes:

| Column | Type | Description |
|---|---|---|
| `original_filename` | `TEXT` | Exact name of user's uploaded document (e.g., `sarah_cv.pdf`) |
| `stored_file_path` | `TEXT` | Secure local filesystem path in `data/uploads/` |
| `file_type` | `TEXT` | MIME type (e.g., `application/pdf`, `text/plain`) |
| `file_size` | `INTEGER` | Document byte size |
| `file_hash` | `TEXT` | Cryptographic SHA-256 hash of raw file buffer |
| `upload_timestamp` | `DATETIME` | Exact upload timestamp |
| `processing_status` | `TEXT` | State machine: `'pending'`, `'processing'`, `'completed'`, `'failed'` |
| `extraction_status` | `TEXT` | Extractor status: `'pending'`, `'completed'`, `'failed'` |
| `extraction_timestamp` | `DATETIME` | Extraction completion timestamp |
| `extraction_version` | `INTEGER` | Schema extraction version (currently 1) |
| `source_text_reference` | `TEXT` | Absolute path pointer to raw file on disk |
| `extracted_profile_id` | `TEXT` | Foreign key referencing `extracted_profiles(id)` |
| `ats_report_id` | `TEXT` | Foreign key referencing `cv_evaluations(id)` |

### 1.3 High-Performance Database Indexes
```sql
CREATE INDEX IF NOT EXISTS idx_resumes_file_hash ON resumes(file_hash);
CREATE INDEX IF NOT EXISTS idx_resumes_user_created ON resumes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_extracted_profiles_resume ON extracted_profiles(resume_id);
```

---

## 2. Cryptographic Content Hashing & Duplicate Handling

### 2.1 SHA-256 Digest Calculation
Upon receiving an upload via `multipart/form-data` or JSON payload, the raw `fileBuffer` is hashed:
```typescript
const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
```

### 2.2 Content-Based Deduplication Logic
- When a user re-uploads an identical document (even under a different filename like `copy_of_resume.pdf`), the SHA-256 hash matches an existing record.
- The server reuses the verified extraction without creating duplicate database rows or reprocessing identical documents.
- The response returns `{ is_duplicate: true, resume_id: existingDuplicate.id }`.
- If the file content is modified (even by 1 byte or with the same original filename), a distinct SHA-256 hash is generated, creating a new independent version record.

---

## 3. Four-Tier Profile Separation Architecture

To prevent silent database overwrites, the platform strictly separates four distinct concepts:

```
[1. Uploaded Resume Document] (Immutable source of truth, stored on disk & resumes table)
           │
           ▼
[2. Extracted Resume Profile] (Machine-extracted entities, stored in extracted_profiles table)
           │
           ▼
[3. Master Career Profile] (User-confirmed career record, stored in profiles table)
           │
           ▼
[4. Tailored Vacancy Resumes] (Role-specific derivations, stored with type='Tailored')
```

- Uploading a new resume **never** silently overwrites the Master Profile (`profiles` table).
- The upload API returns a `profile_comparison` diff object (highlighting headline differences, experience years differences, and new skills).
- The user can review and approve updates in the UI before any change is promoted to the Master Career Profile.

---

## 4. API Endpoints

### 4.1 `POST /api/cv/upload`
- Accepts `file` (multipart) or `text` (JSON).
- Generates `resume_id` and SHA-256 `file_hash`.
- Validates text length (returns HTTP 400 with `processing_status: 'failed'` if `< 20` chars).
- Creates resume record with status `'processing'` to satisfy foreign key constraints.
- Performs dynamic entity extraction and inserts `extracted_profiles` record.
- Executes `analyzeResume` and persists evaluation linked to `resume_id`.
- Generates Version B and returns full isolated payload.

### 4.2 `GET /api/resumes?id=<resume_id>`
- Retrieves the exact resume record, joined with its specific `extracted_profile` and latest `ats_evaluation`.
- Guarantees zero cross-talk between different resumes.

### 4.3 `POST /api/ats/analyze`
- Accepts `{ resume_id, target_role, target_country, job_description }`.
- Loads exact `raw_text` from `resumes` table for that `resume_id`.
- Updates `resumes.ats_score` and `resumes.ats_report_id`.
- Returns comprehensive 5-criterion human review and machine ATS audit.

---

## 5. Frontend & UI Controls

### 5.1 `app/resumes/page.tsx`
- Displays dropzone with upload progress spinner and instant document preview.
- Shows file metadata: original filename, file type, file size, upload date, and SHA-256 hash snippet.
- Dynamic Candidate Title and Domain badges computed directly from the active resume.
- Switching between resumes in the list instantly updates the full-page view and raw text display.

### 5.2 `app/ats-analyzer/page.tsx`
- Added **Resume Under Audit** dropdown selector in the calibration card.
- Automatically selects the latest uploaded resume by default.
- Selecting any resume from the dropdown immediately re-populates the target text and loads the evaluation history strictly for that document.

### 5.3 `app/page.tsx` & `app/control-center/page.tsx`
- Selecting a new file immediately resets `extractedData`, `optimizedCV`, and `strategy` state to null, preventing any visual flicker of previous candidate information during upload processing.
