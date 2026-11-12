# 9-Dimension Weighted Job Matching Methodology & Disqualification Architecture

## 1. Executive Overview

The job matching engine (`lib/jobs/matcher.ts`) executes a deterministic, multi-dimensional assessment that maps a candidate’s confirmed professional career against job vacancies. The model operates on **9 explicit weighted dimensions summing to exactly 100%**, coupled with **mandatory disqualification rules** to prevent irrelevant role recommendations.

---

## 2. The 9-Dimension Weighted Model

| Dimension # | Dimension Name | Weight | Evaluation Criteria |
| :---: | :--- | :---: | :--- |
| **1** | **Relevant Experience** | **20%** | Compares confirmed years of experience against required minimums; assesses domain seniority and depth. |
| **2** | **Functional & Technical Skills** | **20%** | Compares candidate skills, tools (SAP, Power BI, Excel), and methods (JBP, Planograms) against role requirements using exact and semantic token overlap. |
| **3** | **Responsibilities Alignment** | **15%** | Evaluates day-to-day duties (distributor management, modern trade, store audits, demand planning) against vacancy description. |
| **4** | **Seniority & Leadership** | **10%** | Maps candidate level (`Lead` / `Commercial Manager`) against role seniority (`Senior` / `Lead` / `Head`). |
| **5** | **Industry Relevance** | **10%** | Gating across primary sectors: FMCG, Personal Care, Beauty & Grooming, Pharmaceuticals, Retail, E-commerce. |
| **6** | **Achievements & Business Impact** | **10%** | Analyzes quantifiable impact (e.g. +40% YoY category growth, +30% distributor sales acceleration, regional expansions). |
| **7** | **Location & Work Authorization** | **5%** | Verifies geographic fit (UAE, Saudi Arabia, Egypt, GCC), relocation timeline, and flags strict citizen-only restrictions. |
| **8** | **Salary Compatibility** | **5%** | Compares expected compensation against disclosed range. If missing/undisclosed, marked `Unknown` with neutral score (**0 penalty**). |
| **9** | **Career Progression** | **5%** | Evaluates trajectory advancement (Medical Rep -> Assistant Trade Marketing -> Category Manager -> Regional Commercial Lead). |
| **TOTAL** | | **100%** | Normalized weighted score between 0 and 100. |

---

## 3. Mandatory Disqualification Logic

To eliminate the scaffolding issue where commercial candidates were matched with software engineering vacancies:
```typescript
if (isCandidateCommercial && !isCandidateSoftware && isJobSoftware) {
  isDisqualified = true;
  disqualificationReason = "Hard Mismatch: This role is in Software Engineering & Programming, which is outside your confirmed commercial and category management career track.";
  overallScore = Math.min(22, overallScore); // Capped strictly < 30%
}
```

### Disqualification Triggers:
1. **Unrelated Profession**: Software Engineering, Full Stack, Backend Developer, DevOps, Systems Architecture, Machine Learning, Clinical Medicine, Laboratory Bench Work.
2. **Geographic Ineligibility**: Roles strictly restricted to citizens of other nations (e.g., US Citizens Only) when candidate does not possess work authorization.

---

## 4. Decision Bands

| Score Range | Fit Classification | Recommended Action |
| :---: | :--- | :--- |
| **90 – 100%** | **Excellent Fit** | High priority. Direct application dispatch with customized Version B package. |
| **80 – 89%** | **Strong Fit** | Well-aligned core experience and industry. Tailor cover letter to emphasize specific competencies. |
| **70 – 79%** | **Good Potential Fit** | Transferable domain skills with minor gaps. Recommended for exploratory applications. |
| **60 – 69%** | **Partial Fit** | Significant seniority or functional gap. Review carefully before applying. |
| **< 60%** | **Low Fit / Mismatched** | Not recommended. Disqualified or outside career track. |

---

## 5. Missing Salary Transparency Policy

When an employer does not disclose salary in the vacancy listing:
1. The position is clearly labelled as **"Salary: Not Disclosed"**.
2. The Salary Compatibility dimension is designated as **Status: Unknown**.
3. The candidate is assigned a neutral baseline score (75%) for that specific 5% weight, ensuring **zero penalty** against their overall score.
4. The system never fabricates estimated compensation numbers without employer confirmation.
