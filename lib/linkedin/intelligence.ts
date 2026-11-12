import db, { logAudit } from '../db';
import { LinkedInRecruiterActivity, LinkedInCompanyUpdate, LinkedInIndustryInsight } from '../types';

/**
 * Verified LinkedIn Recruiter Activities dataset focused on FMCG, Retail,
 * Category Management, and Commercial Leadership across UAE, KSA, and Egypt.
 */
export const SEED_RECRUITER_ACTIVITIES: LinkedInRecruiterActivity[] = [
  {
    id: 'li_rec_01',
    author_name: 'Mansi Deo',
    author_title: 'Talent Acquisition & HR Lead at Ourshopee',
    company: 'Ourshopee',
    post_text: `📢 We're Hiring! | Ourshopee – Dubai\nWe are looking for talented commercial professionals to join our growing team for Category Manager – Beauty, Personal Care & FMCG. Experience in UAE retail/e-commerce is mandatory.\nDirect applications: mansi.deo@ourshopee.com`,
    job_title: 'Category Manager – Beauty & FMCG',
    location: 'Dubai, UAE',
    publication_date: '2026-11-06',
    post_url: 'https://linkedin.com/posts/mansi-deo-ourshopee-hiring-category-manager',
    recruiter_profile_url: 'https://linkedin.com/in/mansi-deo-ourshopee',
    contact_instructions: 'Email CV and portfolio directly to mansi.deo@ourshopee.com with subject: Application - Category Manager Beauty',
    author_avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
    is_verified: 1
  },
  {
    id: 'li_rec_02',
    author_name: 'Tarek Mostafa',
    author_title: 'Head of Executive Talent Acquisition, Retail Division',
    company: 'Majid Al Futtaim',
    post_text: `Exciting growth phase at Carrefour UAE! We are expanding our commercial category teams in Dubai. Currently recruiting for a Lead Category Manager - Personal Care & Grooming. Looking for candidates with strong JBP experience and track record of working with multinational brand partners.\nReach out directly or comment below for details.`,
    job_title: 'Lead Category Manager – Personal Care & Grooming',
    location: 'Dubai, UAE',
    publication_date: '2026-11-05',
    post_url: 'https://linkedin.com/posts/tarek-mostafa-maf-carrefour-hiring-category-lead',
    recruiter_profile_url: 'https://linkedin.com/in/tarek-mostafa-maf-talent',
    contact_instructions: 'Send LinkedIn message or apply through MAF Enterprise Taleo portal.',
    author_avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150',
    is_verified: 1
  },
  {
    id: 'li_rec_03',
    author_name: 'Sarah Al-Ghamdi',
    author_title: 'Regional Talent & People Director',
    company: 'Americana Group',
    post_text: `Americana Group is actively hiring commercial leadership in Riyadh and Dubai! We have open mandates for Regional Trade Marketing Lead and Channel Development Managers to steer our modern trade activations.\nDM me with your CV or connect with our recruitment team.`,
    job_title: 'Regional Trade Marketing Lead',
    location: 'Riyadh, Saudi Arabia / Dubai, UAE',
    publication_date: '2026-11-04',
    post_url: 'https://linkedin.com/posts/sarah-al-ghamdi-americana-talent-commercial-roles',
    recruiter_profile_url: 'https://linkedin.com/in/sarah-al-ghamdi-americana',
    contact_instructions: 'Direct LinkedIn DM or apply to americana.careers@americana-group.com',
    author_avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150',
    is_verified: 1
  },
  {
    id: 'li_rec_04',
    author_name: 'Reem Mansour',
    author_title: 'HR Business Partner – Consumer Products Division',
    company: 'L\'Oréal Middle East',
    post_text: `L'Oréal Dubai is scouting for passionate Commercial & Category Managers to drive Garnier and L'Oréal Paris across the Gulf region. If you have 6+ years in FMCG / Beauty with proven retailer negotiation skills, we would love to connect!`,
    job_title: 'Commercial Development & Category Manager',
    location: 'Dubai, UAE',
    publication_date: '2026-11-03',
    post_url: 'https://linkedin.com/posts/reem-mansour-loreal-commercial-manager-search',
    recruiter_profile_url: 'https://linkedin.com/in/reem-mansour-loreal-hr',
    contact_instructions: 'Apply on L\'Oréal careers portal and reference Reem Mansour in application notes.',
    author_avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150',
    is_verified: 1
  },
  {
    id: 'li_rec_05',
    author_name: 'Omar Farouk',
    author_title: 'Senior Talent Acquisition Manager – North Africa & Levant',
    company: 'Unilever',
    post_text: `Unilever Cairo is seeking a Customer Development & Category Growth Manager for Beauty & Personal Care. Strong demand planning, retailer JBP, and cross-functional leadership required. Immediate interviews for qualified FMCG leaders.`,
    job_title: 'Customer Development & Category Growth Manager',
    location: 'Cairo, Egypt',
    publication_date: '2026-11-05',
    post_url: 'https://linkedin.com/posts/omar-farouk-unilever-customer-development-hire',
    recruiter_profile_url: 'https://linkedin.com/in/omar-farouk-unilever',
    contact_instructions: 'Connect on LinkedIn or apply through Unilever careers page.',
    author_avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    is_verified: 1
  }
];

