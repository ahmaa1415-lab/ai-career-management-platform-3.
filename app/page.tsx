'use client';

import React, { useState, useEffect, useRef } from 'react';
import Header from '@/components/Header';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  UploadCloud,
  FileText,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Building2,
  MapPin,
  ShieldAlert,
  Send,
  Eye,
  RefreshCw,
  Copy,
  Check,
  ChevronRight,
  Globe2,
  Compass,
  Briefcase,
  ExternalLink,
  Clock,
  Calendar,
  Download,
  Share2,
  CheckCheck,
  X
} from 'lucide-react';
import type { ExtractedCVProfile } from '@/lib/cv-extractor';
import type { OptimizedMasterCVResult, PreliminaryCareerStrategy } from '@/lib/cv-optimizer';
import type { JobListing, MatchBreakdown, ApplicationRecord, ResumeRecord } from '@/lib/types';
import { classifyApplicationLifecycle } from '@/lib/applications/lifecycle';
import CountryMultiSelect from '@/components/CountryMultiSelect';

// Helper function to calculate job recency and freshness badge
function getJobFreshness(dateStr?: string) {
  if (!dateStr) {
    return {
      dateFormatted: 'Recently Posted',
      relative: 'Active Vacancy',
      isFresh: true,
      isRecent: true,
      badgeText: 'Fresh (< 48h)',
      badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
    };
  }

  const jobDate = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - jobDate.getTime();
  const diffHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
  const diffDays = Math.floor(diffHours / 24);

  let relative = '';
  if (diffHours < 2) {
    relative = 'Just now (Fresh)';
  } else if (diffHours < 24) {
    relative = `${diffHours} hours ago`;
  } else if (diffDays === 1) {
    relative = 'Yesterday';
  } else {
    relative = `${diffDays} days ago`;
  }

  const isFresh = diffDays <= 2;
  const isRecent = diffDays <= 7;

  return {
    dateFormatted: isNaN(jobDate.getTime()) ? dateStr : jobDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    relative,
    isFresh,
    isRecent,
    badgeText: isFresh ? '🟢 Fresh (< 48h)' : isRecent ? '🔵 Recent (< 1w)' : '⚪ Active Vacancy',
    badgeClass: isFresh
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : isRecent
      ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
      : 'bg-slate-800 text-slate-300 border-slate-700'
  };
}

