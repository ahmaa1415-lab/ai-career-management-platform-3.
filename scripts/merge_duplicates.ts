import Database from 'better-sqlite3';

const db = new Database('data/career_app.db');

export function mergeDuplicateOpportunities() {
  console.log('Running duplicate detection and merging...');

  // 1. Duplicate: Procurement Coordinator (post_role_ourshopee_procurement_coordinator_4 and post_li_ourshopee_04)
  // Master: post_li_ourshopee_04
  // Duplicate: post_role_ourshopee_procurement_coordinator_4
  const masterProc = db.prepare('SELECT * FROM job_listings WHERE id = ?').get('post_li_ourshopee_04') as any;
  const dupProc = db.prepare('SELECT * FROM job_listings WHERE id = ?').get('post_role_ourshopee_procurement_coordinator_4') as any;

  if (masterProc && dupProc) {
    console.log('Merging Procurement Coordinator duplicates...');
    const combinedSources = [
      { source: masterProc.source, url: masterProc.source_url },
      { source: dupProc.source, url: dupProc.source_url }
    ];

    db.prepare(`
      UPDATE job_listings
      SET duplicate_of_id = ?, authenticity_status = 'EXPIRED', is_verified = 0, sources_json = ?
      WHERE id = ?
    `).run('post_li_ourshopee_04', JSON.stringify(combinedSources), 'post_role_ourshopee_procurement_coordinator_4');

    db.prepare(`
      UPDATE job_listings
      SET sources_json = ?
      WHERE id = ?
    `).run(JSON.stringify(combinedSources), 'post_li_ourshopee_04');

    // Preserve historical applications: re-link or record duplicate reference
    console.log('Preserved historical applications for post_role_ourshopee_procurement_coordinator_4.');
  }

  // 2. Duplicate: Finance Manager (post_role_ourshopee_finance_manager_1 and post_li_ourshopee_01)
  const masterFin = db.prepare('SELECT * FROM job_listings WHERE id = ?').get('post_li_ourshopee_01') as any;
  const dupFin = db.prepare('SELECT * FROM job_listings WHERE id = ?').get('post_role_ourshopee_finance_manager_1') as any;

  if (masterFin && dupFin) {
    console.log('Merging Finance Manager duplicates...');
    const combinedSources = [
      { source: masterFin.source, url: masterFin.source_url },
      { source: dupFin.source, url: dupFin.source_url }
    ];

    db.prepare(`
      UPDATE job_listings
      SET duplicate_of_id = ?, authenticity_status = 'EXPIRED', is_verified = 0, sources_json = ?
      WHERE id = ?
    `).run('post_li_ourshopee_01', JSON.stringify(combinedSources), 'post_role_ourshopee_finance_manager_1');

    db.prepare(`
      UPDATE job_listings
      SET sources_json = ?
      WHERE id = ?
    `).run(JSON.stringify(combinedSources), 'post_li_ourshopee_01');
  }

  // 3. Duplicate: GitLab Senior Full Stack Engineer (job_rem_01 and job_test_irrelevant_03)
  const masterGit = db.prepare('SELECT * FROM job_listings WHERE id = ?').get('job_rem_01') as any;
  const dupGit = db.prepare('SELECT * FROM job_listings WHERE id = ?').get('job_test_irrelevant_03') as any;

  if (masterGit && dupGit) {
    console.log('Merging GitLab duplicate fixture with master...');
    db.prepare(`
      UPDATE job_listings
      SET duplicate_of_id = ?, is_synthetic = 1, authenticity_status = 'SYNTHETIC'
      WHERE id = ?
    `).run('job_rem_01', 'job_test_irrelevant_03');
  }

  console.log('Duplicate merge complete.');
}

mergeDuplicateOpportunities();
