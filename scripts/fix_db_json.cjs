const Database = require('better-sqlite3');
const db = new Database('./data/career_app.db');

const skillsArr = [
  'Category Management', 'Trade Marketing', 'FMCG', 'Personal Care', 'Assortment Optimization',
  'Pricing & Promotion Strategy', 'Market & Competitor Analysis', 'Demand Planning', 'Forecasting',
  'Inventory Management', 'Planogram & Merchandising', 'ROI Analysis', 'Advanced Excel', 'Power BI',
  'SAP', 'Salesforce Commerce Cloud', 'CRM Platforms', 'E-commerce', 'Commercial Planning',
  'Supplier & Distributor Management', 'Cross-functional Collaboration', 'Product Launch', 'Consumer & Shopper Insights'
];

const targetRolesArr = [
  'Category Manager', 'Senior Category Manager - Beauty & FMCG', 'Trade Marketing Manager',
  'Commercial Manager', 'Head of Category Management', 'Brand Development Manager', 'E-commerce Manager'
];

const targetIndustriesArr = [
  'Fast-Moving Consumer Goods (FMCG)', 'Personal Care & Beauty', 'Retail & E-Commerce', 'Pharmaceuticals & Health'
];

const targetCountriesArr = ['Egypt', 'United Arab Emirates', 'Saudi Arabia', 'Remote (Global)'];
const targetCitiesArr = ['Cairo', 'Dubai', 'Riyadh'];

db.prepare(`
  UPDATE profiles
  SET headline = ?,
      skills = ?,
      target_roles = ?,
      target_industries = ?,
      languages = ?,
      preferred_companies = ?,
      excluded_companies = ?
  WHERE user_id = ?
`).run(
  'Category & Trade Marketing Professional',
  JSON.stringify(skillsArr),
  JSON.stringify(targetRolesArr),
  JSON.stringify(targetIndustriesArr),
  JSON.stringify(['Arabic (Native)', 'English (Fluent / C1)']),
  JSON.stringify(['Noon', 'Careem', 'Amazon', 'L’Oréal', 'Unilever', 'P&G']),
  JSON.stringify([]),
  'user_default_01'
);

db.prepare(`
  UPDATE profile_locations
  SET target_countries = ?,
      target_cities = ?,
      relocation_willing = 1,
      relocation_timeline = 'Within 1 month',
      visa_sponsorship_required = 1,
      remote_eligibility = 'Global / EMEA',
      work_mode_preference = 'Hybrid'
  WHERE user_id = ?
`).run(
  JSON.stringify(targetCountriesArr),
  JSON.stringify(targetCitiesArr),
  'user_default_01'
);

console.log('Database updated with proper JSON arrays for Aya Hamouda.');
db.close();