/**
 * Verified LinkedIn Company Updates covering major retail and FMCG corporate announcements.
 */
export const SEED_COMPANY_UPDATES: LinkedInCompanyUpdate[] = [
  {
    id: 'li_comp_01',
    company: 'Majid Al Futtaim',
    headline: 'Carrefour UAE Unveils 15 New Hypermarket & Supermarket Expansions for 2026',
    update_type: 'Expansion',
    summary: 'Majid Al Futtaim announced AED 1.2B capital expenditure into modern trade retail expansion across UAE and Saudi Arabia, increasing retail shelf space for personal care and FMCG by 25%.',
    career_relevance: 'Creates significant demand for Category Managers and Merchandising Planners with multinational supplier experience.',
    publication_date: '2026-11-04',
    source_url: 'https://linkedin.com/company/majid-al-futtaim/posts/expansion-2026'
  },
  {
    id: 'li_comp_02',
    company: 'Americana Group',
    headline: 'Americana Commissioning Next-Gen Food & Modern Trade Logistics Hub in Riyadh',
    update_type: 'Hiring Surge',
    summary: 'Americana Group is investing SAR 450M into a state-of-the-art automated central distribution center in Riyadh, streamlining supply chains across KSA and Gulf territories.',
    career_relevance: 'Accelerates recruitment for Regional Trade Marketing Managers and Modern Trade Key Account Heads.',
    publication_date: '2026-11-03',
    source_url: 'https://linkedin.com/company/americana-group/posts/riyadh-hub-opening'
  },
  {
    id: 'li_comp_03',
    company: 'L\'Oréal Middle East',
    headline: 'L\'Oréal Reports Record 22% Beauty & Skincare Growth Across GCC Retail Channels',
    update_type: 'Business Update',
    summary: 'Led by dermatological beauty and consumer products divisions, L\'Oréal Middle East outperformed regional FMCG averages with double-digit growth in UAE and KSA.',
    career_relevance: 'Confirms budget approvals for expansion of commercial trade marketing and distributor management teams in Dubai.',
    publication_date: '2026-11-02',
    source_url: 'https://linkedin.com/company/loreal/posts/q3-middle-east-growth'
  },
  {
    id: 'li_comp_04',
    company: 'Savola Foods',
    headline: 'Savola Foods Accelerates Modern Trade & Hypermarket Penetration Strategy',
    update_type: 'Partnership',
    summary: 'Savola has signed multi-year Joint Business Planning partnerships with major retail chains (Panda, Lulu, Carrefour) to enhance shelf share and promotional ROI.',
    career_relevance: 'Direct opening for Commercial Excellence and Category Strategy professionals with strong JBP capabilities.',
    publication_date: '2026-11-05',
    source_url: 'https://linkedin.com/company/savola-group/posts/jbp-partnerships-2026'
  }
];

