import { NextResponse } from 'next/server';
import db, { logAudit } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { getFullProfile } from '@/lib/onboarding';
import { getAllVerifiedJobs, syncAndDeduplicateJobs } from '@/lib/jobs/aggregator';
import { rankTopOpportunities } from '@/lib/jobs/matcher';
import { prepareApplicationPackage } from '@/lib/applications/workflow';
import { formatJobSpecificCVTitle } from '@/lib/cv-optimizer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = authUser;
     const body = await req.json();

    const {
      current_physical_location,
      target_countries,
      target_cities,
      relocation_willing,
      relocation_timeline,
      visa_sponsorship_required,
      min_salary,
      work_mode_preference
    } = body;

    const safeCountries = Array.isArray(target_countries) ? target_countries : [];
    const safeCities = Array.isArray(target_cities) ? target_cities : [];

    // 1. Persist Location Preferences (User-Controlled)
    const existingLoc = db.prepare('SELECT id, current_physical_location FROM profile_locations WHERE user_id = ?').get(user.id) as any;
    const locId = existingLoc ? existingLoc.id : `loc_${user.id}`;
    const resolvedPhysical = current_physical_location !== undefined
      ? (current_physical_location ? String(current_physical_location).trim() : null)
      : (existingLoc ? existingLoc.current_physical_location : null);

    db.prepare(`
      INSERT INTO profile_locations (
        id, user_id, current_physical_location, target_countries, target_cities, relocation_willing,
        relocation_timeline, visa_sponsorship_required, work_authorizations,
        remote_eligibility, work_mode_preference
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', 'Any', ?)
      ON CONFLICT(id) DO UPDATE SET
        current_physical_location = excluded.current_physical_location,
        target_countries = excluded.target_countries,
        target_cities = excluded.target_cities,
        relocation_willing = excluded.relocation_willing,
        relocation_timeline = excluded.relocation_timeline,
        visa_sponsorship_required = excluded.visa_sponsorship_required,
        work_mode_preference = excluded.work_mode_preference,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      locId,
      user.id,
      resolvedPhysical,
      JSON.stringify(safeCountries),
      JSON.stringify(safeCities),
      relocation_willing ? 1 : 0,
      relocation_timeline || (relocation_willing ? 'Relocation immediately' : 'No relocation'),
      visa_sponsorship_required ? 1 : 0,
      work_mode_preference || 'Remote'
    );

    // 2. Update Salary Expectation & Mark Onboarding Confirmed
    db.prepare(`
      UPDATE profiles
      SET onboarding_completed = 1,
          min_salary = COALESCE(?, min_salary),
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(min_salary ? Number(min_salary) : null, user.id);

    // 3. Ensure jobs are synced & deduplicated
    syncAndDeduplicateJobs();
    const verifiedJobs = getAllVerifiedJobs();

    // 4. Calculate Top Opportunities for this authenticated candidate
    const candidate = getFullProfile(user.id);
    if (!candidate) {
      return NextResponse.json({ error: 'Candidate profile not found' }, { status: 500 });
    }

    const top10 = rankTopOpportunities(candidate, verifiedJobs);

    // 5. Create job packages with candidate naming
    const candidateName = candidate.profile.full_name || 'Candidate';
    const preparedPackages = [];
    for (const item of top10.slice(0, 3)) {
      try {
        const app = prepareApplicationPackage(item.job.id, user.id);

        const customTitle = `${candidateName.replace(/[^a-zA-Z0-9]/g, '_')}_CV_${item.job.employer.replace(/[^a-zA-Z0-9]/g, '_')}_${item.job.title.replace(/[^a-zA-Z0-9]/g, '_')}`;
        if (app.tailored_cv_id) {
          db.prepare(`UPDATE resumes SET title = ? WHERE id = ?`).run(customTitle, app.tailored_cv_id);
        }

        preparedPackages.push({
          ...app,
          cv_filename: customTitle,
          job: item.job,
          match: item.match
        });
      } catch (err: any) {
        console.warn(`Error preparing package for ${item.job.id}:`, err.message);
      }
    }

    logAudit('ESSENTIAL_PREFERENCES_CONFIRMED', {
      target_countries: safeCountries,
      target_cities: safeCities,
      relocation_willing,
      packages_prepared: preparedPackages.length
    }, user.id);

    return NextResponse.json({
      success: true,
      top_opportunities: top10,
      prepared_packages: preparedPackages
    });
  } catch (err: any) {
    console.error('Essential preferences error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
