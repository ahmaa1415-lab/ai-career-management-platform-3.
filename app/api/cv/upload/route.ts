import { NextResponse } from 'next/server';
import { parseCVFile, extractCVContent } from '@/lib/cv-extractor';
import { generateOptimizedMasterCV, generateCareerStrategy } from '@/lib/cv-optimizer';
import { analyzeResume } from '@/lib/ai/ats-analyzer';
import db, { getOrCreateDefaultUser, logAudit, setActiveResume } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const UNSUPPORTED_EXTENSIONS = new Set([
  '.exe', '.bin', '.msi', '.bat', '.cmd', '.sh', '.zip', '.tar', '.gz', '.dll', '.com', '.iso', '.vbs', '.apk'
]);

export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req, { allowDefaultFallback: true });
    const user = authUser ? authUser : getOrCreateDefaultUser();
    let cvText = '';
    let originalFilename = 'uploaded_cv.txt';
    let fileBuffer: Buffer | null = null;
    let fileType = 'text/plain';
    let fileSize = 0;

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      const textParam = formData.get('text') as string | null;

      if (file) {
        originalFilename = file.name || 'document';
        fileType = file.type || 'application/octet-stream';
        fileSize = file.size;

        // 1. Guard against empty files
        if (fileSize === 0) {
          return NextResponse.json(
            { error: 'Uploaded file is empty (0 bytes). Please upload a valid resume.', processing_status: 'failed' },
            { status: 400 }
          );
        }

        // 2. Guard against unsupported or dangerous file extensions
        const ext = path.extname(originalFilename).toLowerCase();
        if (UNSUPPORTED_EXTENSIONS.has(ext) || fileType.includes('msdownload') || fileType.includes('executable')) {
          return NextResponse.json(
            { error: `Unsupported file format (${originalFilename}). Only PDF, DOCX, and text resumes are accepted.`, processing_status: 'failed' },
            { status: 400 }
          );
        }

        const arrayBuffer = await file.arrayBuffer();
        fileBuffer = Buffer.from(arrayBuffer);

        try {
          cvText = await parseCVFile(fileBuffer, originalFilename, file.type);
        } catch (parseErr: any) {
          return NextResponse.json(
            { error: parseErr.message || 'Failed to extract text from document.', processing_status: 'failed' },
            { status: 400 }
          );
        }
      } else if (textParam && textParam.trim().length > 0) {
        cvText = textParam.trim();
        fileBuffer = Buffer.from(cvText, 'utf-8');
        fileSize = fileBuffer.length;
      }
    } else {
      const body = await req.json();
      cvText = body.text || '';
      originalFilename = body.filename || 'pasted_cv.txt';
      fileBuffer = Buffer.from(cvText, 'utf-8');
      fileSize = fileBuffer.length;
    }

    if (!fileBuffer || fileSize === 0) {
      return NextResponse.json(
        { error: 'Uploaded file is empty (0 bytes). Please upload a valid resume.', processing_status: 'failed' },
        { status: 400 }
      );
    }

    // Cryptographic hash for content-based duplicate identification
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Generate unique immutable resume ID for this upload
    const resumeId = `res_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // Safely store the original uploaded document (configurable via UPLOADS_DIR)
    const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), 'data', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const diskPath = path.join(uploadsDir, `${resumeId}_${originalFilename}`);
    fs.writeFileSync(diskPath, fileBuffer);

    // Validate extracted text
    if (!cvText || cvText.trim().length < 20) {
      // Record failed extraction attempt in resumes table
      try {
        db.prepare(`
          INSERT INTO resumes (
            id, user_id, title, type, target_role, target_country, raw_text,
            ats_score, version, original_filename, stored_file_path, file_type,
            file_size, file_hash, processing_status, extraction_status, extraction_version
          ) VALUES (?, ?, ?, 'Master', 'Unknown', 'Unknown', ?, 0, 1, ?, ?, ?, ?, ?, 'failed', 'failed', 1)
        `).run(resumeId, user.id, originalFilename, cvText || '', originalFilename, diskPath, fileType, fileSize, fileHash);
      } catch {}

      return NextResponse.json({
        error: 'Uploaded resume text is empty or unreadable. Please upload a readable PDF, DOCX, or text file.',
        resume_id: resumeId,
        processing_status: 'failed'
      }, { status: 400 });
    }

    // Check if identical content has already been uploaded by this user
    const existingDuplicate = db.prepare(`
      SELECT r.*, ep.candidate_name, ep.email, ep.phone, ep.location, ep.current_headline, ep.skills_json, ep.experiences_json
      FROM resumes r
      LEFT JOIN extracted_profiles ep ON r.extracted_profile_id = ep.id
      WHERE r.user_id = ? AND r.file_hash = ? AND r.type = 'Master' AND r.processing_status = 'completed'
      ORDER BY r.created_at ASC
      LIMIT 1
    `).get(user.id, fileHash) as any;

    if (existingDuplicate) {
      // Activate this duplicate resume as the platform's single source of truth
      setActiveResume(user.id, existingDuplicate.id);

      // Invalidate unsubmitted applications generated from prior resumes
      db.prepare(`
        UPDATE applications
        SET is_outdated = 1,
            outdated_reason = 'Generated from prior resume version. Please review and regenerate package with latest CV.'
        WHERE user_id = ?
          AND status IN ('Approval Pending', 'Ready to Apply')
          AND (source_resume_id IS NULL OR source_resume_id != ?)
      `).run(user.id, existingDuplicate.id);

      // Fetch linked optimized Version B CV
      const optRow = db.prepare(`
        SELECT * FROM resumes
        WHERE (id = ? OR source_text_reference = ?) AND type = 'ATS'
        LIMIT 1
      `).get(`opt_${existingDuplicate.id}`, existingDuplicate.stored_file_path) as any;

      // Fetch ATS evaluation
      const evalRow = db.prepare(`
        SELECT * FROM cv_evaluations
        WHERE resume_id = ? OR id = ?
        ORDER BY evaluation_date DESC
        LIMIT 1
      `).get(existingDuplicate.id, existingDuplicate.ats_report_id || '') as any;

      logAudit('RESUME_ACTIVATED_EXISTING', {
        resume_id: existingDuplicate.id,
        filename: originalFilename,
        file_hash: fileHash
      }, user.id);

      return NextResponse.json({
        success: true,
        is_duplicate: true,
        is_active: true,
        active_resume_id: existingDuplicate.id,
        version: existingDuplicate.version || 1,
        message: `Identical file content detected (previously uploaded as "${existingDuplicate.original_filename}"). Set as active single source of truth across all 10 modules.`,
        resume_id: existingDuplicate.id,
        original_filename: originalFilename,
        file_hash: fileHash,
        raw_cv_text: existingDuplicate.raw_text,
        extracted_profile: {
          candidate_name: existingDuplicate.candidate_name,
          current_headline: existingDuplicate.current_headline || existingDuplicate.target_role,
          location: existingDuplicate.location || existingDuplicate.target_country,
          skills: JSON.parse(existingDuplicate.skills_json || '[]'),
          experiences: JSON.parse(existingDuplicate.experiences_json || '[]')
        },
        ats_evaluation: evalRow ? {
          ...evalRow,
          overall_score: evalRow.ats_compatibility_score || existingDuplicate.ats_score,
          criterion_scores: JSON.parse(evalRow.criterion_scores_json || '{}'),
          evidence: JSON.parse(evalRow.evidence_json || '{}'),
          recommendations: JSON.parse(evalRow.recommendations_json || '[]')
        } : { overall_score: existingDuplicate.ats_score },
        optimized_master_cv: optRow ? {
          version_b_optimized: { raw_text: optRow.raw_text },
          score_comparison: { improved_score: optRow.ats_score }
        } : null,
        stages_completed: [
          'uploaded',
          'validated',
          'extracted',
          'parsed',
          'analyzed',
          'saved_profile',
          'activated',
          'synchronized'
        ]
      }, {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }
      });
    }

    // Determine auto-incremented version number for this master resume
    const lastVersionRow = db.prepare(`
      SELECT MAX(version) as max_v
      FROM resumes
      WHERE user_id = ? AND type = 'Master'
    `).get(user.id) as any;
    const nextVersion = (lastVersionRow?.max_v || 0) + 1;

    // 1. Persist Initial Original Resume Record in resumes table (satisfies foreign key constraints)
    const extractedProfileId = `ext_${resumeId}`;
    db.prepare(`
      INSERT INTO resumes (
        id, user_id, title, type, target_role, target_country, raw_text,
        ats_score, version, original_filename, stored_file_path, file_type,
        file_size, file_hash, upload_timestamp, processing_status,
        extraction_status, extraction_version, source_text_reference,
        extracted_profile_id
      ) VALUES (?, ?, ?, 'Master', 'Processing...', 'Processing...', ?, 0, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'processing', 'processing', 1, ?, ?)
    `).run(
      resumeId,
      user.id,
      `Original — ${originalFilename}`,
      cvText,
      nextVersion,
      originalFilename,
      diskPath,
      fileType,
      fileSize,
      fileHash,
      diskPath,
      extractedProfileId
    );

    // 2. Extract Structured CV Content dynamically from this exact file
    const extracted = extractCVContent(cvText);

    // 3. Persist Extracted Profile in extracted_profiles table
    db.prepare(`
      INSERT INTO extracted_profiles (
        id, resume_id, user_id, candidate_name, email, phone, location,
        linkedin_url, github_url, current_headline, career_progression,
        detected_seniority, total_experience_years, experiences_json,
        education_json, certifications_json, skills_json, languages_json,
        industries_json, missing_information_json, raw_extracted_text
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      extractedProfileId,
      resumeId,
      user.id,
      extracted.candidate_name,
      extracted.email,
      extracted.phone,
      extracted.location,
      extracted.linkedin_url || null,
      extracted.github_url || null,
      extracted.current_headline,
      extracted.career_progression,
      extracted.detected_seniority,
      extracted.total_experience_years,
      JSON.stringify(extracted.experiences),
      JSON.stringify(extracted.education),
      JSON.stringify(extracted.certifications),
      JSON.stringify(extracted.skills),
      JSON.stringify(extracted.languages),
      JSON.stringify(extracted.industries),
      JSON.stringify(extracted.missing_information),
      cvText
    );

    // 4. Perform Dynamic ATS & Recruiter Assessment tied strictly to this resume
    const atsEvaluation = analyzeResume(
      cvText,
      extracted.current_headline || 'Professional',
      extracted.location || 'International',
      undefined,
      undefined,
      resumeId,
      1,
      extracted.candidate_name,
      user.id
    );

    // 5. Update Original Resume Record with completed extraction and evaluation
    db.prepare(`
      UPDATE resumes SET
        target_role = ?,
        target_country = ?,
        ats_score = ?,
        processing_status = 'completed',
        extraction_status = 'completed',
        extraction_timestamp = CURRENT_TIMESTAMP,
        ats_report_id = ?
      WHERE id = ?
    `).run(
      extracted.current_headline,
      extracted.location,
      atsEvaluation.overall_score,
      atsEvaluation.evaluation_id,
      resumeId
    );

    // 6. Generate Version B (Optimized Master CV derived dynamically from this resume)
    const optimized = generateOptimizedMasterCV(extracted, resumeId);

    // 7. Generate Preliminary Career Strategy tailored to this profile
    const careerStrategy = generateCareerStrategy(extracted);

    // 8. Persist Derived Optimized Version (Version B) linked to this upload
    const optimizedResumeId = `opt_${resumeId}`;
    db.prepare(`
      INSERT INTO resumes (
        id, user_id, title, type, target_role, target_country, raw_text,
        ats_score, version, original_filename, stored_file_path, file_type,
        file_size, file_hash, upload_timestamp, processing_status,
        extraction_status, extraction_timestamp, extraction_version,
        source_text_reference, extracted_profile_id, ats_report_id
      ) VALUES (?, ?, ?, 'ATS', ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'completed', 'completed', CURRENT_TIMESTAMP, 1, ?, ?, ?)
    `).run(
      optimizedResumeId,
      user.id,
      `Optimized — ${originalFilename}`,
      extracted.current_headline,
      extracted.location,
      optimized.version_b_optimized.raw_text,
      optimized.score_comparison.improved_score,
      `optimized_${originalFilename}`,
      diskPath,
      'text/plain',
      optimized.version_b_optimized.raw_text.length,
      `opt_${fileHash}`,
      diskPath,
      extractedProfileId,
      atsEvaluation.evaluation_id
    );

    // 8. Set Active Resume & Synchronize Profile across all modules
    setActiveResume(user.id, resumeId);

    if (extracted.candidate_name && extracted.candidate_name !== 'Candidate') {
      db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(extracted.candidate_name, user.id);
    }
    if (extracted.email) {
      try {
        db.prepare('UPDATE users SET email = ? WHERE id = ?').run(extracted.email, user.id);
      } catch {}
    }

    // Synchronize profiles table with newly confirmed career facts
    const expSummary = extracted.experiences.length > 0 && extracted.experiences[0].responsibilities.length > 0
      ? extracted.experiences[0].responsibilities.slice(0, 3).join('. ')
      : extracted.career_progression || '';

    db.prepare(`
      UPDATE profiles SET
        onboarding_completed = 1,
        headline = ?,
        summary = ?,
        experience_years = ?,
        skills = ?,
        target_roles = ?,
        target_industries = ?,
        target_seniority = ?,
        active_resume_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(
      extracted.current_headline || 'Professional',
      expSummary,
      extracted.total_experience_years || 5,
      JSON.stringify(extracted.skills),
      JSON.stringify(careerStrategy.best_fit_titles),
      JSON.stringify(careerStrategy.suitable_industries || (careerStrategy as any).best_fit_industries || []),
      extracted.detected_seniority || 'Senior',
      resumeId,
      user.id
    );

    // Invalidate unsubmitted applications generated from older resume versions
    db.prepare(`
      UPDATE applications
      SET is_outdated = 1,
          outdated_reason = 'Generated from prior resume version. Please review and regenerate package with latest CV.'
      WHERE user_id = ?
        AND status IN ('Approval Pending', 'Ready to Apply')
        AND (source_resume_id IS NULL OR source_resume_id != ?)
    `).run(user.id, resumeId);

    // 9. Construct Comparison Against Existing Master Profile
    const currentProfileRow = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(user.id) as any;
    const profileComparison = {
      has_existing_master: !!currentProfileRow,
      changes_detected: {
        headline_diff: currentProfileRow?.headline !== extracted.current_headline,
        years_diff: currentProfileRow?.experience_years !== extracted.total_experience_years,
        new_skills: extracted.skills.filter((s: string) => !(currentProfileRow?.skills || '').includes(s)),
        new_candidate_name: extracted.candidate_name !== 'Candidate' ? extracted.candidate_name : null
      }
    };

    logAudit('RESUME_UPLOADED_AND_ISOLATED', {
      resume_id: resumeId,
      filename: originalFilename,
      file_hash: fileHash,
      candidate_name: extracted.candidate_name,
      skills_count: extracted.skills.length,
      ats_score: atsEvaluation.overall_score
    }, user.id);

    return NextResponse.json({
      success: true,
      resume_id: resumeId,
      active_resume_id: resumeId,
      resume: {
        id: resumeId,
        user_id: user.id,
        title: originalFilename,
        version: nextVersion,
        target_role: careerStrategy.primary_role_recommendation || extracted.current_headline || 'Professional',
        created_at: new Date().toISOString()
      },
      is_active: true,
      version: nextVersion,
      original_filename: originalFilename,
      file_hash: fileHash,
      raw_cv_text: cvText,
      extracted_profile: extracted,
      ats_evaluation: atsEvaluation,
      optimized_master_cv: optimized,
      career_strategy: careerStrategy,
      profile_comparison: profileComparison,
      stages_completed: [
        'uploaded',
        'validated',
        'extracted',
        'parsed',
        'analyzed',
        'saved_profile',
        'activated',
        'synchronized'
      ]
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }
    });
  } catch (err: any) {
    console.error('CV Upload processing error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