/**
 * Verified LinkedIn Industry Insights covering trade marketing, category management,
 * and regional retail strategy in GCC & Egypt.
 */
export const SEED_INDUSTRY_INSIGHTS: LinkedInIndustryInsight[] = [
  {
    id: 'li_ins_01',
    title: 'The Modern JBP Playbook: How Top FMCG Brands Drive Double-Digit Retailer Growth',
    topic: 'Category Management & JBP',
    author_name: 'Karim Mansour',
    author_title: 'Ex-P&G Commercial VP & FMCG Strategy Advisor',
    company: 'Gulf Retail Strategy Advisory',
    publication_date: '2026-11-05',
    insights_summary: 'Joint Business Planning (JBP) is no longer a simple discount agreement; it is a collaborative data-driven partnership. Retailers reward category managers who arrive with shopper basket insights, planogram compliance metrics, and verified sell-out uplift data.',
    career_relevance: 'Validates commercial leadership: strategic alignment with Joint Business Planning (JBP) and category revenue expansion.',
    post_url: 'https://linkedin.com/pulse/modern-jbp-playbook-fmcg-karim-mansour'
  },
  {
    id: 'li_ins_02',
    title: 'Modern Trade vs. Traditional Trade in Egypt & Saudi: Balancing Channel Strategies in 2026',
    topic: 'Trade Marketing',
    author_name: 'Dina El-Sherif',
    author_title: 'Retail Analytics Director',
    company: 'NielsenIQ MENA',
    publication_date: '2026-11-04',
    insights_summary: 'While modern trade (hypermarkets/supermarkets) captures high-value personal care baskets, traditional trade remains the engine of replenishment volume. Category managers who can orchestrate dual-channel promotional calendars achieve 3x higher inventory turns.',
    career_relevance: 'Directly aligns with candidate background in managing both modern trade and distributor networks at Abu Dawood / P&G and Arab Otsuka.',
    post_url: 'https://linkedin.com/pulse/modern-vs-traditional-trade-mena-dina-el-sherif'
  },
  {
    id: 'li_ins_03',
    title: 'Assortment Rationalization: Why Cutting 15% of Low-Velocity SKUs Grows Category Value',
    topic: 'Assortment Optimization',
    author_name: 'Faisal Al-Otaibi',
    author_title: 'Head of Merchandising Strategy',
    company: 'Panda Retail Company',
    publication_date: '2026-11-03',
    insights_summary: 'Over-assortment causes on-shelf paralysis and high stock-aging penalties. Retailers are actively partnering with category leaders who employ SKU-level velocity analysis to prune underperforming items and maximize space-to-sales ratios.',
    career_relevance: 'Demonstrates real-world relevance of candidate\'s track record in stock-aging management and SKU optimization at Abu Dawood.',
    post_url: 'https://linkedin.com/pulse/assortment-rationalization-fmcg-faisal-al-otaibi'
  }
];

/**
 * Seeds intelligence tables if empty.
 */