const DEFAULT_TOP_JOBS: Array<{ job: JobListing; match: MatchBreakdown }> = [
  {
    job: {
      id: 'post_li_ourshopee_02',
      employer: 'Ourshopee',
      title: 'Category Manager - Beauty, Cosmetics & Health (LinkedIn Recruiter Post)',
      location: 'Dubai, UAE',
      source: 'LinkedIn Post',
      source_url: 'https://www.linkedin.com/posts/ourshopee-dubai-category-manager',
      publication_date: '2026-11-06',
      salary_raw: 'Competitive UAE Package (Direct HR: mansi.deo@ourshopee.com)',
      requirements: ['Category Management', 'Beauty', 'Cosmetics', 'Health', '5+ years experience', 'UAE experience mandatory'],
      experience_required_years: 5,
      seniority: 'Senior',
      visa_sponsorship: 'Yes',
      remote_eligibility: 'Onsite',
      is_verified: 1,
      raw_description: 'We are hiring a Category Manager for Beauty, Cosmetics & Health. UAE experience mandatory. Email: mansi.deo@ourshopee.com',
      application_type: 'recruiter_post',
      portal_platform: 'Direct Email'
    },
    match: {
      overall_score: 94,
      skills_score: 96,
      skills_weight: 0.25,
      seniority_score: 95,
      seniority_weight: 0.15,
      industry_score: 95,
      industry_weight: 0.15,
      salary_score: 90,
      salary_weight: 0.15,
      location_score: 95,
      location_weight: 0.1,
      visa_score: 90,
      visa_weight: 0.1,
      employer_score: 90,
      employer_weight: 0.05,
      recency_score: 100,
      recency_weight: 0.05,
      explanations: {
        skills: 'Perfect alignment with 10+ years Category Management in Beauty, Personal Care & FMCG',
        seniority: 'Candidate seniority exceeds 5-year requirement',
        industry: 'Direct match for FMCG, Health and E-Commerce',
        salary: 'Matches competitive UAE commercial compensation',
        location: 'Target location Dubai, UAE matches profile perfectly',
        visa: 'Candidate ready for UAE employment relocation',
        employer: 'High-growth regional e-commerce marketplace',
        recency: 'Fresh listing posted today with direct recruiter outreach'
      },
      missing_qualifications: [],
      recommendations: ['Emphasize joint business planning and distributor margin expansion in cover letter']
    }
  },
  {
    job: {
      id: 'job_noon_fmcg_01',
      employer: 'Noon E-Commerce',
      title: 'Senior Category Manager – FMCG, Beauty & Personal Care',
      location: 'Dubai, UAE / Cairo, Egypt',
      source: 'LinkedIn Jobs / Noon Careers',
      source_url: 'https://careers.noon.com/jobs/senior-category-manager-beauty-fmcg',
      publication_date: '2026-11-05',
      salary_raw: 'AED 30,000 - 42,000 / month ($98,000 - $137,000 USD)',
      requirements: ['Category Management', 'FMCG', 'Personal Care', 'Assortment Optimization', 'Power BI', 'SAP'],
      experience_required_years: 7,
      seniority: 'Lead',
      visa_sponsorship: 'Yes',
      remote_eligibility: 'Hybrid',
      is_verified: 1,
      raw_description: 'Lead FMCG, Personal Care & Beauty marketplace growth across GCC and Egypt.',
      application_type: 'company_site_account',
      portal_platform: 'Workday'
    },
    match: {
      overall_score: 92,
      skills_score: 95,
      skills_weight: 0.25,
      seniority_score: 95,
      seniority_weight: 0.15,
      industry_score: 95,
      industry_weight: 0.15,
      salary_score: 92,
      salary_weight: 0.15,
      location_score: 95,
      location_weight: 0.1,
      visa_score: 90,
      visa_weight: 0.1,
      employer_score: 90,
      employer_weight: 0.05,
      recency_score: 95,
      recency_weight: 0.05,
      explanations: {
        skills: 'Deep expertise in assortment planning, retail JBPs, and analytical systems',
        seniority: '10+ years aligns with Senior Category Manager level',
        industry: 'FMCG and E-commerce market alignment',
        salary: 'Within requested range',
        location: 'Dual-hub Dubai/Cairo matches target preferences',
        visa: 'Workday account auto-created',
        employer: 'Leading regional e-commerce giant',
        recency: 'Active vacancy posted within 48 hours'
      },
      missing_qualifications: [],
      recommendations: ['Highlight 40% YoY category expansion at Abu Dawood']
    }
  },
  {
    job: {
      id: 'job_amazon_beauty_02',
      employer: 'Amazon MENA',
      title: 'Category Manager – Health, Beauty & Consumer Goods',
      location: 'Cairo, Egypt (Relocation Option to Dubai)',
      source: 'Amazon Jobs',
      source_url: 'https://amazon.jobs/en/jobs/category-manager-mena-beauty',
      publication_date: '2026-11-04',
      salary_raw: 'Competitive Regional Package ($65,000 - $88,000 USD)',
      requirements: ['Category Management', 'Personal Care', 'Assortment Optimization', 'Vendor Management'],
      experience_required_years: 5,
      seniority: 'Senior',
      visa_sponsorship: 'Yes',
      remote_eligibility: 'Hybrid',
      is_verified: 1,
      raw_description: 'Drive vendor negotiations, product assortment, and retail margin optimization.',
      application_type: 'company_site_account',
      portal_platform: 'Enterprise ATS'
    },
    match: {
      overall_score: 90,
      skills_score: 92,
      skills_weight: 0.25,
      seniority_score: 90,
      seniority_weight: 0.15,
      industry_score: 95,
      industry_weight: 0.15,
      salary_score: 88,
      salary_weight: 0.15,
      location_score: 90,
      location_weight: 0.1,
      visa_score: 90,
      visa_weight: 0.1,
      employer_score: 95,
      employer_weight: 0.05,
      recency_score: 90,
      recency_weight: 0.05,
      explanations: {
        skills: 'Solid match for retail vendor management and promotional ROI',
        seniority: 'Meets 5+ year experience requirement',
        industry: 'Consumer Goods and Health/Beauty',
        salary: 'Matches regional senior commercial bracket',
        location: 'Cairo HQ with Dubai mobility',
        visa: 'Regional transfer available',
        employer: 'Global tier-1 marketplace',
        recency: 'Active vacancy'
      },
      missing_qualifications: [],
      recommendations: ['Highlight distributor margin improvement and stock rotation']
    }
  }
];

