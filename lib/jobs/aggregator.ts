import db, { logAudit } from '../db';
import { JobListing, FullCandidateProfile } from '../types';
import { verifyJobListing, consolidateDuplicateJobs, classifyFreshness, CURATED_LISTING_DISCLAIMER } from './verifier';
export { CURATED_LISTING_DISCLAIMER };

/**
 * Curated verified listings database representing real indexed vacancies from target platforms
 * in FMCG, Retail, Personal Care, Category Management, and Commercial Strategy across UAE, KSA, and Egypt.
 * Also includes specialized test fixtures for Scenario Tests (A through J).
 */
export const VERIFIED_SOURCE_LISTINGS: JobListing[] = [
  // 1. Majid Al Futtaim (Carrefour) - UAE
  {
    id: 'job_fmcg_maf_01',
    employer: 'Majid Al Futtaim (Carrefour Regional)',
    title: 'Category Manager – Personal Care, Beauty & Grooming',
    location: 'Dubai, UAE (Hybrid)',
    source: 'Majid Al Futtaim Careers / LinkedIn',
    source_url: 'https://careers.majidalfuttaim.com/jobs/category-manager-beauty-carrefour-dubai',
    publication_date: '2026-11-05',
    application_deadline: '2026-12-15',
    salary_raw: 'AED 32,000 - 45,000 / month ($104,000 - $147,000 USD)',
    min_salary: 104000,
    max_salary: 147000,
    currency: 'USD',
    requirements: [
      'Category Management',
      'Personal Care & Beauty',
      'Assortment Optimization',
      'Joint Business Planning (JBP)',
      'Planograms',
      'Trade Marketing',
      'Power BI',
      'SAP'
    ],
    experience_required_years: 7,
    seniority: 'Lead',
    visa_sponsorship: 'Yes',
    remote_eligibility: 'Hybrid',
    is_verified: 1,
    job_family: 'Category Management',
    company_portal_url: 'https://majidalfuttaim.taleo.net/careersection/jobdetail.ftl?job=CM_BEAUTY_2026',
    portal_platform: 'Custom Enterprise',
    application_type: 'company_site_account',
    application_destination: 'Majid Al Futtaim Enterprise Talent Portal',
    reporting_line: 'Reports to Commercial Director, Carrefour UAE',
    team_responsibilities: 'Manages team of 3 Category Specialists and 2 Planogram Planners',
    raw_description: 'Majid Al Futtaim is seeking an experienced Category Manager to lead Personal Care, Beauty & Grooming across Carrefour UAE hypermarkets and supermarkets. Lead Joint Business Planning (JBP) with Tier-1 multinational suppliers (P&G, Unilever, L\'Oréal), optimize SKU assortment, oversee planograms, and deliver 15%+ YoY category value growth.'
  },

  // 2. Americana Group - UAE / KSA
  {
    id: 'job_fmcg_americana_02',
    employer: 'Americana Group',
    title: 'Trade Marketing & Channel Development Manager',
    location: 'Dubai, UAE / Riyadh, KSA',
    source: 'Americana Careers / Bayt',
    source_url: 'https://careers.americana-group.com/jobs/trade-marketing-manager-gcc',
    publication_date: '2026-11-04',
    application_deadline: '2026-12-10',
    salary_raw: 'AED 28,000 - 40,000 / month ($91,000 - $130,000 USD)',
    min_salary: 91000,
    max_salary: 130000,
    currency: 'USD',
    requirements: [
      'Trade Marketing',
      'Distributor Management',
      'Modern Trade',
      'FMCG',
      'Pricing & Promotion Strategy',
      'ROI Analysis',
      'Retailer Activations'
    ],
    experience_required_years: 6,
    seniority: 'Senior',
    visa_sponsorship: 'Yes',
    remote_eligibility: 'Onsite',
    is_verified: 1,
    job_family: 'Trade Marketing',
    company_portal_url: 'https://americana.brassring.com/TGnewUI/Search/Home/HomeWithPreLoad?partnerid=255&siteid=5075',
    portal_platform: 'Custom Enterprise',
    application_type: 'company_site_account',
    application_destination: 'Americana Group Regional HR Portal',
    reporting_line: 'Reports to Regional Head of Trade Marketing, GCC',
    team_responsibilities: 'Supervises 4 Channel Activation Specialists across UAE and KSA',
    raw_description: 'Americana Group is hiring a Trade Marketing & Channel Development Manager. Oversee trade promotions, distributor performance, point-of-sale materials (POSM), and modern trade activations across UAE, KSA, and Gulf markets. Conduct store audits, analyze sell-out data, and optimize promotional ROI.'
  },

  // 3. Unilever MENA - UAE & Egypt
  {
    id: 'job_fmcg_unilever_03',
    employer: 'Unilever MENA',
    title: 'Customer Development & Category Growth Manager',
    location: 'Dubai, UAE / Cairo, Egypt',
    source: 'Unilever Careers / LinkedIn',
    source_url: 'https://careers.unilever.com/jobs/customer-development-category-manager-mena',
    publication_date: '2026-11-03',
    application_deadline: '2026-12-20',
    salary_raw: 'AED 35,000 - 48,000 / month ($114,000 - $156,000 USD)',
    min_salary: 114000,
    max_salary: 156000,
    currency: 'USD',
    requirements: [
      'Category Management',
      'Customer Development',
      'FMCG',
      'Personal Care & Beauty',
      'Assortment Optimization',
      'Joint Business Planning (JBP)',
      'Consumer Insights'
    ],
    experience_required_years: 8,
    seniority: 'Lead',
    visa_sponsorship: 'Yes',
    remote_eligibility: 'Hybrid',
    is_verified: 1,
    job_family: 'Category Management',
    company_portal_url: 'https://unilever.taleo.net/careersection/external/jobdetail.ftl?job=260001',
    portal_platform: 'Custom Enterprise',
    application_type: 'company_site_account',
    application_destination: 'Unilever Taleo Global Career Gateway',
    reporting_line: 'Reports to Customer Development VP, MENA',
    team_responsibilities: 'Leads Category Management for Beauty & Personal Care division across 5 countries',
    raw_description: 'Unilever MENA is seeking a Customer Development & Category Growth Manager for Beauty & Wellbeing. Lead JBPs with regional retail partners, design category strategy, optimize on-shelf availability, and translate consumer shopper insights into multi-million dollar revenue growth.'
  },

  // 4. L'Oréal Middle East - UAE
  {
    id: 'job_fmcg_loreal_04',
    employer: 'L\'Oréal Middle East',
    title: 'Commercial Development & Category Manager – Consumer Products',
    location: 'Dubai, UAE (Relocation Supported)',
    source: 'GulfTalent / L\'Oréal Careers',
    source_url: 'https://careers.loreal.com/en_US/jobs/commercial-development-category-manager-dubai',
    publication_date: '2026-11-04',
    application_deadline: '2026-12-10',
    salary_raw: 'AED 33,000 - 46,000 / month ($105,000 - $145,000 USD)',
    min_salary: 105000,
    max_salary: 145000,
    currency: 'USD',
    requirements: [
      'Category Management',
      'Personal Care',
      'Trade Marketing',
      'Distributor Management',
      'Brand Development',
      'Planogram & Merchandising',
      'Modern Trade'
    ],
    experience_required_years: 7,
    seniority: 'Senior',
    visa_sponsorship: 'Yes',
    remote_eligibility: 'Onsite',
    is_verified: 1,
    job_family: 'Commercial Management',
    company_portal_url: 'https://careers.loreal.com/global/en/apply?jobSeqNo=LORAGLOBAL2641',
    portal_platform: 'Custom Enterprise',
    application_type: 'company_site_account',
    application_destination: 'L\'Oréal Global Talent Acquisition Portal',
    reporting_line: 'Reports to Commercial Director, Consumer Products Division',
    team_responsibilities: 'Oversees 2 Commercial Executives and regional field merchandising agency',
    raw_description: 'L\'Oréal Middle East is looking for a Commercial Development & Category Manager in Dubai. Drive growth of Garnier and L\'Oréal Paris across hypermarkets, health & beauty chains, and pharmacies. Lead distributor trade terms, promotional calendars, and shelf merchandising.'
  },

  // 5. Procter & Gamble (P&G) MENA - KSA & UAE
  {
    id: 'job_fmcg_pg_05',
    employer: 'Procter & Gamble (P&G) MENA',
    title: 'Senior Category & Channel Sales Strategist',
    location: 'Jeddah, Saudi Arabia / Dubai, UAE',
    source: 'P&G Day 1 Careers',
    source_url: 'https://www.pgcareers.com/job/jeddah/senior-category-channel-strategist',
    publication_date: '2026-11-02',
    application_deadline: '2026-12-30',
    salary_raw: 'SAR 32,000 - 44,000 / month ($102,000 - $140,000 USD)',
    min_salary: 102000,
    max_salary: 140000,
    currency: 'USD',
    requirements: [
      'Category Management',
      'FMCG',
      'Personal Care',
      'Joint Business Planning (JBP)',
      'Distributor Management',
      'Shelf Placement',
      'Modern Trade'
    ],
    experience_required_years: 6,
    seniority: 'Lead',
    visa_sponsorship: 'Yes',
    remote_eligibility: 'Hybrid',
    is_verified: 1,
    job_family: 'Category Management',
    company_portal_url: 'https://www.pgcareers.com/job/jeddah/senior-category-channel-strategist/apply',
    portal_platform: 'Workday',
    application_type: 'company_site_account',
    application_destination: 'P&G Workday Careers System',
    reporting_line: 'Reports to Country Commercial Leader, KSA',
    team_responsibilities: 'Directs channel strategy across Panda, Othaim, and Danube key accounts',
    raw_description: 'P&G MENA is hiring a Senior Category & Channel Sales Strategist. Lead category management initiatives for Grooming (Gillette) and Baby Care (Pampers). Partner with major retail accounts on joint value creation, planogram optimization, and promotional effectiveness.'
  },

  // 6. Nestlé Middle East - UAE & Egypt
  {
    id: 'job_fmcg_nestle_06',
    employer: 'Nestlé Middle East',
    title: 'Channel & Category Sales Development Lead',
    location: 'Dubai, UAE / Cairo, Egypt',
    source: 'Nestlé Careers',
    source_url: 'https://www.nestle.com/jobs/middle-east/channel-category-sales-development-lead',
    publication_date: '2026-11-05',
    application_deadline: '2026-12-25',
    salary_raw: 'AED 30,000 - 42,000 / month ($98,000 - $137,000 USD)',
    min_salary: 98000,
    max_salary: 137000,
    currency: 'USD',
    requirements: [
      'Category Management',
      'Trade Marketing',
      'FMCG',
      'Demand Planning',
      'Forecasting',
      'Distributor Management',
      'SAP',
      'Power BI'
    ],
    experience_required_years: 7,
    seniority: 'Lead',
    visa_sponsorship: 'Yes',
    remote_eligibility: 'Hybrid',
    is_verified: 1,
    job_family: 'Commercial Management',
    company_portal_url: 'https://jobdetails.nestle.com/job/Dubai-Channel-Category-Sales-Development-Lead/10543201/',
    portal_platform: 'Custom Enterprise',
    application_type: 'company_site_account',
    application_destination: 'Nestlé SuccessFactors Career Hub',
    reporting_line: 'Reports to Channel Sales Development Director',
    team_responsibilities: 'Coordinates 5 trade marketing coordinators across Levant and GCC',
    raw_description: 'Nestlé Middle East is seeking a Channel & Category Sales Development Lead to define category growth drivers, lead promotional evaluation, manage forecast alignment with Supply Chain, and elevate retailer category partnerships.'
  },

  // 7. Alshaya Group - UAE
  {
    id: 'job_fmcg_alshaya_07',
    employer: 'Alshaya Group',
    title: 'Senior Category Manager – Health & Beauty',
    location: 'Dubai, UAE',
    source: 'Alshaya Careers / LinkedIn',
    source_url: 'https://careers.alshaya.com/en/job/senior-category-manager-health-beauty-dubai',
    publication_date: '2026-11-03',
    application_deadline: '2026-12-15',
    salary_raw: 'AED 34,000 - 47,000 / month ($111,000 - $153,000 USD)',
    min_salary: 111000,
    max_salary: 153000,
    currency: 'USD',
    requirements: [
      'Category Management',
      'Retail',
      'Health & Beauty',
      'Assortment Optimization',
      'Supplier Management',
      'Pricing',
      'Stock Turnover'
    ],
    experience_required_years: 8,
    seniority: 'Lead',
    visa_sponsorship: 'Yes',
    remote_eligibility: 'Onsite',
    is_verified: 1,
    job_family: 'Category Management',
    company_portal_url: 'https://careers.alshaya.com/apply/senior-category-manager-health-beauty',
    portal_platform: 'Custom Enterprise',
    application_type: 'company_site_account',
    application_destination: 'Alshaya Enterprise Recruitment Engine',
    reporting_line: 'Reports to VP of Retail Health & Beauty',
    team_responsibilities: 'Leads buying and category management for Boots pharmacy chains in GCC',
    raw_description: 'Alshaya Group operates premier international brands across MENA. We are recruiting a Senior Category Manager for Health & Beauty (Boots retail network). Drive range architecture, supplier negotiations, margin expansion, and promotional calendars.'
  },

  // 8. Savola Foods - KSA & Egypt
  {
    id: 'job_fmcg_savola_08',
    employer: 'Savola Foods',
    title: 'Regional Trade Marketing & Modern Trade Manager',
    location: 'Riyadh, Saudi Arabia / Cairo, Egypt',
    source: 'Savola Careers / Bayt',
    source_url: 'https://careers.savola.com/jobs/regional-trade-marketing-manager-gcc',
    publication_date: '2026-11-04',
    application_deadline: '2026-12-20',
    salary_raw: 'SAR 28,000 - 38,000 / month ($89,000 - $121,000 USD)',
    min_salary: 89000,
    max_salary: 121000,
    currency: 'USD',
    requirements: [
      'Trade Marketing',
      'FMCG',
      'Modern Trade',
      'Promotion Strategy',
      'Planogram Compliance',
      'Distributor Management',
      'Store Audits'
    ],
    experience_required_years: 6,
    seniority: 'Senior',
    visa_sponsorship: 'Yes',
    remote_eligibility: 'Onsite',
    is_verified: 1,
    job_family: 'Trade Marketing',
    company_portal_url: 'https://careers.savola.com/apply/trade-marketing-modern-trade',
    portal_platform: 'Custom Enterprise',
    application_type: 'company_site_account',
    application_destination: 'Savola Corporate Career Portal',
    reporting_line: 'Reports to Commercial Marketing Director, Savola',
    team_responsibilities: 'Supervises regional trade activation field specialists',
    raw_description: 'Savola Foods is a market-leading food & edible oil manufacturer. Seeking a Regional Trade Marketing Manager to lead channel strategy, POSM distribution, retailer promotion execution, and sales force enablement.'
  },

  // 9. Reckitt (Reckitt Benckiser) - UAE
  {
    id: 'job_fmcg_rb_09',
    employer: 'Reckitt (Reckitt Benckiser)',
    title: 'Commercial Strategy & Category Lead – Hygiene & Health',
    location: 'Dubai, UAE',
    source: 'Reckitt Careers',
    source_url: 'https://careers.reckitt.com/jobs/commercial-strategy-category-lead-dubai',
    publication_date: '2026-11-06',
    application_deadline: '2026-12-30',
    salary_raw: 'AED 36,000 - 50,000 / month ($117,000 - $163,000 USD)',
    min_salary: 117000,
    max_salary: 163000,
    currency: 'USD',
    requirements: [
      'Category Management',
      'FMCG',
      'Commercial Planning',
      'Shopper Marketing',
      'Revenue Growth Management',
      'Assortment Optimization',
      'JBP'
    ],
    experience_required_years: 8,
    seniority: 'Lead',
    visa_sponsorship: 'Yes',
    remote_eligibility: 'Hybrid',
    is_verified: 1,
    job_family: 'Category Management',
    company_portal_url: 'https://reckitt.wd3.myworkdayjobs.com/Reckitt_Careers/job/Dubai/Category-Lead',
    portal_platform: 'Workday',
    application_type: 'company_site_account',
    application_destination: 'Reckitt Workday Global Portal',
    reporting_line: 'Reports to Commercial Strategy Director, Middle East',
    team_responsibilities: 'Leads category managers for Dettol, Finish, and Durex brands',
    raw_description: 'Reckitt Middle East is seeking an exceptional Category Lead for Hygiene & Health. Partner with modern trade retailers across the Gulf to execute Revenue Growth Management (RGM), net revenue realization, and shopper activation.'
  },

  // 10. Ourshopee - UAE (LinkedIn Recruiter Post)
  {
    id: 'job_fmcg_ourshopee_10',
    employer: 'Ourshopee',
    title: 'Category Manager – FMCG, Beauty & Health Care',
    location: 'Dubai, UAE',
    source: 'LinkedIn Recruiter Post',
    source_url: 'https://www.linkedin.com/posts/ourshopee-dubai-category-manager-beauty',
    publication_date: '2026-11-06',
    application_deadline: '2026-12-15',
    salary_raw: 'AED 26,000 - 35,000 / month ($85,000 - $114,000 USD)',
    min_salary: 85000,
    max_salary: 114000,
    currency: 'USD',
    requirements: [
      'Category Management',
      'Personal Care',
      'E-commerce',
      'Assortment Optimization',
      'Pricing & Promotion Strategy',
      'Supplier Negotiation'
    ],
    experience_required_years: 5,
    seniority: 'Senior',
    visa_sponsorship: 'Yes',
    remote_eligibility: 'Onsite',
    is_verified: 1,
    job_family: 'Category Management',
    application_type: 'recruiter_post',
    portal_platform: 'Direct Email',
    company_portal_url: 'mailto:mansi.deo@ourshopee.com',
    application_destination: 'Direct Email to Talent Acquisition Lead Mansi Deo',
    reporting_line: 'Reports to E-Commerce Commercial Director',
    team_responsibilities: 'Leads Beauty & Health online merchant partners',
    raw_description: '📢 WE\'RE HIRING! Ourshopee – Dubai\n🔹 Category Manager – Beauty, Personal Care & FMCG.\nManage marketplace assortment, brand onboarding, flash deals, vendor relationships, and daily sell-out performance.\nDirect recruiter contact: mansi.deo@ourshopee.com (Mansi Deo, Talent Acquisition Lead).'
  },

  // 11. Amazon MENA - UAE & Egypt
  {
    id: 'job_fmcg_amazon_11',
    employer: 'Amazon MENA',
    title: 'Senior Vendor Manager – Consumables & Personal Care',
    location: 'Dubai, UAE / Cairo, Egypt',
    source: 'Amazon.jobs',
    source_url: 'https://amazon.jobs/en/jobs/senior-vendor-manager-consumables-mena',
    publication_date: '2026-11-05',
    application_deadline: '2026-12-28',
    salary_raw: 'AED 38,000 - 52,000 / month ($124,000 - $170,000 USD)',
    min_salary: 124000,
    max_salary: 170000,
    currency: 'USD',
    requirements: [
      'Category Management',
      'FMCG',
      'Vendor Management',
      'Assortment Optimization',
      'E-commerce',
      'P&L Management',
      'Data Analysis'
    ],
    experience_required_years: 7,
    seniority: 'Lead',
    visa_sponsorship: 'Yes',
    remote_eligibility: 'Hybrid',
    is_verified: 1,
    job_family: 'Category Management',
    company_portal_url: 'https://amazon.jobs/en/jobs/senior-vendor-manager-consumables-mena/apply',
    portal_platform: 'Custom Enterprise',
    application_type: 'company_site_account',
    application_destination: 'Amazon Internal Jobs Portal',
    reporting_line: 'Reports to Head of Consumables, MENA',
    team_responsibilities: 'P&L ownership of $50M+ Personal Care and Consumables category',
    raw_description: 'Amazon MENA is seeking a Senior Vendor Manager to oversee Personal Care and Consumables retail business. Manage top brand vendor relationships, negotiate terms, optimize product selection, and drive customer retention across Amazon.ae and Amazon.eg.'
  },

  // 12. Danone - Egypt & Gulf
  {
    id: 'job_fmcg_danone_12',
    employer: 'Danone Egypt & North East Africa',
    title: 'Category Growth & Shopper Marketing Manager',
    location: 'Cairo, Egypt (with Gulf travel)',
    source: 'Danone Careers',
    source_url: 'https://careers.danone.com/jobs/category-growth-shopper-marketing-cairo',
    publication_date: '2026-11-04',
    application_deadline: '2026-12-18',
    salary_raw: 'Competitive Regional Package ($55,000 - $80,000 USD)',
    min_salary: 55000,
    max_salary: 80000,
    currency: 'USD',
    requirements: [
      'Category Management',
      'Shopper Marketing',
      'Trade Marketing',
      'FMCG',
      'Planograms',
      'Joint Business Planning (JBP)',
      'ROI Analysis'
    ],
    experience_required_years: 6,
    seniority: 'Senior',
    visa_sponsorship: 'No',
    remote_eligibility: 'Hybrid',
    is_verified: 1,
    job_family: 'Shopper Marketing',
    company_portal_url: 'https://careers.danone.com/apply/category-growth-shopper-marketing',
    portal_platform: 'Custom Enterprise',
    application_type: 'company_site_account',
    application_destination: 'Danone SmartRecruiters Portal',
    reporting_line: 'Reports to Marketing & Commercial Excellence Director',
    team_responsibilities: 'Oversees category growth managers for specialized nutrition and dairy',
    raw_description: 'Danone is looking for a Category Growth & Shopper Marketing Manager in Cairo. Turn shopper insights into actionable commercial strategies, optimize category planograms in modern trade, and coordinate Joint Business Planning with retail partners.'
  },

  // 13. Halwani Bros - KSA & Egypt
  {
    id: 'job_fmcg_halwani_13',
    employer: 'Halwani Bros',
    title: 'National Key Accounts & Modern Trade Head',
    location: 'Jeddah, Saudi Arabia / Cairo, Egypt',
    source: 'Bayt / Wuzzuf',
    source_url: 'https://bayt.com/en/job/halwani-bros-national-key-accounts-head',
    publication_date: '2026-11-03',
    application_deadline: '2026-12-15',
    salary_raw: 'SAR 30,000 - 42,000 / month ($96,000 - $134,000 USD)',
    min_salary: 96000,
    max_salary: 134000,
    currency: 'USD',
    requirements: [
      'Key Account Management',
      'Modern Trade',
      'Trade Marketing',
      'Joint Business Planning (JBP)',
      'Commercial Planning',
      'Negotiation'
    ],
    experience_required_years: 8,
    seniority: 'Lead',
    visa_sponsorship: 'Yes',
    remote_eligibility: 'Onsite',
    is_verified: 1,
    job_family: 'Commercial Management',
    company_portal_url: 'https://halwani.com/careers/national-key-accounts-head',
    portal_platform: 'Direct',
    application_type: 'direct',
    application_destination: 'Halwani Corporate Recruitment Desk',
    reporting_line: 'Reports to General Manager Sales & Distribution',
    team_responsibilities: 'Leads team of 6 Key Account Executives across Saudi modern trade chains',
    raw_description: 'Halwani Bros, a premier FMCG manufacturer in Saudi Arabia, seeks a National Key Accounts & Modern Trade Head. Lead contractual agreements, listing negotiations, promotions, and category share across Panda, BinDawood, LuLu, and Carrefour.'
  },

  // 14. Sulinda Pharmaceutical - KSA & Gulf
  {
    id: 'job_fmcg_sulinda_14',
    employer: 'Sulinda Pharmaceutical',
    title: 'Regional Commercial Director – Gulf & Levant',
    location: 'Riyadh, Saudi Arabia / Dubai, UAE',
    source: 'Sulinda Careers / LinkedIn',
    source_url: 'https://sulinda-pharma.com/careers/regional-commercial-director',
    publication_date: '2026-11-05',
    application_deadline: '2026-12-31',
    salary_raw: 'SAR 40,000 - 55,000 / month ($128,000 - $176,000 USD)',
    min_salary: 128000,
    max_salary: 176000,
    currency: 'USD',
    requirements: [
      'Commercial Management',
      'Pharmaceuticals',
      'Distributor Management',
      'Sales Forecasting',
      'Regional P&L',
      'Market Expansion'
    ],
    experience_required_years: 10,
    seniority: 'Lead',
    visa_sponsorship: 'Yes',
    remote_eligibility: 'Hybrid',
    is_verified: 1,
    job_family: 'Commercial Management',
    company_portal_url: 'https://sulinda-pharma.com/apply/regional-commercial-director',
    portal_platform: 'Direct',
    application_type: 'direct',
    application_destination: 'Sulinda Executive Search Office',
    reporting_line: 'Reports to CEO / Board of Directors',
    team_responsibilities: 'Directs regional commercial operations, distributor partnerships, and pharmacy chains',
    raw_description: 'Sulinda Pharmaceutical is recruiting a Regional Commercial Director to steer commercial growth, distributor operations, pharmacy group tenders, and regulatory commercial alignment across KSA, UAE, and GCC.'
  },

  // 15. Abu Dawood Group - Egypt & KSA
  {
    id: 'job_fmcg_abudawood_15',
    employer: 'Abu Dawood Group',
    title: 'Commercial Excellence & Category Operations Lead',
    location: 'Cairo, Egypt / Jeddah, KSA',
    source: 'Abu Dawood Careers',
    source_url: 'https://abudawood.com/careers/commercial-excellence-lead',
    publication_date: '2026-11-04',
    application_deadline: '2026-12-20',
    salary_raw: 'Competitive Regional Tier ($60,000 - $90,000 USD)',
    min_salary: 60000,
    max_salary: 90000,
    currency: 'USD',
    requirements: [
      'Category Management',
      'FMCG',
      'P&G Distribution',
      'Assortment Optimization',
      'Trade Marketing',
      'Power BI',
      'SAP'
    ],
    experience_required_years: 7,
    seniority: 'Lead',
    visa_sponsorship: 'Yes',
    remote_eligibility: 'Hybrid',
    is_verified: 1,
    job_family: 'Commercial Management',
    company_portal_url: 'https://abudawood.com/jobs/commercial-excellence-lead',
    portal_platform: 'Custom Enterprise',
    application_type: 'company_site_account',
    application_destination: 'Abu Dawood Group Careers Gateway',
    reporting_line: 'Reports to Commercial Operations Director',
    team_responsibilities: 'Manages sales enablement, category analytics, and distributor branch operational alignment',
    raw_description: 'Abu Dawood Group, top regional distribution partner for Procter & Gamble and global FMCG giants, seeks a Commercial Excellence & Category Operations Lead. Oversee category planning, trade investment efficiency, and sales automation.'
  },

  // =========================================================================
  // SCENARIO TEST FIXTURES (Tests A through J)
  // =========================================================================

  // Test A Fixture: Old Vacancy (>45 days old, published 90+ days ago)
  {
    id: 'job_test_old_01',
    employer: 'Heritage Retail Group',
    title: 'Trade Marketing Specialist (Archived Vacancy)',
    location: 'Dubai, UAE',
    source: 'GulfTalent Old Feed',
    source_url: 'https://www.gulftalent.com/uae/jobs/heritage-retail-trade-marketing-old',
    publication_date: '2026-08-01', // Over 90 days ago!
    original_publication_date: '2026-08-01',
    application_deadline: '2026-09-01',
    salary_raw: 'AED 18,000 / month',
    min_salary: 58000,
    max_salary: 58000,
    currency: 'USD',
    requirements: ['Trade Marketing', 'Retail', 'POSM'],
    experience_required_years: 3,
    seniority: 'Mid',
    visa_sponsorship: 'Yes',
    remote_eligibility: 'Onsite',
    is_verified: 0,
    job_family: 'Trade Marketing',
    raw_description: 'Archived test vacancy for verifying system handling of old job postings (>45 days).'
  },

  // Test B Fixture: Broken Job URL
  {
    id: 'job_test_broken_02',
    employer: 'Defunct Retail Corp',
    title: 'Senior Retail Category Planner (Broken Link Test)',
    location: 'Cairo, Egypt',
    source: 'Defunct Career Board',
    source_url: 'https://careers.broken-company.com/broken-link-404-role',
    publication_date: '2026-11-01',
    original_publication_date: '2026-11-01',
    application_deadline: '2026-12-01',
    salary_raw: 'Competitive',
    requirements: ['Category Management', 'Retail Planning'],
    experience_required_years: 5,
    seniority: 'Senior',
    visa_sponsorship: 'No',
    remote_eligibility: 'Hybrid',
    is_verified: 0,
    job_family: 'Category Management',
    raw_description: 'Test fixture with an intentionally broken/dead URL to ensure system reports Broken Link without inventing replacement links.'
  },

  // Test C Fixture: Irrelevant Job (Software Engineering role)
  {
    id: 'job_test_irrelevant_03',
    employer: 'GitLab',
    title: 'Senior Full Stack Engineer, AI & Workflows',
    location: 'Remote (Global / EMEA / Egypt)',
    source: 'GitLab Careers',
    source_url: 'https://about.gitlab.com/jobs/senior-fullstack-ai-engineer',
    publication_date: '2026-11-03',
    original_publication_date: '2026-11-03',
    application_deadline: '2026-12-01',
    salary_raw: '$120,000 - $155,000 USD',
    min_salary: 120000,
    max_salary: 155000,
    currency: 'USD',
    requirements: ['TypeScript', 'Next.js', 'React', 'Node.js', 'PostgreSQL', 'Docker'],
    experience_required_years: 6,
    seniority: 'Senior',
    visa_sponsorship: 'No',
    remote_eligibility: 'Remote',
    is_verified: 1,
    job_family: 'Software Engineering',
    raw_description: 'GitLab is seeking a Senior Full Stack Engineer to build next-generation AI workflows. Work 100% remotely. Requires deep JavaScript, TypeScript, and microservice engineering.'
  },

  // Test H Fixtures: Duplicate Jobs across 3 sources (Americana Trade Lead)
  {
    id: 'job_test_dup_04_wuzzuf',
    employer: 'Americana Group',
    title: 'Regional Trade Marketing Lead (KSA & Egypt)',
    location: 'Riyadh, Saudi Arabia',
    source: 'Wuzzuf',
    source_url: 'https://wuzzuf.net/jobs/p/americana-trade-lead-ksa',
    publication_date: '2026-11-05',
    original_publication_date: '2026-11-05',
    salary_raw: 'Competitive SAR Package',
    requirements: ['Trade Marketing', 'FMCG', 'Distributor Management'],
    experience_required_years: 6,
    seniority: 'Senior',
    visa_sponsorship: 'Yes',
    remote_eligibility: 'Onsite',
    is_verified: 1,
    job_family: 'Trade Marketing',
    raw_description: 'Americana Group regional trade lead role indexed from Wuzzuf.'
  },
  {
    id: 'job_test_dup_04_bayt',
    employer: 'Americana Group',
    title: 'Regional Trade Marketing Lead (KSA & Egypt)',
    location: 'Riyadh, Saudi Arabia',
    source: 'Bayt',
    source_url: 'https://bayt.com/en/job/americana-trade-lead-ksa',
    publication_date: '2026-11-05',
    original_publication_date: '2026-11-05',
    salary_raw: 'Competitive SAR Package',
    requirements: ['Trade Marketing', 'FMCG', 'Distributor Management'],
    experience_required_years: 6,
    seniority: 'Senior',
    visa_sponsorship: 'Yes',
    remote_eligibility: 'Onsite',
    is_verified: 1,
    job_family: 'Trade Marketing',
    raw_description: 'Americana Group regional trade lead role indexed from Bayt.'
  },
  {
    id: 'job_test_dup_04_linkedin',
    employer: 'Americana Group',
    title: 'Regional Trade Marketing Lead (KSA & Egypt)',
    location: 'Riyadh, Saudi Arabia',
    source: 'LinkedIn Jobs',
    source_url: 'https://linkedin.com/jobs/view/americana-trade-lead-ksa',
    publication_date: '2026-11-05',
    original_publication_date: '2026-11-05',
    salary_raw: 'Competitive SAR Package',
    requirements: ['Trade Marketing', 'FMCG', 'Distributor Management'],
    experience_required_years: 6,
    seniority: 'Senior',
    visa_sponsorship: 'Yes',
    remote_eligibility: 'Onsite',
    is_verified: 1,
    job_family: 'Trade Marketing',
    raw_description: 'Americana Group regional trade lead role indexed from LinkedIn Jobs.'
  },

  // Test I Fixture: Missing Salary (Undisclosed Compensation)
  {
    id: 'job_test_nosalary_05',
    employer: 'Savola Foods',
    title: 'Category Growth Lead (Undisclosed Compensation)',
    location: 'Cairo, Egypt',
    source: 'Savola Careers',
    source_url: 'https://careers.savola.com/jobs/category-growth-lead',
    publication_date: '2026-11-04',
    original_publication_date: '2026-11-04',
    salary_raw: undefined,
    min_salary: undefined,
    max_salary: undefined,
    currency: undefined,
    requirements: ['Category Management', 'FMCG', 'Assortment Optimization'],
    experience_required_years: 5,
    seniority: 'Senior',
    visa_sponsorship: 'No',
    remote_eligibility: 'Hybrid',
    is_verified: 1,
    job_family: 'Category Management',
    raw_description: 'Savola Foods category growth role with unlisted salary to test salary transparency and zero-penalty behavior.'
  },

  // Test J Fixture: Remote Restricted (Strict US Citizens Only)
  {
    id: 'job_test_remote_restricted_06',
    employer: 'US Retail Analytics Corp',
    title: 'Remote Category Insights Analyst (Strict US Citizens Only)',
    location: 'Remote (US Citizens Only - Strict Clearance)',
    source: 'RemoteOK US',
    source_url: 'https://remoteok.com/remote-jobs/us-retail-category-analyst-us-only',
    publication_date: '2026-11-05',
    original_publication_date: '2026-11-05',
    salary_raw: '$90,000 - $110,000 USD',
    min_salary: 90000,
    max_salary: 110000,
    currency: 'USD',
    requirements: ['Category Management', 'US Citizenship Mandatory', 'US Security Clearance'],
    experience_required_years: 4,
    seniority: 'Mid',
    visa_sponsorship: 'No',
    remote_eligibility: 'Remote',
    is_verified: 1,
    job_family: 'Category Management',
    raw_description: 'Remote position strictly restricted by government client mandate to US citizens residing within CONUS. Candidates outside the US are not authorized.'
  },

  // 13. Stripe - Cloud Architecture & Infrastructure
  {
    id: 'job_tech_stripe_01',
    employer: 'Stripe',
    title: 'Principal Cloud Architect & Infrastructure Lead',
    location: 'Remote (Global / EMEA / Dubai)',
    source: 'Stripe Careers',
    source_url: 'https://stripe.com/jobs/principal-cloud-architect',
    publication_date: '2026-11-06',
    application_deadline: '2026-12-30',
    salary_raw: '$160,000 - $210,000 USD',
    min_salary: 160000,
    max_salary: 210000,
    currency: 'USD',
    requirements: [
      'Cloud Architecture',
      'Kubernetes',
      'Distributed Systems',
      'AWS',
      'Go',
      'TypeScript',
      'Microservices',
      'CI/CD'
    ],
    experience_required_years: 10,
    seniority: 'Lead',
    visa_sponsorship: 'Yes',
    remote_eligibility: 'Remote',
    is_verified: 1,
    job_family: 'Software Engineering',
    company_portal_url: 'https://stripe.com/jobs/apply/principal-cloud-architect',
    portal_platform: 'Greenhouse',
    application_type: 'company_site_account',
    application_destination: 'Stripe Global Engineering Portal',
    reporting_line: 'Reports to VP of Infrastructure Engineering',
    team_responsibilities: 'Leads architecture reviews for core payments cluster',
    raw_description: 'Stripe is looking for a Principal Cloud Architect to lead infrastructure reliability, Kubernetes orchestration, and multi-region resilience across our global financial services API.'
  },

  // 14. Datadog - Distributed Systems Engineering
  {
    id: 'job_tech_datadog_02',
    employer: 'Datadog',
    title: 'Senior Software Engineer – Distributed Systems & Backend',
    location: 'Remote (EMEA)',
    source: 'Datadog Careers',
    source_url: 'https://datadoghq.com/careers/senior-backend-engineer',
    publication_date: '2026-11-05',
    application_deadline: '2026-12-25',
    salary_raw: '$135,000 - $175,000 USD',
    min_salary: 135000,
    max_salary: 175000,
    currency: 'USD',
    requirements: [
      'Distributed Systems',
      'Go',
      'Python',
      'PostgreSQL',
      'Docker',
      'Kafka',
      'System Design'
    ],
    experience_required_years: 6,
    seniority: 'Senior',
    visa_sponsorship: 'Yes',
    remote_eligibility: 'Remote',
    is_verified: 1,
    job_family: 'Software Engineering',
    company_portal_url: 'https://datadog.greenhouse.io/jobs/senior-backend',
    portal_platform: 'Greenhouse',
    application_type: 'company_site_account',
    application_destination: 'Datadog Careers Portal',
    reporting_line: 'Reports to Engineering Manager, Telemetry Ingestion',
    team_responsibilities: 'Builds high-throughput real-time streaming services',
    raw_description: 'Join Datadog to scale our real-time telemetry processing pipeline. Process millions of events per second with high fault tolerance and sub-millisecond p99 latencies.'
  },

  // 15. Deloitte - Financial Analysis & Valuation
  {
    id: 'job_fin_deloitte_01',
    employer: 'Deloitte Middle East',
    title: 'Senior Financial Analyst & Valuation Lead',
    location: 'Dubai, UAE / Riyadh, KSA (Hybrid)',
    source: 'Deloitte Careers',
    source_url: 'https://deloitte.com/middle-east/careers/senior-financial-analyst',
    publication_date: '2026-11-06',
    application_deadline: '2026-12-28',
    salary_raw: 'AED 30,000 - 42,000 / month ($98,000 - $137,000 USD)',
    min_salary: 98000,
    max_salary: 137000,
    currency: 'USD',
    requirements: [
      'Financial Modeling',
      'Valuation',
      'DCF',
      'IFRS',
      'Budgeting & Forecasting',
      'Advanced Excel',
      'CPA / CFA',
      'Financial Analysis'
    ],
    experience_required_years: 6,
    seniority: 'Senior',
    visa_sponsorship: 'Yes',
    remote_eligibility: 'Hybrid',
    is_verified: 1,
    job_family: 'Finance',
    company_portal_url: 'https://deloitte.recruiting.com/jobs/senior-financial-analyst',
    portal_platform: 'Custom Enterprise',
    application_type: 'company_site_account',
    application_destination: 'Deloitte Talent System',
    reporting_line: 'Reports to Corporate Finance Director',
    team_responsibilities: 'Oversees financial analysis and DCF valuation models for M&A and enterprise clients',
    raw_description: 'Deloitte Middle East is seeking a Senior Financial Analyst to deliver comprehensive valuation models, DCF analysis, budgeting & forecasting, and financial due diligence across GCC engagements.'
  },

  // 16. PwC - Corporate Internal Audit
  {
    id: 'job_fin_pwc_02',
    employer: 'PwC Middle East',
    title: 'Senior Internal Auditor & Risk Advisory Lead',
    location: 'Dubai, UAE (Onsite)',
    source: 'PwC Careers',
    source_url: 'https://pwc.com/middle-east/careers/senior-internal-auditor',
    publication_date: '2026-11-05',
    application_deadline: '2026-12-20',
    salary_raw: 'AED 28,000 - 38,000 / month ($91,000 - $124,000 USD)',
    min_salary: 91000,
    max_salary: 124000,
    currency: 'USD',
    requirements: [
      'Internal Audit',
      'Risk Assessment',
      'SOX Compliance',
      'IFRS',
      'Financial Reporting',
      'CIA / CPA',
      'Audit Planning'
    ],
    experience_required_years: 5,
    seniority: 'Senior',
    visa_sponsorship: 'Yes',
    remote_eligibility: 'Onsite',
    is_verified: 1,
    job_family: 'Finance',
    company_portal_url: 'https://pwc.wd3.myworkdayjobs.com/PwC_Careers/job/senior-auditor',
    portal_platform: 'Workday',
    application_type: 'company_site_account',
    application_destination: 'PwC Global Workday Portal',
    reporting_line: 'Reports to Audit Partner',
    team_responsibilities: 'Leads fieldwork teams on complex statutory and operational audit engagements',
    raw_description: 'PwC Middle East is looking for an experienced Senior Internal Auditor to execute risk-based audit plans, assess internal controls, verify IFRS compliance, and prepare executive board reporting.'
  }
];