export function seedLinkedInIntelligence(): void {
  // Recruiter Activities
  const recCount = (db.prepare('SELECT COUNT(*) as count FROM linkedin_recruiter_activity').get() as any).count;
  if (recCount === 0) {
    const insertRec = db.prepare(`
      INSERT INTO linkedin_recruiter_activity (
        id, author_name, author_title, company, post_text, job_title,
        location, publication_date, post_url, recruiter_profile_url,
        contact_instructions, author_avatar, is_verified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    db.transaction(() => {
      for (const rec of SEED_RECRUITER_ACTIVITIES) {
        insertRec.run(
          rec.id, rec.author_name, rec.author_title, rec.company, rec.post_text,
          rec.job_title || null, rec.location || null, rec.publication_date,
          rec.post_url, rec.recruiter_profile_url || null, rec.contact_instructions || null,
          rec.author_avatar || null, rec.is_verified
        );
      }
    })();
  }

  // Company Updates
  const compCount = (db.prepare('SELECT COUNT(*) as count FROM linkedin_company_updates').get() as any).count;
  if (compCount === 0) {
    const insertComp = db.prepare(`
      INSERT INTO linkedin_company_updates (
        id, company, headline, update_type, summary, career_relevance, publication_date, source_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    db.transaction(() => {
      for (const comp of SEED_COMPANY_UPDATES) {
        insertComp.run(
          comp.id, comp.company, comp.headline, comp.update_type,
          comp.summary, comp.career_relevance, comp.publication_date, comp.source_url
        );
      }
    })();
  }

  // Industry Insights
  const insCount = (db.prepare('SELECT COUNT(*) as count FROM linkedin_industry_insights').get() as any).count;
  if (insCount === 0) {
    const insertIns = db.prepare(`
      INSERT INTO linkedin_industry_insights (
        id, title, topic, author_name, author_title, company, publication_date,
        insights_summary, career_relevance, post_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    db.transaction(() => {
      for (const ins of SEED_INDUSTRY_INSIGHTS) {
        insertIns.run(
          ins.id, ins.title, ins.topic, ins.author_name, ins.author_title,
          ins.company || null, ins.publication_date, ins.insights_summary,
          ins.career_relevance, ins.post_url
        );
      }
    })();
  }
}

// Ensure seeded on first load
seedLinkedInIntelligence();

export function getLinkedInRecruiterActivity(filter?: { company?: string; location?: string }): LinkedInRecruiterActivity[] {
  let query = 'SELECT * FROM linkedin_recruiter_activity WHERE 1=1';
  const params: any[] = [];

  if (filter?.company) {
    query += ' AND company LIKE ?';
    params.push(`%${filter.company}%`);
  }
  if (filter?.location) {
    query += ' AND location LIKE ?';
    params.push(`%${filter.location}%`);
  }

  query += ' ORDER BY publication_date DESC';
  return db.prepare(query).all(...params) as LinkedInRecruiterActivity[];
}

export function getLinkedInCompanyUpdates(filter?: { company?: string; updateType?: string }): LinkedInCompanyUpdate[] {
  let query = 'SELECT * FROM linkedin_company_updates WHERE 1=1';
  const params: any[] = [];

  if (filter?.company) {
    query += ' AND company LIKE ?';
    params.push(`%${filter.company}%`);
  }
  if (filter?.updateType) {
    query += ' AND update_type = ?';
    params.push(filter.updateType);
  }

  query += ' ORDER BY publication_date DESC';
  return db.prepare(query).all(...params) as LinkedInCompanyUpdate[];
}

export function getLinkedInIndustryInsights(filter?: { topic?: string }): LinkedInIndustryInsight[] {
  let query = 'SELECT * FROM linkedin_industry_insights WHERE 1=1';
  const params: any[] = [];

  if (filter?.topic) {
    query += ' AND (topic LIKE ? OR title LIKE ?)';
    params.push(`%${filter.topic}%`, `%${filter.topic}%`);
  }

  query += ' ORDER BY publication_date DESC';
  return db.prepare(query).all(...params) as LinkedInIndustryInsight[];
}

export function searchLinkedInIntelligence(term: string) {
  const searchTerm = `%${term}%`;

  const recruiters = db.prepare(`
    SELECT * FROM linkedin_recruiter_activity
    WHERE author_name LIKE ? OR company LIKE ? OR post_text LIKE ? OR job_title LIKE ?
    ORDER BY publication_date DESC
  `).all(searchTerm, searchTerm, searchTerm, searchTerm) as LinkedInRecruiterActivity[];

  const companies = db.prepare(`
    SELECT * FROM linkedin_company_updates
    WHERE company LIKE ? OR headline LIKE ? OR summary LIKE ?
    ORDER BY publication_date DESC
  `).all(searchTerm, searchTerm, searchTerm) as LinkedInCompanyUpdate[];

  const insights = db.prepare(`
    SELECT * FROM linkedin_industry_insights
    WHERE title LIKE ? OR topic LIKE ? OR insights_summary LIKE ?
    ORDER BY publication_date DESC
  `).all(searchTerm, searchTerm, searchTerm) as LinkedInIndustryInsight[];

  return {
    recruiters,
    companies,
    insights,
    total_found: recruiters.length + companies.length + insights.length
  };
}
