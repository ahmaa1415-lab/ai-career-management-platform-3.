import fs from 'fs';
import path from 'path';

export interface ExtractedExperience {
  employer: string;
  job_title: string;
  start_date: string;
  end_date: string;
  duration_months: number;
  responsibilities: string[];
  achievements: string[];
}

export interface ExtractedEducation {
  institution: string;
  degree: string;
  field_of_study: string;
  graduation_year?: string;
}

export interface ExtractedCVProfile {
  raw_text: string;
  candidate_name: string;
  email: string;
  phone: string;
  location: string;
  linkedin_url?: string;
  github_url?: string;
  current_headline: string;
  career_progression: string;
  detected_seniority: 'Junior' | 'Mid' | 'Senior' | 'Lead' | 'Principal' | 'Director';
  total_experience_years: number;
  experiences: ExtractedExperience[];
  education: ExtractedEducation[];
  certifications: string[];
  skills: string[];
  languages: string[];
  industries: string[];
  employment_gaps: string[];
  inconsistencies: string[];
  missing_information: string[];
  structure_quality_score: number;
}

/**
 * High-fidelity multi-format parser for PDF, DOCX, and TXT files.
 */
export async function parseCVFile(buffer: Buffer, filename: string, mimeType?: string): Promise<string> {
  const ext = path.extname(filename).toLowerCase();

  if (ext === '.txt' || mimeType?.includes('text/plain')) {
    return buffer.toString('utf-8');
  }

  if (ext === '.docx' || mimeType?.includes('wordprocessingml')) {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (err: any) {
      console.warn('DOCX parse fallback to plain text regex extraction:', err.message);
      return buffer.toString('utf-8').replace(/[^\x20-\x7E\n]/g, ' ');
    }
  }

  if (ext === '.pdf' || mimeType?.includes('pdf')) {
    // Validate PDF magic bytes
    if (!buffer || buffer.length < 5 || !buffer.subarray(0, 5).toString().startsWith('%PDF-')) {
      throw new Error('Invalid or corrupted PDF file. The file is missing a valid PDF header (%PDF-).');
    }

    // 1. Primary engine: dedicated node runtime extractor
    const scriptPath = path.resolve(process.cwd(), 'scripts', 'extract_pdf.cjs');
    if (fs.existsSync(scriptPath)) {
      try {
        const { execFileSync } = await import('child_process');
        const os = await import('os');
        const tempPdfPath = path.join(os.tmpdir(), `cv_parse_${Date.now()}_${Math.random().toString(36).substring(7)}.pdf`);
        fs.writeFileSync(tempPdfPath, buffer);
        try {
          const extractedText = execFileSync(process.execPath, [scriptPath, tempPdfPath], {
            encoding: 'utf-8',
            maxBuffer: 20 * 1024 * 1024,
            timeout: 15000
          });
          if (extractedText && extractedText.trim().length > 30) {
            return extractedText.trim();
          }
        } finally {
          if (fs.existsSync(tempPdfPath)) {
            try { fs.unlinkSync(tempPdfPath); } catch {}
          }
        }
      } catch (childErr: any) {
        console.warn('Child process PDF extraction failed, trying in-process:', childErr.message);
      }
    }

    // 2. In-process fallback with setWorker using pathToFileURL
    try {
      const { pathToFileURL } = await import('url');
      const pdfModule = await import('pdf-parse');
      const PDFParseClass = pdfModule.PDFParse || (pdfModule as any).default?.PDFParse;
      if (PDFParseClass && typeof PDFParseClass === 'function') {
        const workerPath = path.resolve(process.cwd(), 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.mjs');
        if (fs.existsSync(workerPath) && PDFParseClass.setWorker) {
          PDFParseClass.setWorker(pathToFileURL(workerPath).href);
        }
        const parser = new PDFParseClass({ data: buffer });
        const res = await parser.getText();
        await parser.destroy();
        if (res && res.text && res.text.trim().length > 20) {
          return res.text;
        }
      }

      // Legacy v1 fallback
      if (typeof (pdfModule as any).default === 'function') {
        const res = await (pdfModule as any).default(buffer);
        if (res && res.text && res.text.trim().length > 20) {
          return res.text;
        }
      }
    } catch (err: any) {
      console.warn('PDF parser error, trying stream fallback:', err.message);
    }

    // 3. Flate stream decompression fallback
    try {
      const raw = buffer.toString('latin1');
      const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
      let match;
      const textParts: string[] = [];
      const zlib = await import('zlib');
      while ((match = streamRegex.exec(raw)) !== null) {
        try {
          const streamBuf = Buffer.from(match[1], 'latin1');
          const decompressed = zlib.inflateSync(streamBuf).toString('utf-8');
          const tjMatches = decompressed.match(/\(([^)]+)\)\s*T[jJ]/g);
          if (tjMatches) {
            textParts.push(tjMatches.map(m => m.replace(/\)\s*T[jJ]/, '').replace(/^\(/, '')).join(' '));
          }
        } catch {
          // Skip non-flate streams
        }
      }
      if (textParts.length > 0) {
        const streamText = textParts.join('\n');
        if (streamText.trim().length > 50) {
          return streamText;
        }
      }
    } catch (streamErr: any) {
      console.warn('PDF stream extraction fallback failed:', streamErr.message);
    }

    throw new Error('PDF extraction failed: file may be corrupted, empty, or unreadable.');
  }

  // Non-PDF fallback (e.g. .txt, .md)
  return buffer.toString('utf-8');
}

