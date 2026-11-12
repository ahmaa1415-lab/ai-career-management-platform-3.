import fs from 'fs';
import { parseCVFile, extractCVContent } from '../lib/cv-extractor';

async function extractAyaRealCV() {
  const filePath = 'data/uploads/1793923495787_Aya Hamouda Mahmoud Ali.pdf';
  console.log(`Reading ${filePath}...`);
  const buf = fs.readFileSync(filePath);
  const rawText = await parseCVFile(buf, 'Aya Hamouda Mahmoud Ali.pdf', 'application/pdf');

  console.log(`Extracted text length: ${rawText.length} characters.`);
  console.log('--- RAW TEXT PREVIEW ---');
  console.log(rawText.substring(0, 1500));
  console.log('--- END PREVIEW ---\n');

  const profile = extractCVContent(rawText);
  console.log('Structured Extraction:');
  console.log({
    candidate_name: profile.candidate_name,
    headline: profile.current_headline,
    total_experience_years: profile.total_experience_years,
    detected_seniority: profile.detected_seniority,
    skills_count: profile.skills.length,
    skills_sample: profile.skills.slice(0, 10),
    experiences_count: profile.experiences.length,
    experiences: profile.experiences.map(e => ({
      employer: e.employer,
      job_title: e.job_title,
      start_date: e.start_date,
      end_date: e.end_date
    })),
    education: profile.education,
    languages: profile.languages,
    industries: profile.industries
  });
}

extractAyaRealCV().catch(console.error);
