import Database from 'better-sqlite3';

const db = new Database('data/career_app.db');

const existingCols = db.prepare('PRAGMA table_info(job_listings)').all().map((c: any) => c.name);

const newCols = [
  { name: 'authenticity_status', type: "TEXT DEFAULT 'UNVERIFIED'" },
  { name: 'final_destination_url', type: 'TEXT' },
  { name: 'requisition_id', type: 'TEXT' },
  { name: 'verification_method', type: 'TEXT' },
  { name: 'is_synthetic', type: 'INTEGER DEFAULT 0' },
  { name: 'ingestion_provider_type', type: "TEXT DEFAULT 'curated_benchmark'" }
];

for (const col of newCols) {
  if (!existingCols.includes(col.name)) {
    console.log('Adding column:', col.name);
    db.prepare(`ALTER TABLE job_listings ADD COLUMN ${col.name} ${col.type}`).run();
  } else {
    console.log('Column already exists:', col.name);
  }
}

console.log('Schema migration completed successfully.');
