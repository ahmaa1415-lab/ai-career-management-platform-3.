# Job Verification, Link Integrity & Freshness Rules

## 1. Purpose & Standards

This document establishes the verification protocols enforced by `lib/jobs/verifier.ts` to ensure that every opportunity surfaced to the candidate represents an authentic, active, and accessible vacancy.

---

## 2. Temporal Freshness Tiers

Job vacancies are categorized into 5 mutually exclusive freshness tiers based on the exact elapsed days since original publication:

| Tier | Elapsed Days | System Badge | Policy & Candidate Action |
| :--- | :---: | :---: | :--- |
| **Very recent** | **0 – 7 days** | Blue Badge | High priority. Candidate is among the earliest applicant cohort. |
| **Recent** | **8 – 14 days** | Indigo Badge | Active candidate screening window. Ideal for tailored application dispatch. |
| **Current, requires verification** | **15 – 30 days** | Green Badge | Active vacancy; automated ping checks if employer is still receiving CVs. |
| **Older, display with warning** | **31 – 45 days** | Amber Badge | Surfaced with clear advisory notice that interview rounds may be in progress. |
| **Archived** | **> 45 days** | Slate Badge | Classified as archived. Excluded from Top 10 recommendations; kept for market intelligence. |

---

## 3. The 8 Verification Statuses

Every vacancy is assigned exactly one verification status:

1. **`Verified Open`**: Original posting confirmed active on official company career domain; link resolves with HTTP 200; employer identity verified.
2. **`Open, Date Unconfirmed`**: Verified active on employer portal, but original date of publication is unspecified by the aggregator.
3. **`Unverified`**: Indexed vacancy without confirmed employer validation or fresh HTTP check.
4. **`Expired`**: Official application deadline has elapsed.
5. **`Closed`**: Employer portal explicitly states "No longer accepting applications" or returns HTTP 410.
6. **`Broken Link`**: Original source URL returns HTTP 404, 500, or invalid domain.
   - **MANDATORY RULE**: The system **never replaces a broken link with a fabricated URL**. The original broken URL is preserved and visibly flagged as `Broken Link`.
7. **`Redirected`**: Source URL leads to an unrelated home page, advertising interstitial, or dead aggregator redirect.
8. **`Suspicious`**: Anti-scam heuristics detected fraudulent recruitment behavior (fee requests, crypto payments, WhatsApp-only advance fees).

---

## 4. Multi-Source Deduplication & Consolidation Algorithm

When the same vacancy is published across multiple job boards (e.g., Wuzzuf, Bayt, LinkedIn Jobs):
1. **Fingerprint Normalization**:
   ```
   Key = lowercase(alphanumeric(employer)) + "_" + lowercase(alphanumeric(title)) + "_" + lowercase(alphanumeric(city))
   ```
2. **Canonical Merging**:
   - The first occurrence is designated as the Canonical Listing.
   - Subsequent matches are merged, appending each board reference to `sources_json`:
     ```json
     [
       {"source": "Wuzzuf", "url": "https://wuzzuf.net/jobs/p/..."},
       {"source": "Bayt", "url": "https://bayt.com/en/job/..."},
       {"source": "LinkedIn Jobs", "url": "https://linkedin.com/jobs/view/..."}
     ]
     ```
   - The most direct corporate application portal URL is prioritized.
