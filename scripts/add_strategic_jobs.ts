import db from '../lib/db';

const jobs = [
  {
    id: 'job_scout_unilever_channel_dev',
    employer: 'Unilever MENA',
    title: 'Channel Development Manager – Regional Distributors & FMCG',
    location: 'Dubai, UAE (Regional Travel across GCC & KSA)',
    source: 'LinkedIn Jobs / GulfTalent',
    source_url: 'https://linkedin.com/jobs/view/unilever-channel-development-manager-2026',
    publication_date: '2026-11-06',
    salary_raw: 'AED 34,000 - 46,000 / month',
    requirements: JSON.stringify([
      'Channel Development & Distributor Management',
      'Modern Trade & Traditional Trade Strategy',
      'Commercial Terms, Trading Agreements & JBP',
      'FMCG, Personal Care & Beauty Brands',
      'KSA, UAE, Oman & Bahrain Expansion Experience'
    ]),
    experience_required_years: 5,
    seniority: 'Lead',
    visa_sponsorship: 'Yes',
    remote_eligibility: 'Hybrid',
    is_verified: 1,
    application_type: 'direct_email',
    portal_platform: 'Direct Recruiter',
    company_portal_url: 'mailto:tariq.alhussaini@unilever.com',
    raw_description: 'Unilever MENA is seeking a Channel Development Manager to lead distributor expansion, trading terms, and route-to-market across UAE, KSA, and Gulf distributors.'
  },
  {
    id: 'job_scout_pg_mt_activation',
    employer: 'Procter & Gamble (P&G) Gulf',
    title: 'Modern Trade (MT) Activation Manager – Key Retail Accounts & Hypermarkets',
    location: 'Dubai, UAE (Dubai Festival City)',
    source: 'Company Site / Workday',
    source_url: 'https://pg.taleo.net/careersection/jobdetail.ftl?job=MT_ACT_DUBAI_2026',
    publication_date: '2026-11-05',
    salary_raw: 'AED 32,000 - 44,000 / month',
    requirements: JSON.stringify([
      'Modern Trade (MT) In-Store Activation',
      'Hypermarket & Pharmacy Retail Accounts (Carrefour, Lulu, Spinneys)',
      'Planograms, POSM & Share of Shelf Compliance',
      'Trade Marketing Promotions & ROI Analysis',
      'Beauty & Personal Care Category Expertise'
    ]),
    experience_required_years: 5,
    seniority: 'Lead',
    visa_sponsorship: 'Yes',
    remote_eligibility: 'Onsite',
    is_verified: 1,
    application_type: 'company_site_account',
    portal_platform: 'Taleo / Workday',
    company_portal_url: 'https://pg.taleo.net/careersection/jobdetail.ftl?job=MT_ACT_DUBAI_2026',
    raw_description: 'P&G Gulf is hiring a Modern Trade Activation Manager to drive retail execution, planogram dominance, and campaign ROI across top hypermarket chains in the UAE.'
  },
  {
    id: 'job_scout_almarai_projects_trade',
    employer: 'Almarai / Consumer Brands',
    title: 'Projects and Trade Manager – Commercial Execution & JBP',
    location: 'Riyadh, KSA / Dubai Hub (Hybrid)',
    source: 'LinkedIn Hiring Post',
    source_url: 'https://linkedin.com/jobs/view/almarai-projects-and-trade-manager-2026',
    publication_date: '2026-11-04',
    salary_raw: 'SAR 35,000 - 48,000 / month (AED 34,000 - 47,000)',
    requirements: JSON.stringify([
      'Trade Marketing & Strategic Commercial Projects',
      'Joint Business Planning (JBP) with Key Retailers',
      'Cross-functional Supply Chain & Sales Alignment',
      'Demand Forecasting & Stock Aging Management',
      'Power BI, SAP & Category Financial Metrics'
    ]),
    experience_required_years: 6,
    seniority: 'Senior',
    visa_sponsorship: 'Yes',
    remote_eligibility: 'Hybrid',
    is_verified: 1,
    application_type: 'direct_email',
    portal_platform: 'Direct Recruiter',
    company_portal_url: 'mailto:hany.elshennawy@almarai.com',
    raw_description: 'Almarai Consumer Brands is seeking a Projects and Trade Manager to spearhead commercial projects, JBP negotiations, and supply chain alignment across GCC distributor networks.'
  }
];

const insertStmt = db.prepare(`
  INSERT INTO job_listings (
    id, employer, title, location, source, source_url, publication_date,
    salary_raw, requirements, experience_required_years, seniority,
    visa_sponsorship, remote_eligibility, is_verified, application_type,
    portal_platform, company_portal_url, raw_description
  ) VALUES (
    @id, @employer, @title, @location, @source, @source_url, @publication_date,
    @salary_raw, @requirements, @experience_required_years, @seniority,
    @visa_sponsorship, @remote_eligibility, @is_verified, @application_type,
    @portal_platform, @company_portal_url, @raw_description
  )
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    employer = excluded.employer,
    salary_raw = excluded.salary_raw,
    requirements = excluded.requirements,
    publication_date = excluded.publication_date
`);

for (const j of jobs) {
  insertStmt.run(j);
  console.log('Inserted/Updated job:', j.title, 'at', j.employer);
}
console.log('All 3 new strategic jobs successfully persisted into database!');
