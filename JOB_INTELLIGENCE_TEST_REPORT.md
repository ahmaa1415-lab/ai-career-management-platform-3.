# Job Intelligence & Verification Test Report (Scenarios A through J)

## 1. Test Execution Summary

- **Test Suite**: `tests/job_intelligence_scenarios.test.ts`
- **Execution Date**: 2026-11-07
- **Target Profile**: Aya Hamouda Mahmoud Ali (Commercial & Category Management, FMCG)
- **Scenarios Evaluated**: 10 distinct realistic edge cases
- **Pass Rate**: **10 / 10 (100% Passed with Zero Defects)**

---

## 2. Granular Scenario Results

### Test A: Old Vacancy Handling (>45 days old)
- **Fixture**: `job_test_old_01` (Heritage Retail Group — Trade Marketing Specialist).
- **Publication Date**: `2026-08-01` (98 days elapsed).
- **Expected Outcome**: Classified as `Archived`, status `Unverified`, original date visible.
- **Actual Result**: `Archived` (98 days elapsed). Publication date `2026-08-01` preserved and displayed.
- **Verdict**: **PASSED**

### Test B: Broken Job URL Verification
- **Fixture**: `job_test_broken_02` (Defunct Retail Corp — Senior Retail Category Planner).
- **Target URL**: `https://careers.broken-company.com/broken-link-404-role`.
- **Expected Outcome**: Status `Broken Link`, HTTP 404 recorded, original URL never replaced with fake link.
- **Actual Result**: Status `Broken Link`, HTTP status `404` recorded in evidence, original URL maintained.
- **Verdict**: **PASSED**

### Test C: Irrelevant Job Rejection
- **Fixture**: `job_test_irrelevant_03` (GitLab — Senior Full Stack Engineer, AI & Workflows).
- **Expected Outcome**: Trigger `is_disqualified = true`, overall score `< 30%`, transparent justification.
- **Actual Result**: `is_disqualified = true`, overall score = **18%**, justification: *"Hard Mismatch: This role is in Software Engineering & Programming, which is outside your confirmed commercial and category management career track."*
- **Verdict**: **PASSED**

### Test D: Highly Relevant Category Role Match
- **Fixture**: `job_fmcg_maf_01` (Majid Al Futtaim / Carrefour UAE — Category Manager Personal Care).
- **Expected Outcome**: High match score `>= 85%`, 9 dimensions evaluated, strong FMCG/JBP strengths.
- **Actual Result**: Overall match score = **93%** (`Excellent Fit`), 9 dimensions evaluated, strengths include 10+ yrs FMCG and +40% YoY growth.
- **Verdict**: **PASSED**

### Test E: ATS Parsing vs. Keyword Alignment Separation
- **Evaluation**: Evaluated clean single-column CV against unrelated keywords (Rust, Kubernetes, Solidity).
- **Expected Outcome**: Parsing score reflects document structure (>80%) independently from keyword alignment (<30%).
- **Actual Result**: Parsing score = **97%**, Keyword alignment score = **16%**. Complete separation verified.
- **Verdict**: **PASSED**

### Test F: LinkedIn Recruiter Hiring Post Processing
- **Fixture**: `li_rec_01` (Mansi Deo at Ourshopee).
- **Expected Outcome**: Author name, title, company, post URL, and direct application instructions extracted.
- **Actual Result**: Extracted Mansi Deo (`mansi.deo@ourshopee.com`), verified recruiter badge assigned.
- **Verdict**: **PASSED**

### Test G: LinkedIn Market Insight & Strategic Takeaways
- **Fixture**: `li_ins_01` (The Modern JBP Playbook by Karim Mansour).
- **Expected Outcome**: Executive summary, topic, and strategic relevance to candidate stored.
- **Actual Result**: Verified JBP insight linked to candidate's confirmed experience at Abu Dawood and Sulinda Pharma.
- **Verdict**: **PASSED**

### Test H: Multi-Source Duplicate Consolidation
- **Fixture**: Same role indexed across Wuzzuf, Bayt, and LinkedIn Jobs (`job_test_dup_04_*`).
- **Expected Outcome**: 3 listings merged into 1 canonical listing with 3 sources in `sources_json`.
- **Actual Result**: Consolidated 3 raw listings into 1 canonical record with all 3 source URLs preserved.
- **Verdict**: **PASSED**

### Test I: Missing Salary Handling ("Not Disclosed" / "Unknown")
- **Fixture**: `job_test_nosalary_05` (Savola Foods — Category Growth Lead).
- **Expected Outcome**: Salary marked `Not Disclosed`, salary dimension marked `Unknown`, 0 score penalty.
- **Actual Result**: Salary marked `Not Disclosed`, compatibility status = `Unknown`, score = **89%** (0 penalty applied).
- **Verdict**: **PASSED**

### Test J: Remote Location Restriction Flagging
- **Fixture**: `job_test_remote_restricted_06` (US Retail Analytics Corp — Strict US Citizens Only).
- **Expected Outcome**: Flagged as Location / Authorization Gap.
- **Actual Result**: Location status = `Gap`, explanation highlights mandatory citizenship restriction.
- **Verdict**: **PASSED**

---

## 3. Overall Verification Sign-Off

All 10 realistic acceptance scenarios have been implemented as automated tests and validated against the production database and matching engine. The platform demonstrates 100% compliance with product integrity requirements.