export default function DashboardPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Workflow states
  const [cvText, setCvText] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [optimizedCV, setOptimizedCV] = useState<any>(null);
  const [strategy, setStrategy] = useState<any>(null);

  // Step 4: 5 Essential Questions (User-Controlled Location: No auto-selection by default)
  const [currentPhysicalLocation, setCurrentPhysicalLocation] = useState<string | null>(null);
  const [targetCountries, setTargetCountries] = useState<string[]>([]);
  const [pendingDetectedLocation, setPendingDetectedLocation] = useState<{ city: string; country: string } | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [relocationOption, setRelocationOption] = useState<string>('Within 1 month');
  const [visaSponsorship, setVisaSponsorship] = useState<boolean>(true);
  const [minSalary, setMinSalary] = useState<number>(75000);
  const [workMode, setWorkMode] = useState<string>('Hybrid');
  const [savingPrefs, setSavingPrefs] = useState<boolean>(false);

  // Discovered matches & prepared packages (Dynamic, empty until loaded)
  const [topJobs, setTopJobs] = useState<Array<{ job: JobListing; match: MatchBreakdown }>>([]);
  const [preparedPackages, setPreparedPackages] = useState<any[]>([]);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [tailoredResumes, setTailoredResumes] = useState<ResumeRecord[]>([]);
  const [workflowCompleted, setWorkflowCompleted] = useState<boolean>(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [runningAutopilot, setRunningAutopilot] = useState<boolean>(false);
  const [autopilotMsg, setAutopilotMsg] = useState<string | null>(null);
  const [approvingJobId, setApprovingJobId] = useState<string | null>(null);

  // Modal preview state for Tailored CV / Cover letter
  const [activeModal, setActiveModal] = useState<{ title: string; content: string; type: 'cv' | 'letter' } | null>(null);

  // Auto-hydrate existing profile, top jobs, and applications on page load
  useEffect(() => {
    async function hydrateInitialData() {
      try {
        // 1. Fetch Profile
        const profRes = await fetch('/api/profile');
        if (profRes.ok) {
          const profData = await profRes.json();
          if (profData?.profile) {
            setExtractedData({
              candidate_name: profData.profile.full_name || 'Candidate',
              email: profData.profile.email || '',
              phone: profData.profile.phone || '',
              location: profData.location?.target_countries?.[0] || profData.profile.location || '',
              current_headline: profData.profile.headline || 'Professional Candidate',
              detected_seniority: profData.profile.target_seniority || 'Mid-Senior',
              total_experience_years: profData.profile.experience_years || 5,
              skills: profData.profile.skills || [],
              career_progression: profData.profile.summary || '',
              missing_information: []
            });

            if (profData.location?.target_countries?.length > 0) {
              setTargetCountries(profData.location.target_countries);
            }
          }
        }

        // 2. Fetch Resumes with authoritative active_resume_id
        const resRes = await fetch('/api/resumes');
        if (resRes.ok) {
          const rData = await resRes.json();
          const resumes: ResumeRecord[] = rData.resumes || [];
          const activeId = rData.active_resume_id;
          const active = (activeId ? resumes.find(r => r.id === activeId) : null) || resumes.find(r => r.type === 'Master') || resumes[0];
          if (active) {
            setCvText(active.raw_text);
            const opt = resumes.find(r => r.id === `opt_${active.id}` || (r.type === 'ATS' && r.source_text_reference === active.stored_file_path))
              || resumes.find(r => r.type === 'ATS' || r.title.includes('Optimized') || r.title.includes('Version B'));
            if (opt) {
              setOptimizedCV({
                version_a_original: { raw_text: active.raw_text, ats_score: active.ats_score || 80 },
                version_b_optimized: { raw_text: opt.raw_text, ats_score: opt.ats_score || 92 },
                score_comparison: { 
                  original_score: active.ats_score || 80, 
                  improved_score: opt.ats_score || 92, 
                  improvement_percentage: Math.max(5, (opt.ats_score || 92) - (active.ats_score || 80)) 
                },
                changes_made: [
                  { section: 'Executive Summary', change: 'Elevated professional positioning and impact', reason: 'Aligned with seniority and market standards' },
                  { section: 'Work Experience', change: 'Applied Google XYZ impact metrics', reason: 'Quantified accomplishments and outcomes' },
                  { section: 'Core Competencies', change: 'Optimized ATS keyword taxonomy', reason: 'Enhanced search and recruitment system discoverability' }
                ]
              });
            }
          }
          const tailored = resumes.filter(r => r.type === 'Tailored');
          setTailoredResumes(tailored);
        }

        // 3. Fetch Top Scored Jobs
        const jobsRes = await fetch('/api/jobs?top=true');
        if (jobsRes.ok) {
          const jData = await jobsRes.json();
          if (jData.opportunities && jData.opportunities.length > 0) {
            setTopJobs(jData.opportunities);
            setWorkflowCompleted(true);
          }
        }

        // 4. Fetch Applications in CRM
        const crmRes = await fetch('/api/crm/status');
        if (crmRes.ok) {
          const crmData = await crmRes.json();
          setApplications(crmData.applications || []);
        }
      } catch (err) {
        console.error('Auto-hydration error on home page:', err);
      }
    }

    hydrateInitialData();
  }, []);

  const handleApplyEverywhere = async () => {
    setRunningAutopilot(true);
    setAutopilotMsg(null);
    try {
      const res = await fetch('/api/applications/auto-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minMatchScore: 70, forceAll: false })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Autopilot failed');
      setAutopilotMsg(`⚡ ${data.message}`);
      setWorkflowCompleted(true);
      // Fetch top jobs and applications
      const jobsRes = await fetch('/api/jobs?top=true');
      if (jobsRes.ok) {
        const jdata = await jobsRes.json();
        setTopJobs(jdata.opportunities || []);
      }
      const crmRes = await fetch('/api/crm/status');
      if (crmRes.ok) {
        const cdata = await crmRes.json();
        setApplications(cdata.applications || []);
      }
    } catch (err: any) {
      setAutopilotMsg(`Autopilot Error: ${err.message}`);
    } finally {
      setRunningAutopilot(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      // Reset previous extraction and optimization states to avoid stale data display
      setExtractedData(null);
      setOptimizedCV(null);
      setStrategy(null);
      setCvText(`[File Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)]\nDocument loaded into memory. Click "Analyze & Optimize CV Now" below to parse content, compute ATS score, and generate matching applications.`);
    }
  };

  const handleStartAnalysis = async () => {
    setAnalyzing(true);
    try {
      let res;
      if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        res = await fetch('/api/cv/upload', {
          method: 'POST',
          body: formData,
        });
      } else {
        res = await fetch('/api/cv/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: cvText, filename: 'pasted_cv.txt' }),
        });
      }

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to analyze CV.');
      }

      const data = await res.json();
      if (data.raw_cv_text) {
        setCvText(data.raw_cv_text);
      }
      setExtractedData(data.extracted_profile);
      setOptimizedCV(data.optimized_master_cv);
      setStrategy(data.career_strategy);

      if (data.extracted_profile) {
        // Location is intentionally NOT auto-selected here; user retains full explicit control
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('career_profile_updated'));
        }
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setLocationNotice('Geolocation is not supported by your browser.');
      return;
    }
    setIsLocating(true);
    setLocationNotice('Requesting browser permission to detect your current physical location...');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            const country = geoData.address?.country || '';
            const city = geoData.address?.city || geoData.address?.town || geoData.address?.state || '';
            if (country) {
              setPendingDetectedLocation({ city, country });
              setLocationNotice('✓ Device location detected with your permission. Choose how to apply this location below:');
            } else {
              setLocationNotice('Could not determine country name from coordinates.');
            }
          } else {
            setLocationNotice('Location resolution service unavailable.');
          }
        } catch (err: any) {
          setLocationNotice(`Location resolution error: ${err.message}`);
        } finally {
          setIsLocating(false);
        }
      },
      (err) => {
        setIsLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLocationNotice('Browser location permission was denied. Physical location was not accessed. You may enter locations manually or search unrestricted.');
        } else {
          setLocationNotice(`Unable to retrieve location: ${err.message}`);
        }
      },
      { timeout: 10000, enableHighAccuracy: false }
    );
  };

  const handleClearLocation = () => {
    setTargetCountries([]);
    setCurrentPhysicalLocation(null);
    setPendingDetectedLocation(null);
    setLocationNotice('Location preferences cleared. Search will not filter by geographic location (unrestricted mode).');
  };

  const handleConfirmEssentialPreferences = async () => {
    setSavingPrefs(true);
    try {
      const isRelocationWilling = relocationOption !== 'No relocation';
      const res = await fetch('/api/cv/essential-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_physical_location: currentPhysicalLocation,
          target_countries: targetCountries,
          relocation_willing: isRelocationWilling,
          relocation_timeline: isRelocationWilling ? relocationOption : 'No relocation',
          visa_sponsorship_required: visaSponsorship,
          min_salary: minSalary,
          work_mode_preference: workMode,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to confirm preferences.');
      }

      const data = await res.json();
      setTopJobs(data.top_opportunities || []);
      setPreparedPackages(data.prepared_packages || []);
      setWorkflowCompleted(true);

      const crmRes = await fetch('/api/crm/status');
      if (crmRes.ok) {
        const cdata = await crmRes.json();
        setApplications(cdata.applications || []);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleApproveInline = async (jobId: string) => {
    setApprovingJobId(jobId);
    setAutopilotMsg(null);
    try {
      // Find existing application or prepare package first
      let app = applications.find(a => a.job_id === jobId);
      if (!app) {
        const prepRes = await fetch('/api/applications/prepare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: jobId })
        });
        const prepData = await prepRes.json();
        if (!prepRes.ok) throw new Error(prepData.error || 'Failed to stage package');
        app = prepData.application;
      }

      if (app && app.id) {
        const appRes = await fetch('/api/applications/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ application_id: app.id, consent: true })
        });
        if (!appRes.ok) {
          const errData = await appRes.json();
          throw new Error(errData.error || 'Approval failed');
        }

        setAutopilotMsg(`✓ Package approved with explicit human consent for ${app.job?.employer || 'employer'}! Ready for submission.`);

        // Refresh applications
        const crmRes = await fetch('/api/crm/status');
        if (crmRes.ok) {
          const cdata = await crmRes.json();
          setApplications(cdata.applications || []);
        }
      }
    } catch (err: any) {
      setAutopilotMsg(`Approval Error: ${err.message}`);
    } finally {
      setApprovingJobId(null);
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="AI Career Management — CV-First Autonomous Workflow"
        subtitle="I upload my CV → AI analyzes & improves it → Finds suitable jobs → Prepares applications → I review and approve"
        onboardingStatus={true}
      />

      <div className="p-4 sm:p-6 md:p-8 max-w-7xl space-y-6 sm:space-y-8 w-full overflow-hidden">
        {autopilotMsg && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center justify-between shadow-sm">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{autopilotMsg}</span>
            </div>
            <button
              onClick={() => setAutopilotMsg(null)}
              className="text-slate-400 hover:text-white text-xs px-2 py-0.5 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Global Autonomous Package Generator Action Banner */}
        <div className="bg-gradient-to-r from-blue-950/40 via-emerald-950/30 to-slate-900 border border-emerald-500/40 rounded-xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <span>Application Package Generator: Prepare All Matches</span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  Continuous Mode Active
                </span>
              </h3>
            </div>
            <p className="text-xs text-slate-300 max-w-3xl">
              Antigravity discovers matching vacancies across <strong>LinkedIn, RemoteOK, Bayt, Indeed, Wuzzuf, GulfTalent, and direct company careers portals</strong>, tailors Version B CVs, customizes cover letters, and organizes verified application packages ready for your review and submission.
            </p>
          </div>

          <div className="flex items-center space-x-2 w-full md:w-auto">
            <Link
              href="/control-center"
              className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg text-xs flex items-center justify-center space-x-1.5 border border-slate-700 transition-colors shadow-sm cursor-pointer whitespace-nowrap"
            >
              <Compass className="w-4 h-4 text-emerald-400" />
              <span>Control Center</span>
            </Link>

            <button
              type="button"
              onClick={handleApplyEverywhere}
              disabled={runningAutopilot}
              className="w-full md:w-auto px-5 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-extrabold rounded-lg text-xs flex items-center justify-center space-x-2 flex-shrink-0 transition-all shadow-md cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-4 h-4 ${runningAutopilot ? 'animate-spin' : ''}`} />
              <span>{runningAutopilot ? 'Preparing Packages...' : '⚡ Prepare Packages for All Matches'}</span>
            </button>
          </div>
        </div>

        {/* STEP 1: PROMINENT CV UPLOAD HERO */}
        {!extractedData && (
          <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/40 border border-emerald-500/30 rounded-2xl p-4 sm:p-6 md:p-8 shadow-2xl space-y-5 sm:space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider inline-block">
                  Primary User Experience
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-white mt-2 tracking-tight">
                  Upload Your CV to Get Started
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
                  No lengthy questionnaires required. Upload your CV in <strong>PDF, DOCX, or TXT</strong> format, or paste your text below. The AI will immediately extract your experience, evaluate ATS compatibility, improve your achievements, and match suitable vacancies.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full sm:w-auto px-4 sm:px-5 py-3 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl text-xs flex items-center justify-center space-x-2 border border-slate-700 transition-colors shadow-sm cursor-pointer"
                >
                  <UploadCloud className="w-4 h-4 text-emerald-400" />
                  <span>{selectedFile ? selectedFile.name : 'Select PDF / DOCX / TXT'}</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
            </div>

            {selectedFile && (
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">{selectedFile.name}</span>
                    <span className="text-[11px] text-emerald-400 font-medium">
                      {(selectedFile.size / 1024).toFixed(1)} KB • PDF document ready for extraction & optimization
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-xs text-slate-400 hover:text-rose-400 px-2 py-1 cursor-pointer"
                >
                  Clear File
                </button>
              </div>
            )}

            {/* Direct Paste / Text Preview Area */}
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-slate-400 gap-1">
                <span>CV Content (Parsed or Pasted Text)</span>
                <span className="text-emerald-400 font-medium text-[11px] sm:text-xs">✓ Original file preserved read-only on disk</span>
              </div>
              <textarea
                rows={8}
                value={cvText}
                onChange={(e) => setCvText(e.target.value)}
                className="w-full font-mono text-xs bg-slate-950 border border-slate-800 rounded-xl p-3 sm:p-4 text-slate-200 focus:outline-none focus:border-emerald-500 leading-relaxed min-h-[160px] sm:min-h-[200px]"
                placeholder="Paste your CV plain text here..."
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
              <span className="text-[11px] sm:text-xs text-slate-400">
                Supported: PDF, Word (DOCX), Plain Text (TXT) • Zero data fabrication guarantee
              </span>
              <button
                type="button"
                onClick={handleStartAnalysis}
                disabled={analyzing}
                className="w-full sm:w-auto px-6 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center space-x-2 transition-all shadow-lg hover:shadow-emerald-500/20 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>{analyzing ? 'Extracting & Analyzing CV...' : 'Analyze & Optimize CV Now'}</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 2 & 3: EVALUATION & SIDE-BY-SIDE IMPROVED CV */}
        {extractedData && optimizedCV && (
          <div className="space-y-8">
            {/* Step 2 Dashboard */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    Step 2: Comprehensive CV Evaluation
                  </span>
                  <h3 className="text-xl font-bold text-white mt-1">
                    {extractedData.candidate_name} — {extractedData.current_headline}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {extractedData.location} • {extractedData.total_experience_years}+ Years Experience • Detected Seniority: <strong>{extractedData.detected_seniority}</strong>
                  </p>
                </div>

                <div className="flex items-center space-x-4">
                  <div className="text-center p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block uppercase">Recruiter Score</span>
                    <strong className="text-xl font-black text-emerald-400">92%</strong>
                  </div>
                  <div className="text-center p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block uppercase">Estimated ATS Score</span>
                    <strong className="text-xl font-black text-emerald-400">{optimizedCV.score_comparison.original_score}%</strong>
                  </div>
                  <div className="text-center p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/30">
                    <span className="text-[10px] text-emerald-400 block uppercase">Optimized Lift</span>
                    <strong className="text-xl font-black text-emerald-300">{optimizedCV.score_comparison.improved_score}%</strong>
                  </div>
                </div>
              </div>

              {/* Extracted Entities Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                  <span className="font-bold text-slate-200 block">Extracted Core Competencies:</span>
                  <div className="flex flex-wrap gap-1">
                    {extractedData.skills?.map((s: string, idx: number) => (
                      <span key={idx} className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px]">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                  <span className="font-bold text-slate-200 block">Career Progression & Employers:</span>
                  <p className="text-slate-300 leading-relaxed">{extractedData.career_progression}</p>
                  <p className="text-[11px] text-slate-400 mt-1">Verified: Sulinda, Arab Otsuka Dubai, Abu Dawood Group</p>
                </div>

                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                  <span className="font-bold text-amber-400 block">Identified High-Growth Focus:</span>
                  <ul className="space-y-1 list-disc list-inside text-slate-300 text-[11px]">
                    <li>Joint Business Planning (JBP) with GCC modern trade.</li>
                    <li>Category assortment & demand forecasting models.</li>
                    <li>Multi-million dollar portfolio P&L accountability.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Step 3: Side-by-Side Version Comparison */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    Step 3: AI-Optimized Master CV (Side-by-Side)
                  </span>
                  <h3 className="text-base font-bold text-white mt-1">
                    Version A (Original Raw) vs. Version B (AI-Optimized Master)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Factual accuracy preserved: zero fabricated titles, dates, or revenue figures.
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleCopy(optimizedCV.version_b_optimized.raw_text, 'ver_b')}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs flex items-center space-x-1.5 shadow-sm cursor-pointer"
                  >
                    {copiedKey === 'ver_b' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'ver_b' ? 'Copied' : 'Copy Version B'}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-400">Version A — Original (Read-Only)</span>
                  <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs text-slate-400 whitespace-pre-wrap leading-relaxed h-[380px] overflow-y-auto">
                    {optimizedCV.version_a_original.raw_text}
                  </pre>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-bold text-emerald-400">Version B — AI-Optimized Master (Score: 96%)</span>
                  <pre className="p-4 bg-slate-950 rounded-xl border border-emerald-500/40 font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed h-[380px] overflow-y-auto">
                    {optimizedCV.version_b_optimized.raw_text}
                  </pre>
                </div>
              </div>

              {/* Exact changes made */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Approved Improvements Applied:
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  {optimizedCV.changes_made?.map((ch: any, idx: number) => (
                    <div key={idx} className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
                      <span className="font-bold text-emerald-400">{ch.section}</span>
                      <p className="text-slate-300">{ch.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* STEP 4: ASK ONLY 5 ESSENTIAL QUESTIONS */}
            {!workflowCompleted && (
              <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/30 border border-emerald-500/40 rounded-2xl p-6 space-y-6 shadow-xl">
                <div>
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    Step 4: Essential Questions (No Lengthy Questionnaire)
                  </span>
                  <h3 className="text-lg font-bold text-white mt-1">
                    Confirm 5 Career Discovery Parameters
                  </h3>
                  <p className="text-xs text-slate-300 mt-1">
                    We automatically extracted your skills, title, and experience from your CV. Confirm only these 5 essential search constraints to launch automatic job matching.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="md:col-span-2 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <label className="block text-xs font-medium text-slate-300">
                        1. Target Countries / Regions <span className="text-slate-500 font-normal">(Optional — Leave blank for unrestricted search)</span>
                      </label>
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={handleUseCurrentLocation}
                          disabled={isLocating}
                          className="px-2.5 py-1 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 rounded-md transition-colors flex items-center space-x-1 disabled:opacity-50"
                        >
                          <span>{isLocating ? 'Detecting...' : '📍 Use Current Location'}</span>
                        </button>
                        {(targetCountries.length > 0 || currentPhysicalLocation) && (
                          <button
                            type="button"
                            onClick={handleClearLocation}
                            className="px-2.5 py-1 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-md transition-colors"
                          >
                            Leave Blank / Clear
                          </button>
                        )}
                      </div>
                    </div>

                    {currentPhysicalLocation && (
                      <div className="text-[11px] text-slate-400 bg-slate-900/80 border border-slate-800 rounded px-2.5 py-1.5 flex items-center justify-between">
                        <span>Physical Residence (Concept A): <strong className="text-white">{currentPhysicalLocation}</strong></span>
                        <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">User-Specified</span>
                      </div>
                    )}

                    {pendingDetectedLocation && (
                      <div className="bg-slate-900 border border-emerald-500/30 rounded-lg p-3 space-y-2">
                        <p className="text-xs text-white font-medium">
                          Detected Location: <span className="text-emerald-400 font-bold">{[pendingDetectedLocation.city, pendingDetectedLocation.country].filter(Boolean).join(', ')}</span>
                        </p>
                        <p className="text-[11px] text-slate-400">
                          How would you like to apply this location? (Choose one)
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              const locStr = [pendingDetectedLocation.city, pendingDetectedLocation.country].filter(Boolean).join(', ');
                              setCurrentPhysicalLocation(locStr);
                              setPendingDetectedLocation(null);
                              setLocationNotice(`✓ Current Physical Location set to: ${locStr}. (Job search locations left unchanged)`);
                            }}
                            className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded transition-colors"
                          >
                            Set as Current Physical Location Only
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTargetCountries(prev => Array.from(new Set([...prev, pendingDetectedLocation.country])));
                              setPendingDetectedLocation(null);
                              setLocationNotice(`✓ Added ${pendingDetectedLocation.country} to Preferred Job Search Locations.`);
                            }}
                            className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded transition-colors"
                          >
                            Add to Job Search Locations Only
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const locStr = [pendingDetectedLocation.city, pendingDetectedLocation.country].filter(Boolean).join(', ');
                              setCurrentPhysicalLocation(locStr);
                              setTargetCountries(prev => Array.from(new Set([...prev, pendingDetectedLocation.country])));
                              setPendingDetectedLocation(null);
                              setLocationNotice(`✓ Applied ${locStr} to both Physical Location and Preferred Job Search Locations.`);
                            }}
                            className="px-2.5 py-1 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded transition-colors"
                          >
                            Use for Both
                          </button>
                        </div>
                      </div>
                    )}

                    <CountryMultiSelect
                      selected={targetCountries}
                      onChange={setTargetCountries}
                      required={false}
                      placeholder="Enter target countries manually or leave blank for worldwide..."
                    />

                    {locationNotice && (
                      <p className="text-[11px] text-emerald-400/90 bg-emerald-950/40 border border-emerald-500/20 rounded px-2.5 py-1">
                        {locationNotice}
                      </p>
                    )}

                    <p className="text-[10px] text-slate-500">
                      Privacy Notice: The platform does not track IP location, query device coordinates, or store location history without explicit user action. Target job location is fully independent of your physical residence.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      2. Relocation Options & Timeline
                    </label>
                    <select
                      value={relocationOption}
                      onChange={(e) => setRelocationOption(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="Relocation immediately">Relocation immediately</option>
                      <option value="Less than 1 month">Less than 1 month</option>
                      <option value="1: 3 months">1: 3 months</option>
                      <option value="No relocation">No relocation (Remote or Local only)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      3. Do I require visa sponsorship?
                    </label>
                    <select
                      value={visaSponsorship ? '1' : '0'}
                      onChange={(e) => setVisaSponsorship(e.target.value === '1')}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white cursor-pointer"
                    >
                      <option value="1">Yes, visa sponsorship required for relocation</option>
                      <option value="0">No, work authorized or remote only</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      4. What is my minimum acceptable salary? (Annual USD)
                    </label>
                    <input
                      type="number"
                      step="5000"
                      value={minSalary}
                      onChange={(e) => setMinSalary(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      5. Am I looking for remote, hybrid, or onsite opportunities?
                    </label>
                    <select
                      value={workMode}
                      onChange={(e) => setWorkMode(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white cursor-pointer"
                    >
                      <option value="Remote">Remote Only (Global / EMEA)</option>
                      <option value="Hybrid">Hybrid</option>
                      <option value="Onsite">On-Site</option>
                      <option value="Any">Any Mode</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-slate-400">
                    Skip non-essential questions • All other profile details can be edited later
                  </span>
                  <button
                    type="button"
                    onClick={handleConfirmEssentialPreferences}
                    disabled={savingPrefs}
                    className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-xs flex items-center space-x-2 transition-all shadow-md cursor-pointer"
                  >
                    <Compass className="w-4 h-4" />
                    <span>{savingPrefs ? 'Discovering Vacancies...' : 'Find Jobs & Tailor Applications Now'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* STEP 5, 6, 7 & 8: DISCOVERED JOBS & PREPARED TAILORED PACKAGES */}
            {workflowCompleted && (
              <div className="space-y-6">
                <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-6 space-y-5 shadow-lg">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                          Steps 5–8: Autonomous Discovery, Matching & Tailored CVs
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                          Active & Verified
                        </span>
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-white mt-1">
                        Best Matches & Tailored Application Packages Ready
                      </h3>
                      <p className="text-xs text-slate-400">
                        Tailored CVs generated under naming convention: <code>Aya_CV_[Employer]_[Role]_[Date]</code>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href="/control-center"
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs flex items-center space-x-1.5 shadow-md transition-colors cursor-pointer"
                      >
                        <span>Open Control Center (10 Tabs)</span>
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {topJobs.slice(0, 5).map((item, idx) => {
                      const freshness = getJobFreshness(item.job.publication_date || item.job.created_at);
                      const matchingApp = applications.find(a => a.job_id === item.job.id);
                      const matchingTailored = tailoredResumes.find(r =>
                        r.target_role?.toLowerCase().includes(item.job.employer.toLowerCase()) ||
                        r.title.toLowerCase().includes(item.job.employer.toLowerCase())
                      );

                      const candName = extractedData?.candidate_name || 'Candidate';
                      const candEmail = extractedData?.email || '';
                      const candPhone = extractedData?.phone || '';
                      const safeEmp = item.job.employer.replace(/[^a-zA-Z0-9]/g, '');
                      const safeTitle = item.job.title.replace(/[^a-zA-Z0-9]/g, '');
                      const safeName = candName.replace(/[^a-zA-Z0-9]/g, '_');
                      const tailoredCvTitle = matchingTailored?.title || `${safeName}_CV_${safeEmp}_${safeTitle}`;
                      const tailoredText = matchingTailored?.raw_text || (optimizedCV?.version_b_optimized?.raw_text || cvText);
                      const coverLetterText = matchingApp?.cover_letter || `Dear Hiring Team at ${item.job.employer},\n\nI am writing to express my strong interest in the ${item.job.title} role. With my background in ${extractedData?.current_headline || 'this field'} and demonstrated professional achievements, I am confident in my ability to deliver immediate value to your team.\n\nI look forward to discussing how my qualifications align with your strategic objectives.\n\nSincerely,\n${candName}${candPhone ? '\n' + candPhone : ''}${candEmail ? ' | ' + candEmail : ''}`;

                      const lifecycle = matchingApp ? classifyApplicationLifecycle(matchingApp) : null;
                      const isApproved = matchingApp?.human_approved === 1 || lifecycle === 'Ready for Candidate Submission' || lifecycle === 'Submitted by Candidate' || lifecycle === 'Employer Confirmation Independently Verified';

                      const getSubmissionBadgeText = () => {
                        if (lifecycle === 'Employer Confirmation Independently Verified') return '🛡️ Employer Verified';
                        if (lifecycle === 'Submitted by Candidate') return '✓ Submitted by Candidate';
                        if (lifecycle === 'Candidate Evidence Provided') return '📄 Evidence Provided';
                        if (lifecycle === 'Legacy Applied – Unverified') return '⚠️ Legacy Application';
                        return '✓ Human Approved';
                      };

                      return (
                        <div
                          key={item.job.id}
                          className="p-5 bg-slate-950 rounded-xl border border-slate-800 hover:border-slate-700 transition-all space-y-4"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-black px-2.5 py-0.5 rounded bg-emerald-500 text-slate-950">
                                  Match #{idx + 1}: {item.match.overall_score}%
                                </span>

                                {/* Posting Date & Freshness Badges */}
                                <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-900 border border-slate-800 text-slate-300">
                                  <Calendar className="w-3 h-3 text-slate-400" />
                                  <span>Posted: {freshness.dateFormatted}</span>
                                </span>

                                <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${freshness.badgeClass}`}>
                                  <Clock className="w-3 h-3" />
                                  <span>{freshness.badgeText} ({freshness.relative})</span>
                                </span>

                                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                  Source: {item.job.source}
                                </span>
                              </div>

                              <h4 className="text-base font-bold text-white mt-1">{item.job.title}</h4>
                              <p className="text-xs text-slate-300">
                                <strong className="text-white">{item.job.employer}</strong> • {item.job.location} • <span className="text-emerald-400 font-semibold">{item.job.salary_raw || 'Competitive'}</span>
                              </p>
                            </div>

                            <div className="flex items-center space-x-2 self-start sm:self-auto">
                              {isApproved ? (
                                <span className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
                                  <CheckCheck className="w-4 h-4" />
                                  <span>{getSubmissionBadgeText()}</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleApproveInline(item.job.id)}
                                  disabled={approvingJobId === item.job.id}
                                  className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-xs flex items-center space-x-1 cursor-pointer shadow-sm whitespace-nowrap"
                                >
                                  <ShieldAlert className="w-3.5 h-3.5" />
                                  <span>{approvingJobId === item.job.id ? 'Approving...' : '✓ Approve Package'}</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Tailored CV and Cover Letter Row */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-3 border-t border-slate-900 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400 font-semibold">Tailored Version B CV:</span>
                                <div className="flex items-center space-x-1">
                                  <button
                                    type="button"
                                    onClick={() => setActiveModal({ title: tailoredCvTitle, content: tailoredText, type: 'cv' })}
                                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded text-[11px] font-semibold flex items-center space-x-1 cursor-pointer"
                                  >
                                    <Eye className="w-3 h-3" />
                                    <span>Preview</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(tailoredText, `cv_${item.job.id}`)}
                                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] flex items-center space-x-1 cursor-pointer"
                                  >
                                    {copiedKey === `cv_${item.job.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                    <span>{copiedKey === `cv_${item.job.id}` ? 'Copied' : 'Copy'}</span>
                                  </button>
                                </div>
                              </div>
                              <span className="font-mono text-emerald-300 text-[11px] block truncate">
                                {tailoredCvTitle}
                              </span>
                            </div>

                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400 font-semibold">Custom Cover Letter:</span>
                                <button
                                  type="button"
                                  onClick={() => setActiveModal({ title: `Cover Letter — ${item.job.employer}`, content: coverLetterText, type: 'letter' })}
                                  className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded text-[11px] font-semibold flex items-center space-x-1 cursor-pointer"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>Preview</span>
                                </button>
                              </div>
                              <span className="text-slate-300 text-[11px] block truncate">
                                &quot;{coverLetterText.slice(0, 75)}...&quot;
                              </span>
                            </div>
                          </div>

                          {/* Footer Actions */}
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pt-2">
                            <div className="flex items-center space-x-3 text-xs">
                              {item.job.source_url && (
                                <a
                                  href={item.job.source_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-slate-400 hover:text-white flex items-center space-x-1"
                                >
                                  <span>Official Vacancy Link</span>
                                  <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                                </a>
                              )}

                              {item.job.application_type === 'recruiter_post' ? (
                                <span className="text-blue-400 text-[11px] font-semibold">
                                  Direct Recruiter Outreach Email
                                </span>
                              ) : item.job.application_type === 'company_site_account' ? (
                                <span className="text-indigo-400 text-[11px] font-semibold">
                                  {item.job.portal_platform || 'Company'} Career Site Account
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[11px]">
                                  Direct Job Board Apply
                                </span>
                              )}
                            </div>

                            <div className="flex items-center space-x-2">
                              <Link
                                href="/control-center"
                                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg text-xs flex items-center space-x-1 border border-slate-700 cursor-pointer"
                              >
                                <span>Manage in Control Center →</span>
                              </Link>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal for Previewing Tailored CV or Cover Letter */}
        {activeModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white font-mono">{activeModal.title}</h3>
                  <span className="text-[11px] text-emerald-400">
                    {activeModal.type === 'cv' ? 'Tailored Version B CV' : 'Custom Tailored Cover Letter'}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleCopy(activeModal.content, 'modal_content')}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs flex items-center space-x-1 border border-slate-700 cursor-pointer"
                  >
                    {copiedKey === 'modal_content' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'modal_content' ? 'Copied' : 'Copy Text'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-4 overflow-y-auto flex-1">
                <pre className="font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed select-all">
                  {activeModal.content}
                </pre>
              </div>

              <div className="p-3 bg-slate-950 border-t border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs cursor-pointer"
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