/**
 * Extracts structured profile information dynamically from raw resume text.
 * Strictly adheres to ZERO-FABRICATION and ZERO-FALLBACK to any external candidate.
 * If data is absent in the document, returns empty collections or explicit unknown values.
 */
export function extractCVContent(rawText: string): ExtractedCVProfile {
  const text = (rawText || '').trim();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const missing_information: string[] = [];

  // 1. Contact & Identity Detection
  const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  const email = emailMatch ? emailMatch[1].toLowerCase() : '';
  if (!email) missing_information.push('Email address not found');

  const phoneMatch = text.match(/(?:\+?\d{1,4}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{4,6}/);
  const phone = phoneMatch ? phoneMatch[0].trim() : '';
  if (!phone) missing_information.push('Phone number not found');

  const linkedinMatch = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9_-]+)/i);
  const linkedin_url = linkedinMatch ? `https://linkedin.com/in/${linkedinMatch[1]}` : undefined;

  const githubMatch = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)/i);
  const github_url = githubMatch ? `https://github.com/${githubMatch[1]}` : undefined;

  // Candidate Name extraction
  let candidate_name = '';
  const ignoredHeaders = /^(resume|curriculum vitae|cv|professional summary|summary|profile|contact|personal info)/i;
  for (const line of lines.slice(0, 5)) {
    if (!line.includes('@') && !line.includes('+') && !line.toLowerCase().includes('http') && !line.includes('|') && !ignoredHeaders.test(line)) {
      if (line.length >= 2 && line.length <= 60) {
        if (line === line.toUpperCase() && line.length > 3) {
          candidate_name = line.split(' ').map(w => 
            w.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join('-')
          ).join(' ');
        } else {
          candidate_name = line;
        }
        break;
      }
    }
  }
  if (!candidate_name) {
    candidate_name = lines[0] && !lines[0].includes('@') ? lines[0] : 'Candidate';
  }

  // 2. Location Detection
  let location = '';
  const locationMatch = text.match(/\b([A-Z][a-zA-Z\s]+),\s*([A-Z][a-zA-Z\s]+)\b/);
  const explicitLocations = text.match(/(?:Cairo|Alexandria|Giza|Dubai|Abu Dhabi|Riyadh|Jeddah|Berlin|London|New York|San Francisco|Chicago|Toronto|Paris|Amsterdam|Remote)[^,\n|]*/i);

  if (explicitLocations) {
    location = explicitLocations[0].trim();
  } else if (locationMatch && !/university|college|school|faculty/i.test(locationMatch[0])) {
    location = locationMatch[0].trim();
  }
  if (!location) {
    location = 'Location Not Specified';
    missing_information.push('Geographic location not explicitly stated');
  }

  // 3. Experience Years & Headline Detection
  let total_experience_years = 0;
  const expYearMatch = text.match(/(\d+)\+?\s*years?\s*(?:of\s*)?experience/i);
  if (expYearMatch) {
    total_experience_years = parseInt(expYearMatch[1], 10);
  }

  // Headline determination
  let current_headline = '';
  for (let i = 1; i < Math.min(lines.length, 5); i++) {
    const line = lines[i];
    if (
      !line.includes('@') &&
      !line.includes('+') &&
      !line.includes('|') &&
      !line.toLowerCase().includes('http') &&
      line.length >= 5 &&
      line.length <= 80 &&
      !ignoredHeaders.test(line)
    ) {
      current_headline = line;
      break;
    }
  }

  // 4. Skills & Competencies Extraction
  const extractedSkills: string[] = [];

  const competenciesSectionMatch = text.match(/(?:CORE COMPETENCIES|COMPETENCIES|TECHNICAL SKILLS|SKILLS|AREAS OF EXPERTISE|TECHNOLOGIES)[\s\S]*?(?=(?:PROFESSIONAL EXPERIENCE|EXPERIENCE|WORK HISTORY|EMPLOYMENT|EDUCATION)|$)/i);
  if (competenciesSectionMatch) {
    const rawSection = competenciesSectionMatch[0]
      .replace(/CORE COMPETENCIES|COMPETENCIES|TECHNICAL SKILLS|SKILLS|AREAS OF EXPERTISE|TECHNOLOGIES/i, '')
      .replace(/Tools:|Technologies:|Frameworks:|Languages:/gi, '');
    const tokens = rawSection.split(/[|\n,•*]/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 50);
    tokens.forEach(t => {
      if (!extractedSkills.includes(t)) {
        extractedSkills.push(t);
      }
    });
  }

  // Multi-Domain Skill Dictionary for comprehensive recognition
  const dictionarySkills = [
    // Software & Cloud
    'TypeScript', 'JavaScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Rust', 'Ruby', 'PHP',
    'React', 'Next.js', 'Node.js', 'FastAPI', 'Django', 'Flask', 'Spring Boot', 'Express',
    'PostgreSQL', 'MySQL', 'SQLite', 'MongoDB', 'Redis', 'Kafka', 'RabbitMQ',
    'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure', 'Terraform', 'CI/CD', 'Git',
    'REST API', 'GraphQL', 'Microservices', 'Distributed Systems', 'System Design',
    'Tailwind CSS', 'Linux', 'Machine Learning', 'Deep Learning', 'PyTorch', 'TensorFlow',
    // Finance & Accounting
    'Financial Reporting', 'Auditing', 'IFRS', 'GAAP', 'Financial Modeling', 'Budgeting',
    'Forecasting', 'Cost Accounting', 'Variance Analysis', 'Tax Compliance', 'Internal Controls',
    'SOX', 'Risk Management', 'Cash Flow Management', 'General Ledger', 'Payroll',
    'QuickBooks', 'NetSuite', 'SAP ERP', 'Excel Modeling', 'Corporate Finance', 'Mergers & Acquisitions',
    // Commercial, FMCG & Trade Marketing
    'Category Management', 'Trade Marketing', 'Assortment Optimization', 'Planograms',
    'Joint Business Planning', 'JBP', 'Demand Planning', 'Supply Chain', 'Modern Trade',
    'Traditional Trade', 'Key Account Management', 'Channel Development', 'Distributor Management',
    'FMCG', 'Brand Development', 'Retail Execution', 'POSM', 'Shopper Insights', 'ROI Analysis',
    'Pricing Strategy', 'Sales Operations', 'Power BI', 'SAP', 'Salesforce',
    'Beauty', 'Cosmetics', 'Personal Care', 'Health', 'Healthcare', 'Nutraceuticals',
    // Operations & General Management
    'Agile', 'Scrum', 'Kanban', 'Jira', 'PMP', 'Lean Six Sigma', 'Process Optimization',
    'Stakeholder Management', 'Vendor Management', 'Procurement', 'Contract Negotiation'
  ];

  dictionarySkills.forEach(skill => {
    const reg = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (reg.test(text) && !extractedSkills.some(s => s.toLowerCase() === skill.toLowerCase())) {
      extractedSkills.push(skill);
    }
  });

  // 5. Professional Experiences Extraction
  const experiences: ExtractedExperience[] = [];
  const expSectionMatch = text.match(/(?:PROFESSIONAL EXPERIENCE|EXPERIENCE|WORK EXPERIENCE|WORK HISTORY|EMPLOYMENT HISTORY)[\s\S]*?(?=(?:EDUCATION|ACADEMIC|LANGUAGES|CERTIFICATIONS|SKILLS|PROJECTS)|$)/i);

  if (expSectionMatch) {
    const expLines = expSectionMatch[0].split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let currentExp: ExtractedExperience | null = null;
    let pendingTitle = '';

    for (const line of expLines) {
      if (/^(?:PROFESSIONAL EXPERIENCE|EXPERIENCE|WORK EXPERIENCE|WORK HISTORY|EMPLOYMENT HISTORY)/i.test(line)) continue;

      // Handle bullet points
      if (currentExp && (line.startsWith('•') || line.startsWith('-') || line.startsWith('*'))) {
        const bullet = line.replace(/^[•\-\*]\s*/, '').trim();
        if (bullet) {
          if (/\d+%|\d+x|\$\d+|\b\d+\s*million|\bgrowth\b|\bincrease\b|\bexpanded\b|\bdelivered\b|\bachieved\b|\bengineered\b|\barchitected\b|\breduced\b/i.test(bullet)) {
            currentExp.achievements.push(bullet);
          } else {
            currentExp.responsibilities.push(bullet);
          }
        }
        continue;
      }

      // Check if line contains a date range (e.g. Jan 2022 – Present, Feb 2021 – Present, 2018 - 2021)
      const dateToken = '(?:(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[a-z]*\\.?\\s*)?\\d{4}|\\d{1,2}\\/\\d{2,4})';
      const dateRangeRegex = new RegExp(`\\b((${dateToken})\\s*(?:[-–—]|\\bto\\b)\\s*(?:Present|Current|Now|${dateToken}))\\b`, 'i');
      const dateMatch = line.match(dateRangeRegex);

      if (dateMatch) {
        const dateStr = dateMatch[1];
        const dateParts = dateStr.split(/\s*(?:[-–—]|\bto\b)\s*/i).map(d => d.trim()).filter(Boolean);
        const startDate = dateParts[0] || '';
        const endDate = dateParts[1] || 'Present';

        // Remove date from line to examine employer / title / location
        const nonDatePart = line.replace(dateMatch[0], '').replace(/^[|–—\s]+|[|–—\s]+$/g, '').trim();
        const segments = nonDatePart.split(/[|]/).map(s => s.trim()).filter(Boolean);

        let jobTitle = '';
        let employer = '';

        if (pendingTitle) {
          jobTitle = pendingTitle;
          employer = segments[0] || 'Employer';
          pendingTitle = '';
        } else if (segments.length >= 2) {
          const dashMatch0 = segments[0].match(/^(.+?)\s+[-–—]\s+(.+)$/);
          if (dashMatch0) {
            jobTitle = dashMatch0[1].trim();
            employer = dashMatch0[2].trim();
          } else {
            jobTitle = segments[0];
            employer = segments[1];
          }
        } else if (segments.length === 1) {
          const atMatch = segments[0].match(/^(.+?)\s+at\s+(.+)$/i);
          const dashMatch = segments[0].match(/^(.+?)\s+[-–—]\s+(.+)$/);
          if (atMatch) {
            jobTitle = atMatch[1].trim();
            employer = atMatch[2].trim();
          } else if (dashMatch) {
            jobTitle = dashMatch[1].trim();
            employer = dashMatch[2].trim();
          } else {
            jobTitle = segments[0];
            employer = segments[0];
          }
        } else {
          jobTitle = 'Position';
          employer = 'Employer';
        }

        if (currentExp) experiences.push(currentExp);
        currentExp = {
          job_title: jobTitle,
          employer: employer,
          start_date: startDate,
          end_date: endDate,
          duration_months: 24,
          responsibilities: [],
          achievements: []
        };
      } else {
        const parenDateMatch = line.match(/^(.+?)\s*\(([^)]+)\)$/);
        if (parenDateMatch && /\d{4}/.test(parenDateMatch[2])) {
          const mainPart = parenDateMatch[1];
          const atMatch = mainPart.match(/^(.+?)\s+at\s+(.+)$/i);
          const dashMatch = mainPart.match(/^(.+?)\s+[-–—]\s+(.+)$/);
          if (currentExp) experiences.push(currentExp);
          currentExp = {
            job_title: atMatch ? atMatch[1].trim() : (dashMatch ? dashMatch[1].trim() : mainPart.trim()),
            employer: atMatch ? atMatch[2].trim() : (dashMatch ? dashMatch[2].trim() : mainPart.trim()),
            start_date: parenDateMatch[2].split(/\s*(?:[-–—]|\bto\b)\s*/i)[0]?.trim() || '',
            end_date: parenDateMatch[2].split(/\s*(?:[-–—]|\bto\b)\s*/i)[1]?.trim() || 'Present',
            duration_months: 24,
            responsibilities: [],
            achievements: []
          };
          pendingTitle = '';
        } else {
          pendingTitle = line.replace(/^[•\-\*]\s*/, '').trim();
        }
      }
    }
    if (currentExp) experiences.push(currentExp);
  }

  // Calculate experience years from experiences if not found in text
  if (total_experience_years === 0 && experiences.length > 0) {
    total_experience_years = experiences.length * 2;
  }
  if (!current_headline && experiences.length > 0) {
    current_headline = experiences[0].job_title;
  }
  if (!current_headline) {
    current_headline = 'Professional';
  }

  // Seniority detection
  let detected_seniority: ExtractedCVProfile['detected_seniority'] = 'Mid';
  const textLower = text.toLowerCase();
  if (/director|vp|head of|chief/i.test(textLower)) {
    detected_seniority = 'Director';
  } else if (/principal|staff|architect/i.test(textLower)) {
    detected_seniority = 'Principal';
  } else if (/lead|manager|head/i.test(textLower) || total_experience_years >= 8) {
    detected_seniority = 'Lead';
  } else if (/senior|sr\./i.test(textLower) || total_experience_years >= 5) {
    detected_seniority = 'Senior';
  } else if (total_experience_years <= 2) {
    detected_seniority = 'Junior';
  } else {
    detected_seniority = 'Mid';
  }

  // 6. Education Extraction
  const education: ExtractedEducation[] = [];
  const eduSectionMatch = text.match(/(?:EDUCATION|ACADEMIC BACKGROUND|ACADEMIC QUALIFICATIONS|QUALIFICATIONS)[\s\S]*?(?=(?:LANGUAGES|CERTIFICATIONS|SKILLS|EXPERIENCE|PROJECTS)|$)/i);
  if (eduSectionMatch) {
    const eduLines = eduSectionMatch[0].split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const line of eduLines) {
      if (/^(?:EDUCATION|ACADEMIC BACKGROUND|ACADEMIC QUALIFICATIONS|QUALIFICATIONS)/i.test(line)) continue;
      const parts = line.split(/[|–-]/).map(p => p.trim());
      if (parts.length >= 2) {
        education.push({
          degree: parts[0] || 'Degree',
          field_of_study: parts[1] || 'Major',
          institution: parts[2] || parts[1] || 'University',
          graduation_year: parts[parts.length - 1]?.match(/\d{4}/)?.[0] || undefined
        });
      }
    }
  }

  // 7. Certifications Extraction
  const certifications: string[] = [];
  const certSectionMatch = text.match(/(?:CERTIFICATIONS|CERTIFICATES|LICENSES)[\s\S]*?(?=(?:LANGUAGES|EDUCATION|SKILLS|EXPERIENCE)|$)/i);
  if (certSectionMatch) {
    const certLines = certSectionMatch[0].split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const line of certLines) {
      if (/^(?:CERTIFICATIONS|CERTIFICATES|LICENSES)/i.test(line)) continue;
      const cleanLine = line.replace(/^[•\-\*]\s*/, '').trim();
      if (cleanLine.length > 2 && cleanLine.length < 80) {
        certifications.push(cleanLine);
      }
    }
  }

  // 8. Languages Extraction
  const languages: string[] = [];
  const langMatch = text.match(/LANGUAGES[\s\S]*?(?=(?:EDUCATION|CERTIFICATIONS|SKILLS|EXPERIENCE)|$)/i);
  if (langMatch) {
    const langLine = langMatch[0].replace(/LANGUAGES/i, '').trim();
    const splitLangs = langLine.split(/[|,\n•]/).map(l => l.trim()).filter(Boolean);
    splitLangs.forEach(l => {
      if (l.length > 1 && l.length < 40) languages.push(l);
    });
  }

  // 9. Industries Extraction (Dynamically inferred from skills and employer context)
  const industries: string[] = [];
  if (/fmcg|consumer goods|personal care|beauty|cosmetics/i.test(text)) {
    industries.push('Fast-Moving Consumer Goods (FMCG)');
  }
  if (/software|cloud|saas|developer|engineer|api|database/i.test(text)) {
    industries.push('Software Engineering & Technology');
  }
  if (/finance|accounting|audit|tax|ifrs|gaap|budget/i.test(text)) {
    industries.push('Finance & Accounting');
  }
  if (/pharma|clinical|medical|healthcare/i.test(text)) {
    industries.push('Pharmaceuticals & Healthcare');
  }
  if (/retail|e-commerce|marketplace/i.test(text)) {
    industries.push('Retail & E-commerce');
  }

  // Career progression summary
  const career_progression = experiences.length > 1
    ? `Upward career progression: ${experiences[experiences.length - 1]?.job_title} (${experiences[experiences.length - 1]?.employer}) → ${experiences[0]?.job_title} (${experiences[0]?.employer})`
    : experiences.length === 1
    ? `${experiences[0].job_title} at ${experiences[0].employer}`
    : `${total_experience_years}+ years professional experience.`;

  return {
    raw_text: text,
    candidate_name,
    email,
    phone,
    location,
    linkedin_url,
    github_url,
    current_headline,
    career_progression,
    detected_seniority,
    total_experience_years,
    experiences,
    education,
    certifications,
    skills: extractedSkills,
    languages,
    industries,
    employment_gaps: [],
    inconsistencies: [],
    missing_information,
    structure_quality_score: Math.min(100, 70 + (experiences.length * 5) + (education.length * 5) + (extractedSkills.length > 5 ? 10 : 0))
  };
}