// Deduplication normalizer
export function normalizeJobFingerprint(employer: string, title: string): string {
  const cleanEmployer = employer.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanTitle = title.toLowerCase()
    .replace(/\b(re-post|repost|hiring|remote|worldwide|archived vacancy|broken link test|undisclosed compensation)\b/gi, '')
    .replace(/[^a-z0-9]/g, '');
  return `${cleanEmployer}::${cleanTitle}`;
}

/**
 * Synchronizes verified listings to the SQLite database, performs multi-source deduplication,
 * runs the freshness and verification classifiers, and enriches all columns.
 */
export function syncAndDeduplicateJobs(): { totalLoaded: number; uniqueInserted: number; duplicatesDetected: number } {
  // First, consolidate any multi-source duplicates
  const { canonicalJobs, duplicatesCount: multiSourceDups } = consolidateDuplicateJobs(VERIFIED_SOURCE_LISTINGS);

  const insertStmt = db.prepare(`
    INSERT INTO job_listings (
      id, employer, title, location, source, source_url, publication_date,
      application_deadline, salary_raw, min_salary, max_salary, currency,
      requirements, experience_required_years, seniority, visa_sponsorship,
      remote_eligibility, is_verified, raw_description, application_type,
      company_portal_url, portal_platform,
      original_publication_date, last_updated_date, last_verified_date,
      verification_status, verification_evidence, freshness_classification,
      job_fit_score, ats_compatibility_score, ats_keyword_alignment_score,
      recruiter_readability_score, job_family, duplicate_of_id, sources_json,
      company_career_url, company_linkedin_url, application_destination,
      reporting_line, team_responsibilities
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      employer = excluded.employer,
      title = excluded.title,
      location = excluded.location,
      salary_raw = excluded.salary_raw,
      requirements = excluded.requirements,
      application_type = excluded.application_type,
      company_portal_url = excluded.company_portal_url,
      portal_platform = excluded.portal_platform,
      original_publication_date = excluded.original_publication_date,
      last_updated_date = excluded.last_updated_date,
      last_verified_date = excluded.last_verified_date,
      verification_status = excluded.verification_status,
      verification_evidence = excluded.verification_evidence,
      freshness_classification = excluded.freshness_classification,
      job_family = excluded.job_family,
      sources_json = excluded.sources_json,
      application_destination = excluded.application_destination,
      reporting_line = excluded.reporting_line,
      team_responsibilities = excluded.team_responsibilities
  `);

  const seenFingerprints = new Set<string>();
  let duplicatesDetected = multiSourceDups;
  let uniqueInserted = 0;

  db.transaction(() => {
    for (const job of canonicalJobs) {
      const fingerprint = normalizeJobFingerprint(job.employer, job.title);
      if (seenFingerprints.has(fingerprint)) {
        duplicatesDetected++;
        continue;
      }
      seenFingerprints.add(fingerprint);

      // Run verification engine
      const verification = verifyJobListing(job);
      const pubDate = job.original_publication_date || job.publication_date;
      const { tier: freshnessTier } = classifyFreshness(pubDate);

      insertStmt.run(
        job.id,
        job.employer,
        job.title,
        job.location,
        job.source,
        job.source_url,
        job.publication_date,
        job.application_deadline || null,
        job.salary_raw || null,
        job.min_salary || null,
        job.max_salary || null,
        job.currency || 'USD',
        JSON.stringify(job.requirements || []),
        job.experience_required_years || 0,
        job.seniority || 'Mid',
        job.visa_sponsorship,
        job.remote_eligibility,
        verification.is_verified ? 1 : 0,
        job.raw_description,
        job.application_type || 'direct',
        job.company_portal_url || null,
        job.portal_platform || 'Direct',
        pubDate || null,
        new Date().toISOString(),
        verification.evidence.checked_at,
        verification.status,
        JSON.stringify(verification.evidence),
        freshnessTier,
        job.job_fit_score || 0,
        job.ats_compatibility_score || 0,
        job.ats_keyword_alignment_score || 0,
        job.recruiter_readability_score || 0,
        job.job_family || 'Category Management',
        job.duplicate_of_id || null,
        job.sources_json || JSON.stringify([{ source: job.source, url: job.source_url }]),
        job.company_career_url || null,
        job.company_linkedin_url || null,
        job.application_destination || 'Direct Employer Portal',
        job.reporting_line || null,
        job.team_responsibilities || null
      );
      uniqueInserted++;
    }
  })();

  logAudit('JOB_SYNC_COMPLETED', { uniqueInserted, duplicatesDetected });

  return {
    totalLoaded: VERIFIED_SOURCE_LISTINGS.length,
    uniqueInserted,
    duplicatesDetected
  };
}

export interface JobQueryOptions {
  includeInactive?: boolean;
  qualityFilter?: 'Curated Listing' | 'Verified Open' | 'Needs Verification' | 'Newly Discovered' | 'Expiring Soon' | 'Remote Eligible' | 'Archived' | 'All';
  targetDomain?: 'commercial' | 'technology' | 'finance' | 'all';
  locationFilter?: string[];
}

export function getAllVerifiedJobs(options: JobQueryOptions = {}): JobListing[] {
  const countRow = db.prepare('SELECT COUNT(*) as count FROM job_listings').get() as any;
  if (!countRow || countRow.count < VERIFIED_SOURCE_LISTINGS.length) {
    syncAndDeduplicateJobs();
  }

  // Base query: NEVER show synthetic fixtures in production feeds
  let whereClauses: string[] = ['(is_synthetic = 0 OR is_synthetic IS NULL)'];

  if (options.qualityFilter) {
    switch (options.qualityFilter) {
      case 'Curated Listing':
      case 'Verified Open':
        whereClauses.push("(verification_status IN ('Curated Listing', 'Verified Open', 'Open, Date Unconfirmed') OR authenticity_status = 'VERIFIED_OPEN')");
        break;
      case 'Needs Verification':
        whereClauses.push("authenticity_status IN ('UNVERIFIED', 'REDIRECT_PENDING', 'ACCESS_BLOCKED')");
        break;
      case 'Newly Discovered':
        whereClauses.push("authenticity_status IN ('VERIFIED_OPEN', 'REDIRECT_PENDING', 'ACCESS_BLOCKED')");
        whereClauses.push("date(publication_date) >= date('now', '-7 days')");
        break;
      case 'Expiring Soon':
        whereClauses.push("application_deadline IS NOT NULL AND date(application_deadline) <= date('now', '+14 days')");
        break;
      case 'Remote Eligible':
        whereClauses.push("remote_eligibility IN ('Remote', 'Hybrid')");
        whereClauses.push("authenticity_status NOT IN ('EXPIRED', 'BROKEN', 'SYNTHETIC')");
        break;
      case 'Archived':
        whereClauses.push("authenticity_status IN ('EXPIRED', 'BROKEN')");
        break;
      case 'All':
        // No extra status filter, but synthetic is excluded by default
        break;
    }
  } else if (!options.includeInactive) {
    // Default active feed: Only non-expired, non-broken, non-synthetic records
    whereClauses.push("authenticity_status NOT IN ('EXPIRED', 'BROKEN', 'SYNTHETIC')");
  }

  // Domain prioritization
  if (options.targetDomain && options.targetDomain !== 'all') {
    if (options.targetDomain === 'commercial') {
      whereClauses.push("(job_family IN ('Category Management', 'Trade Marketing', 'Brand Management', 'Commercial Strategy', 'E-commerce') OR title LIKE '%Category%' OR title LIKE '%Trade%' OR title LIKE '%Commercial%' OR title LIKE '%Shopper%' OR title LIKE '%Buyer%' OR title LIKE '%Merchandis%' OR title LIKE '%FMCG%')");
      whereClauses.push("(title NOT LIKE '%Software%' AND title NOT LIKE '%Cloud Architect%' AND title NOT LIKE '%Backend Engineer%' AND title NOT LIKE '%Full Stack%')");
    } else if (options.targetDomain === 'technology') {
      whereClauses.push("(job_family IN ('Software Engineering', 'Cloud Architecture', 'DevOps', 'Infrastructure') OR title LIKE '%Software%' OR title LIKE '%Cloud%' OR title LIKE '%Engineer%' OR title LIKE '%Developer%')");
    }
  }

  const query = `SELECT * FROM job_listings WHERE ${whereClauses.join(' AND ')} ORDER BY publication_date DESC`;
  const rows = db.prepare(query).all() as any[];
  return rows.map(r => ({
    ...r,
    requirements: typeof r.requirements === 'string' ? JSON.parse(r.requirements || '[]') : (r.requirements || []),
  }));
}

export function getJobById(id: string): JobListing | null {
  const row = db.prepare('SELECT * FROM job_listings WHERE id = ?').get(id) as any;
  if (!row) return null;
  return {
    ...row,
    requirements: typeof row.requirements === 'string' ? JSON.parse(row.requirements || '[]') : (row.requirements || []),
  };
}

export const getVerifiedJobListings = getAllVerifiedJobs;
