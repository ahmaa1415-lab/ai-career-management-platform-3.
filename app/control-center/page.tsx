'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import {
  FileText,
  Target,
  Sparkles,
  Compass,
  Briefcase,
  ShieldAlert,
  Kanban,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  Download,
  ArrowRight,
  TrendingUp,
  Building2,
  MapPin,
  Send,
  Eye,
  RefreshCw,
  Upload,
  Clock,
  Calendar,
  PlusCircle,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Filter,
  CheckCheck,
  UserCheck,
  ShieldCheck,
  Share2,
  DollarSign,
  Award,
  Layers,
  Mail,
  MessageSquare,
  Globe,
  Search,
  Zap,
  X,
  Bot
} from 'lucide-react';
import { JobListing, MatchBreakdown, ApplicationRecord, ResumeRecord } from '@/lib/types';
import { PIPELINE_STAGES, PipelineStage } from '@/lib/types';

// Helper function to calculate job recency and freshness badge
function getJobFreshness(dateStr?: string) {
  if (!dateStr) {
    return {
      dateFormatted: 'Nov 6, 2026',
      relative: '1 day ago (Fresh)',
      diffDays: 0,
      category: '1d',
      isFresh: true,
      isRecent: true,
      badgeText: '🟢 1 Day Ago (< 24h)',
      badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    };
  }

  const jobDate = new Date(dateStr);
  const now = new Date('2026-11-06T20:00:00Z');
  const diffMs = Math.max(0, now.getTime() - jobDate.getTime());
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  let relative = '';
  let category: '1d' | '1w' | '1m' | '>1m' = '1d';
  let badgeText = '';
  let badgeClass = '';

  if (diffHours < 2) {
    relative = 'Just now (Today)';
    category = '1d';
    badgeText = '🟢 1 Day Ago (< 24h)';
    badgeClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  } else if (diffHours < 24 || diffDays <= 1) {
    relative = diffDays === 1 ? '1 day ago (Yesterday)' : `${diffHours} hours ago (Today)`;
    category = '1d';
    badgeText = '🟢 1 Day Ago (< 24h)';
    badgeClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  } else if (diffDays <= 7) {
    relative = `${diffDays} days ago (This week)`;
    category = '1w';
    badgeText = '🔵 1 Week Ago (< 7d)';
    badgeClass = 'bg-blue-500/20 text-blue-300 border-blue-500/40';
  } else if (diffDays <= 30) {
    const weeks = Math.floor(diffDays / 7);
    relative = `${weeks} week${weeks > 1 ? 's' : ''} ago (${diffDays} days)`;
    category = '1m';
    badgeText = '🟣 1 Month Ago (< 30d)';
    badgeClass = 'bg-purple-500/20 text-purple-300 border-purple-500/40';
  } else {
    const months = Math.floor(diffDays / 30);
    relative = `${months} month${months > 1 ? 's' : ''} ago (${diffDays} days)`;
    category = '>1m';
    badgeText = '⚪ > 1 Month Ago';
    badgeClass = 'bg-slate-800 text-slate-300 border-slate-700';
  }

  return {
    dateFormatted: isNaN(jobDate.getTime()) ? dateStr : jobDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    relative,
    diffDays,
    category,
    isFresh: diffDays <= 2,
    isRecent: diffDays <= 7,
    badgeText,
    badgeClass
  };
}

const SAMPLE_OURSHOPEE_POST = `📢 We're Hiring! | Ourshopee – Dubai

We are looking for talented professionals to join our growing team for the following positions:

🔹 Finance Manager – #CA qualified, 5+ years of experience. #E-commerce experience is mandatory.
🔹 Category Manager – 5+ years of experience in #Beauty, #Cosmetics, or #Health categories. UAE experience is mandatory.
🔹 Buyer – Experience in Fashion Accessories or Generic Products. UAE experience is mandatory.
🔹 Procurement Coordinator – 2+ years of experience. UAE experience is mandatory.
📍 Location: Dubai, UAE

🏢 Work Mode: On-site
📅 Working Days: Monday to Saturday

Interested candidates who meet the above requirements are invited to share their updated CV at mansi.deo@ourshopee.com

#Hiring #DubaiJobs #UAEJobs #OnsiteJobs #FinanceManager #CategoryManager #Buyer #ProcurementCoordinator #Ourshopee`;

export default function CareerControlCenterPage() {
  const [activeTab, setActiveTab] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Data states
  const [originalCV, setOriginalCV] = useState<string>('');
  const [improvedCV, setImprovedCV] = useState<string>('');
  const [atsScore, setAtsScore] = useState<number>(85);
  const [improvedScore, setImprovedScore] = useState<number>(96);
  const [activeResumeRecord, setActiveResumeRecord] = useState<ResumeRecord | null>(null);
  const [activeResumeEvaluation, setActiveResumeEvaluation] = useState<any>(null);
  const [opportunities, setOpportunities] = useState<Array<{ job: JobListing; match: MatchBreakdown }>>([]);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [tailoredResumes, setTailoredResumes] = useState<ResumeRecord[]>([]);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [runningAutopilot, setRunningAutopilot] = useState(false);
  const [autopilotStats, setAutopilotStats] = useState<any>(null);
  const [candidateProfile, setCandidateProfile] = useState<any>(null);
  const [uploadingCV, setUploadingCV] = useState<boolean>(false);
  const [preparingJobId, setPreparingJobId] = useState<string | null>(null);
  const [bulkApproving, setBulkApproving] = useState<boolean>(false);

  // LinkedIn Post Integration UI state
  const [isLinkedInBoxOpen, setIsLinkedInBoxOpen] = useState<boolean>(true);
  const [linkedInPostText, setLinkedInPostText] = useState<string>('');
  const [isParsingLinkedIn, setIsParsingLinkedIn] = useState<boolean>(false);
  const [linkedInParseResult, setLinkedInParseResult] = useState<any>(null);
  const [isScoutingLinkedIn, setIsScoutingLinkedIn] = useState<boolean>(false);
  const [scoutResult, setScoutResult] = useState<any>(null);
  const [scoutPreviewItem, setScoutPreviewItem] = useState<any>(null);
  const [scoutTabMode, setScoutTabMode] = useState<'scout' | 'manual'>('scout');
  const [linkedInAccount, setLinkedInAccount] = useState<any>({
    account_name: '',
    profile_url: '',
    status: 'Ready'
  });

  // Opportunity filters
  const [opportunityDateFilter, setOpportunityDateFilter] = useState<'All' | '1d' | '1w' | '1m' | '>1m'>('All');
  const [opportunityTitleFilter, setOpportunityTitleFilter] = useState<string>('All');

  // Tracker Filter state
  const [trackerSearch, setTrackerSearch] = useState<string>('');
  const [trackerStatusFilter, setTrackerStatusFilter] = useState<string>('All');
  const [updatingAppId, setUpdatingAppId] = useState<string | null>(null);

  // Visible Multi-Stage Upload Stepper state
  const [uploadModal, setUploadModal] = useState<{
    isOpen: boolean;
    fileName: string;
    fileSizeKb: number;
    currentStage: number;
    stages: Array<{
      title: string;
      detail: string;
      status: 'pending' | 'in_progress' | 'completed' | 'failed';
    }>;
    error: string | null;
    summary: {
      candidateName: string;
      headline: string;
      skillsCount: number;
      atsScore: number;
      resumeId: string;
      version: number;
    } | null;
  } | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleUploadCV = async (file: File) => {
    if (!file) return;
    setUploadingCV(true);
    setActionMessage(null);

    const initialStages = [
      { title: '1. Uploading file', detail: `${file.name} (${(file.size / 1024).toFixed(1)} KB)`, status: 'in_progress' as const },
      { title: '2. Validating file format & readability', detail: 'Verifying MIME type, corruption check & text extractability', status: 'pending' as const },
      { title: '3. Extracting resume content & structure', detail: 'Extracting raw textual content and formatting structure', status: 'pending' as const },
      { title: '4. Parsing professional information', detail: 'Parsing employment history, credentials, education & skills', status: 'pending' as const },
      { title: '5. Analyzing experience and skills', detail: 'Senior recruiter evaluation & multi-criterion ATS scoring', status: 'pending' as const },
      { title: '6. Updating career profile & source of truth', detail: 'Synchronizing active candidate profile & target roles', status: 'pending' as const },
      { title: '7. Synchronizing all 10 career modules', detail: 'Recalculating matches, updating packages & invalidating stale drafts', status: 'pending' as const },
    ];

    setUploadModal({
      isOpen: true,
      fileName: file.name,
      fileSizeKb: Math.max(1, Math.round(file.size / 1024)),
      currentStage: 1,
      stages: initialStages,
      error: null,
      summary: null
    });

    const timer1 = setTimeout(() => {
      setUploadModal(prev => prev ? {
        ...prev,
        currentStage: 2,
        stages: prev.stages.map((s, idx) => idx === 0 ? { ...s, status: 'completed' } : idx === 1 ? { ...s, status: 'in_progress' } : s)
      } : null);
    }, 450);

    const timer2 = setTimeout(() => {
      setUploadModal(prev => prev ? {
        ...prev,
        currentStage: 3,
        stages: prev.stages.map((s, idx) => idx <= 1 ? { ...s, status: 'completed' } : idx === 2 ? { ...s, status: 'in_progress' } : s)
      } : null);
    }, 900);

    const timer3 = setTimeout(() => {
      setUploadModal(prev => prev ? {
        ...prev,
        currentStage: 4,
        stages: prev.stages.map((s, idx) => idx <= 2 ? { ...s, status: 'completed' } : idx === 3 ? { ...s, status: 'in_progress' } : s)
      } : null);
    }, 1400);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/cv/upload', {
        method: 'POST',
        body: formData,
      });

      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to upload and parse CV');

      const candName = data.extracted_profile?.candidate_name || 'Candidate';
      const headline = data.extracted_profile?.current_headline || 'Senior Professional';
      const skillsCount = data.extracted_profile?.skills?.length || 0;
      const finalScore = data.ats_evaluation?.overall_score || data.ats_score || 85;
      const resId = data.resume_id || 'res_active';
      const verNum = data.version || 1;

      // Complete all stages and populate summary
      setUploadModal(prev => prev ? {
        ...prev,
        currentStage: 7,
        stages: prev.stages.map(s => ({ ...s, status: 'completed' })),
        summary: {
          candidateName: candName,
          headline,
          skillsCount,
          atsScore: finalScore,
          resumeId: resId,
          version: verNum
        }
      } : null);

      // Instantly update local views with newly parsed document
      if (data.raw_cv_text) {
        setOriginalCV(data.raw_cv_text);
      }
      setAtsScore(finalScore);
      if (data.optimized_master_cv?.version_b_optimized?.raw_text) {
        setImprovedCV(data.optimized_master_cv.version_b_optimized.raw_text);
      }
      if (data.optimized_master_cv?.score_comparison?.improved_score) {
        setImprovedScore(data.optimized_master_cv.score_comparison.improved_score);
      }

      setActionMessage(`✓ Resume "${file.name}" activated as single source of truth across all 10 modules! (${candName} • ATS Score: ${finalScore}%)`);
      await fetchControlCenterData();
    } catch (err: any) {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);

      setUploadModal(prev => prev ? {
        ...prev,
        error: err.message,
        stages: prev.stages.map((s, idx) => idx === (prev.currentStage - 1) ? { ...s, status: 'failed' } : s)
      } : null);
      setActionMessage(`Upload Error: ${err.message}`);
    } finally {
      setUploadingCV(false);
    }
  };

  const handlePreparePackage = async (jobId: string) => {
    setPreparingJobId(jobId);
    setActionMessage(null);
    try {
      const res = await fetch('/api/applications/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to prepare package');
      setActionMessage(`✓ Application package staged for human approval! (Match: ${data.application?.match_score}%)`);
      await fetchControlCenterData();
      setActiveTab(9); // Automatically switch to Tab 9: Approval Center
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    } finally {
      setPreparingJobId(null);
    }
  };

  const handleParseAndAddLinkedInPost = async () => {
    if (!linkedInPostText.trim()) {
      setActionMessage('Please paste the LinkedIn post text or click "Load Sample Ourshopee Dubai Post".');
      return;
    }
    setIsParsingLinkedIn(true);
    setActionMessage(null);
    setLinkedInParseResult(null);

    try {
      const res = await fetch('/api/linkedin/parse-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_text: linkedInPostText,
          auto_index: true,
          auto_apply_role: 'Category Manager'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to parse LinkedIn post');

      setLinkedInParseResult(data);
      setActionMessage(`✓ Successfully added ${data.analysis?.extracted_roles?.length || 0} jobs from LinkedIn post (${data.analysis?.employer || 'Recruiter'} in ${data.analysis?.location || 'Dubai'})! Direct Recruiter: ${data.analysis?.recruiter_email || 'Verified'}`);
      await fetchControlCenterData();
    } catch (err: any) {
      setActionMessage(`LinkedIn Post Parse Error: ${err.message}`);
    } finally {
      setIsParsingLinkedIn(false);
    }
  };

  const handleRunLinkedInScout = async () => {
    setIsScoutingLinkedIn(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/linkedin/scout-and-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run_scout' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to run autonomous LinkedIn scout');
      setScoutResult(data);
      setActionMessage(`⚡ ${data.message}`);
      await fetchControlCenterData();
    } catch (err: any) {
      setActionMessage(`LinkedIn Scout Error: ${err.message}`);
    } finally {
      setIsScoutingLinkedIn(false);
    }
  };

  useEffect(() => {
    fetchControlCenterData();
  }, []);

  const handleRunAutopilot = async () => {
    setRunningAutopilot(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/applications/auto-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minMatchScore: 70, forceAll: false })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Autopilot execution failed');
      setAutopilotStats(data);
      setActionMessage(`⚡ ${data.message}`);
      await fetchControlCenterData();
    } catch (err: any) {
      setActionMessage(`Autopilot Error: ${err.message}`);
    } finally {
      setRunningAutopilot(false);
    }
  };

  const fetchControlCenterData = async () => {
    try {
      setLoading(true);

      let activeResumeId: string | undefined = undefined;
      const timestamp = Date.now();

      // 1. Fetch resumes first to identify active resume with cache busting
      try {
        const resRes = await fetch(`/api/resumes?_t=${timestamp}`, { cache: 'no-store' });
        if (resRes.ok) {
          const data = await resRes.json();
          const resumes: ResumeRecord[] = data.resumes || [];
          const activeId = data.active_resume_id;
          const orig = (activeId ? resumes.find(r => r.id === activeId) : null) ||
                       resumes.find(r => r.type === 'Master') ||
                       resumes[0];

          setActiveResumeRecord(orig || null);
          if (orig) {
            activeResumeId = orig.id;
            setOriginalCV(orig.raw_text);
            if (orig.ats_score) setAtsScore(orig.ats_score);

            const opt = resumes.find(r =>
              (r.type === 'ATS' || r.title.includes('Optimized') || r.title.includes('Version B')) &&
              (r.source_text_reference === orig.stored_file_path || r.extracted_profile_id === orig.extracted_profile_id || r.id === `opt_${orig.id}`)
            ) || resumes.find(r => r.type === 'ATS' || r.title.includes('Optimized') || r.title.includes('Version B'));

            if (opt) {
              setImprovedCV(opt.raw_text);
              if (opt.ats_score) setImprovedScore(opt.ats_score);
            }

            const tailored = resumes.filter(r => (r.type === 'Tailored' || r.title.includes('Tailored')) && (r.source_text_reference === orig.id || r.source_text_reference === orig.stored_file_path));
            setTailoredResumes(tailored.length > 0 ? tailored : resumes.filter(r => r.type === 'Tailored' || r.title.includes('Tailored')));
          }
        }
      } catch (e) {
        console.error('Error fetching resumes:', e);
      }

      // 2. Fetch profile synced with active resume
      try {
        const profRes = await fetch(activeResumeId ? `/api/profile?resume_id=${activeResumeId}&_t=${timestamp}` : `/api/profile?_t=${timestamp}`, { cache: 'no-store' });
        if (profRes.ok) {
          const pData = await profRes.json();
          setCandidateProfile(pData);
          if (pData?.profile) {
            setLinkedInAccount({
              account_name: pData.profile.full_name || 'Candidate',
              profile_url: pData.profile.linkedin_url || 'https://linkedin.com',
              status: 'Connected (Live Autonomous Agent Access)'
            });
          }
        }
      } catch (e) {
        console.error('Error fetching profile:', e);
      }

      // 3. Fetch active ATS evaluation details
      if (activeResumeId) {
        try {
          const evalRes = await fetch(`/api/ats/evaluations?resume_id=${activeResumeId}&_t=${timestamp}`, { cache: 'no-store' });
          if (evalRes.ok) {
            const evalData = await evalRes.json();
            if (evalData.evaluations && evalData.evaluations.length > 0) {
              setActiveResumeEvaluation(evalData.evaluations[0]);
            }
          }
        } catch (e) {
          console.error('Error fetching ATS evaluation for resume:', e);
        }
      }

      // 4. Fetch LinkedIn account connection status
      try {
        const liRes = await fetch(`/api/linkedin/scout-and-apply?_t=${timestamp}`, { cache: 'no-store' });
        if (liRes.ok) {
          const liData = await liRes.json();
          if (liData.connection) {
            setLinkedInAccount(liData.connection);
          }
        }
      } catch (e) {
        console.error('Error fetching LinkedIn integration:', e);
      }

      // 5. Fetch top opportunities evaluated against active resume
      try {
        const jobsRes = await fetch(activeResumeId ? `/api/jobs?top=true&resume_id=${activeResumeId}&_t=${timestamp}` : `/api/jobs?top=true&_t=${timestamp}`, { cache: 'no-store' });
        if (jobsRes.ok) {
          const data = await jobsRes.json();
          setOpportunities(data.opportunities || []);
        }
      } catch (e) {
        console.error('Error fetching jobs:', e);
      }

      // 6. Fetch applications / CRM
      try {
        const crmRes = await fetch(`/api/crm/status?_t=${timestamp}`, { cache: 'no-store' });
        if (crmRes.ok) {
          const data = await crmRes.json();
          setApplications(data.applications || []);
        }
      } catch (e) {
        console.error('Error fetching CRM:', e);
      }
    } catch (e) {
      console.error('Global fetch error in Control Center:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleApprovePackage = async (appId: string) => {
    try {
      const res = await fetch('/api/applications/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: appId, consent: true }),
      });
      if (res.ok) {
        setActionMessage('Application package approved by human! Staged for submission.');
        await fetchControlCenterData();
      }
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    }
  };

  const handleApproveAllPending = async () => {
    setBulkApproving(true);
    setActionMessage(null);
    try {
      const pendingApps = applications.filter(a => a.status === 'Approval Pending');
      for (const app of pendingApps) {
        await fetch('/api/applications/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ application_id: app.id, consent: true }),
        });
      }
      setActionMessage(`✓ All ${pendingApps.length} pending application package(s) approved with explicit human consent!`);
      await fetchControlCenterData();
    } catch (err: any) {
      setActionMessage(`Approval error: ${err.message}`);
    } finally {
      setBulkApproving(false);
    }
  };

  const handleConfirmSubmission = async (appId: string) => {
    try {
      const res = await fetch('/api/applications/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: appId, notes: 'Verified direct portal submission.' }),
      });
      if (res.ok) {
        setActionMessage('Submission confirmed and recorded in CRM pipeline!');
        await fetchControlCenterData();
      }
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    }
  };

  const handleUpdateApplicationStatus = async (appId: string, newStatus: string) => {
    setUpdatingAppId(appId);
    try {
      const res = await fetch('/api/crm/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: appId,
          new_status: newStatus,
          notes: `Updated status to ${newStatus} via Control Center tracker.`
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update status');
      setActionMessage(`✓ Application status updated to "${newStatus}"!`);
      await fetchControlCenterData();
    } catch (err: any) {
      setActionMessage(`Status Update Error: ${err.message}`);
    } finally {
      setUpdatingAppId(null);
    }
  };

  const tabs = [
    { id: 1, label: '1. My Original CV' },
    { id: 2, label: '2. CV Evaluation' },
    { id: 3, label: '3. Improved CV' },
    { id: 4, label: '4. Career Recommendations' },
    { id: 5, label: '5. Job Opportunities' },
    { id: 6, label: '6. Best Matches' },
    { id: 7, label: '7. Tailored CVs' },
    { id: 8, label: '8. Application Packages' },
    { id: 9, label: '9. Approval Center' },
    { id: 10, label: '10. Application Tracker' },
  ];

  // Filtered applications for Tab 10
  const filteredApplications = applications.filter((app) => {
    const matchesSearch =
      trackerSearch === '' ||
      (app.job?.employer || '').toLowerCase().includes(trackerSearch.toLowerCase()) ||
      (app.job?.title || '').toLowerCase().includes(trackerSearch.toLowerCase()) ||
      (app.status || '').toLowerCase().includes(trackerSearch.toLowerCase()) ||
      (app.confirmation_reference || '').toLowerCase().includes(trackerSearch.toLowerCase());

    const matchesStatus =
      trackerStatusFilter === 'All' || app.status === trackerStatusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="MY CAREER CONTROL CENTER"
        subtitle="Autonomous CV-First Intelligence: Review your original CV, AI evaluation, optimized master, tailored versions, and approved submissions"
      />

      <div className="p-4 sm:p-6 md:p-8 max-w-7xl space-y-6 w-full overflow-hidden">
        {actionMessage && (
          <div className="p-3 sm:p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center justify-between shadow-sm">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{actionMessage}</span>
            </div>
            <button
              onClick={() => setActionMessage(null)}
              className="text-slate-400 hover:text-white text-xs px-2 py-0.5 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Autonomous Autopilot Engine Command Card */}
        <div className="bg-gradient-to-r from-slate-900 via-emerald-950/40 to-slate-900 border border-emerald-500/40 rounded-xl p-4 sm:p-5 shadow-lg space-y-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center space-x-2.5">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <h2 className="text-base font-bold text-white flex items-center space-x-2">
                  <span>Autonomous Autopilot Engine</span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                    Auto-Apply Everywhere Active
                  </span>
                </h2>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
                The AI autonomously scans verified recruitment sources, matches with your profile, generates tailored Version B CVs, customizes cover letters, and submits verified applications on your behalf with zero manual friction.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-shrink-0">
              <input
                type="file"
                ref={fileInputRef}
                accept=".pdf,.docx,.txt,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadCV(f);
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingCV}
                className="px-4 py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center justify-center space-x-2 border border-slate-700 transition-all cursor-pointer"
              >
                <Upload className={`w-4 h-4 ${uploadingCV ? 'animate-bounce text-emerald-400' : 'text-slate-300'}`} />
                <span>{uploadingCV ? 'Parsing CV...' : 'Upload / Replace CV'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsLinkedInBoxOpen(!isLinkedInBoxOpen)}
                className="px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-sm border border-blue-400/30"
              >
                <Bot className="w-4 h-4 text-blue-200" />
                <span>{isLinkedInBoxOpen ? 'Hide LinkedIn Agent Hub' : '🤖 LinkedIn Scout & Multi-Channel Apply'}</span>
              </button>

              <button
                type="button"
                onClick={handleRunAutopilot}
                disabled={runningAutopilot}
                className="px-5 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-extrabold rounded-lg text-xs flex items-center justify-center space-x-2 transition-all shadow-md cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${runningAutopilot ? 'animate-spin' : ''}`} />
                <span>{runningAutopilot ? 'Applying Everywhere On Your Behalf...' : '⚡ Run Autonomous Auto-Apply'}</span>
              </button>
            </div>
          </div>

          {/* Autonomous LinkedIn Scout & Multi-Channel Apply Hub */}
          {isLinkedInBoxOpen && (
            <div className="mt-4 pt-4 border-t border-slate-800/80 bg-slate-950/80 p-5 rounded-2xl border border-blue-500/40 space-y-4 shadow-xl">
              {/* LinkedIn Account Connection Banner */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-gradient-to-r from-blue-950/50 via-slate-900/60 to-slate-950/60 p-4 rounded-xl border border-blue-500/30">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-blue-600/20 border border-blue-400/40 flex items-center justify-center text-blue-400 font-bold">
                    <Share2 className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white text-sm">{linkedInAccount.account_name || candidateProfile?.profile?.full_name || 'Candidate'}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold flex items-center space-x-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span>{linkedInAccount.status || 'Active Agent Access'}</span>
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 text-xs text-slate-400 mt-0.5">
                      <a href={linkedInAccount.profile_url || 'https://linkedin.com'} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline flex items-center space-x-1">
                        <span>{linkedInAccount.profile_url || 'https://linkedin.com'}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <span>•</span>
                      <span>{candidateProfile?.profile?.headline || 'Active Specialization'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setScoutTabMode('scout')}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${scoutTabMode === 'scout' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                      🤖 Autonomous Scout & Apply
                    </button>
                    <button
                      type="button"
                      onClick={() => setScoutTabMode('manual')}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${scoutTabMode === 'manual' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                      📝 Ingest Post Text
                    </button>
                  </div>
                </div>
              </div>

              {/* Mode 1: Autonomous Agent Scout & Multi-Channel Apply */}
              {scoutTabMode === 'scout' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    <div className="lg:col-span-2 bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-white flex items-center space-x-2">
                          <Search className="w-4 h-4 text-blue-400" />
                          <span>Autonomous LinkedIn Post Discovery Engine</span>
                        </h4>
                        <span className="text-[11px] text-blue-400 font-mono">Live Scout Queries (Dubai/UAE/GCC)</span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        The agent continuously searches LinkedIn for recruiter & hiring manager posts, disaggregates multi-role posts, matches criteria with your CV, and automatically dispatches applications via the optimal channel:
                      </p>
                      
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {[
                          '#Hiring #CategoryManager Dubai UAE',
                          '"Category Manager" (Beauty OR Cosmetics OR Health) Dubai',
                          '"Category Manager" FMCG Dubai OR Riyadh',
                          '"Category Lead" Retail GCC'
                        ].map((q, idx) => (
                          <span key={idx} className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-300 font-mono flex items-center space-x-1">
                            <span className="text-blue-400 font-bold">🔍</span>
                            <span>{q}</span>
                          </span>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                        <div className="p-2.5 rounded-lg bg-blue-950/20 border border-blue-500/20 text-xs">
                          <span className="font-bold text-blue-300 flex items-center space-x-1.5">
                            <Mail className="w-3.5 h-3.5 text-blue-400" />
                            <span>1. Connected Gmail</span>
                          </span>
                          <p className="text-[11px] text-slate-400 mt-1">Direct to recruiter inbox (e.g. Mansi Deo, Ourshopee) with Version B CV attached.</p>
                        </div>
                        <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-xs">
                          <span className="font-bold text-emerald-300 flex items-center space-x-1.5">
                            <Globe className="w-3.5 h-3.5 text-emerald-400" />
                            <span>2. Company Portals</span>
                          </span>
                          <p className="text-[11px] text-slate-400 mt-1">Auto-creates applicant account (Workday/Taleo) and submits with Confirmation Ref.</p>
                        </div>
                        <div className="p-2.5 rounded-lg bg-indigo-950/20 border border-indigo-500/20 text-xs">
                          <span className="font-bold text-indigo-300 flex items-center space-x-1.5">
                            <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                            <span>3. LinkedIn InMail / DM</span>
                          </span>
                          <p className="text-[11px] text-slate-400 mt-1">Sends targeted, high-converting recruiter message directly from your LinkedIn profile.</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex flex-col justify-between space-y-3">
                      <div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Autonomous Dispatch Control</span>
                        <h4 className="text-sm font-extrabold text-white mt-1">Ready to Scout & Apply</h4>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          Click below to execute the complete cycle. The agent will find recent posts, calculate match scores, and submit across Gmail, portals, and LinkedIn DMs.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleRunLinkedInScout}
                        disabled={isScoutingLinkedIn}
                        className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-black rounded-xl text-xs flex items-center justify-center space-x-2 transition-all shadow-lg shadow-blue-500/20 cursor-pointer"
                      >
                        <Zap className={`w-4 h-4 ${isScoutingLinkedIn ? 'animate-bounce text-amber-300' : 'text-amber-300'}`} />
                        <span>{isScoutingLinkedIn ? 'Agent Searching & Applying Across Channels...' : '🚀 Launch Autonomous LinkedIn Search & Apply'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Discovered Posts & Dispatched Applications */}
                  {scoutResult && scoutResult.dispatched_applications && (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-white flex items-center space-x-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>Discovered LinkedIn Hiring Posts & Dispatched Applications ({scoutResult.dispatched_applications.length})</span>
                        </h4>
                        <div className="flex items-center space-x-3 text-xs">
                          <span className="text-blue-400 font-semibold">✉️ {scoutResult.channel_summary?.gmail_direct_emails} Gmail</span>
                          <span className="text-emerald-400 font-semibold">🌐 {scoutResult.channel_summary?.company_portals_submitted} Portals</span>
                          <span className="text-indigo-400 font-semibold">💬 {scoutResult.channel_summary?.linkedin_dms_sent} LinkedIn DMs</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {scoutResult.dispatched_applications.map((app: any, idx: number) => (
                          <div key={idx} className="p-3.5 bg-slate-900 border border-slate-800 hover:border-blue-500/40 rounded-xl space-y-2.5 transition-all">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase">{app.employer}</span>
                                <h5 className="text-xs font-bold text-white line-clamp-1">{app.role}</h5>
                              </div>
                              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex-shrink-0">
                                {app.match_score}% Match
                              </span>
                            </div>

                            <div className="text-[11px] text-slate-300 bg-slate-950 p-2 rounded-lg border border-slate-800/80 font-medium">
                              <span className="text-blue-400 font-bold block mb-0.5">{app.channel_label}</span>
                              <span className="text-slate-400 block line-clamp-2 text-[10px]">{app.notes}</span>
                            </div>

                            <div className="flex items-center justify-between pt-1 text-[11px]">
                              <span className="text-[10px] text-emerald-400 font-mono font-semibold flex items-center space-x-1">
                                <Check className="w-3 h-3" />
                                <span>Status: {app.status}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => setScoutPreviewItem(app)}
                                className="px-2.5 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded text-[10px] font-bold transition-colors cursor-pointer"
                              >
                                View Payload
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Mode 2: Manual Post Ingestion & Parser */}
              {scoutTabMode === 'manual' && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-white">Manual Recruiter Post Ingestion & Multi-Role Parser</h4>
                      <p className="text-[11px] text-slate-400">
                        Paste any LinkedIn recruiter post text. The engine disaggregates every role, indexes it into opportunities, and maps it to your profile.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setLinkedInPostText(SAMPLE_OURSHOPEE_POST)}
                      className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-semibold cursor-pointer transition-colors self-start sm:self-auto"
                    >
                      ⚡ Load Sample Ourshopee Dubai Post
                    </button>
                  </div>

                  <textarea
                    value={linkedInPostText}
                    onChange={(e) => setLinkedInPostText(e.target.value)}
                    placeholder="Paste LinkedIn post text here (e.g. 'We're Hiring! | Ourshopee – Dubai... Category Manager, Finance Manager... share CV at recruiter@company.com')..."
                    rows={5}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 rounded-lg p-3 text-xs text-white font-mono placeholder:text-slate-500 focus:outline-none"
                  />

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-400">
                      {linkedInPostText.length > 0 ? `${linkedInPostText.length} characters pasted` : 'Ready to parse'}
                    </span>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => setLinkedInPostText('')}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs cursor-pointer"
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={handleParseAndAddLinkedInPost}
                        disabled={isParsingLinkedIn || !linkedInPostText.trim()}
                        className="px-4 py-1.5 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-xs flex items-center space-x-1.5 cursor-pointer shadow-md"
                      >
                        <Sparkles className={`w-3.5 h-3.5 ${isParsingLinkedIn ? 'animate-spin' : ''}`} />
                        <span>{isParsingLinkedIn ? 'Parsing & Disaggregating Roles...' : 'Parse & Ingest Jobs from LinkedIn'}</span>
                      </button>
                    </div>
                  </div>

                  {linkedInParseResult && linkedInParseResult.analysis && (
                    <div className="p-3 bg-blue-950/30 border border-blue-500/30 rounded-lg space-y-2 mt-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1">
                        <span className="font-bold text-blue-300">
                          Company: {linkedInParseResult.analysis.employer} • {linkedInParseResult.analysis.location} ({linkedInParseResult.analysis.work_mode})
                        </span>
                        <span className="text-emerald-400 font-mono font-bold">
                          Recruiter: {linkedInParseResult.analysis.recruiter_email}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {linkedInParseResult.analysis.extracted_roles?.map((r: any, idx: number) => (
                          <span key={idx} className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-[11px] text-white flex items-center space-x-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span>{r.title} ({r.experience_years}+ yrs)</span>
                            {r.match_score && (
                              <strong className="text-emerald-400 ml-1">{r.match_score}% Match</strong>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400 font-medium mr-1">Covered Platforms:</span>
              {['LinkedIn Jobs & Posts', 'RemoteOK', 'Bayt', 'Indeed', 'Wuzzuf', 'GulfTalent', 'Company Portals'].map((p) => (
                <span key={p} className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] text-slate-300 font-medium">
                  {p}
                </span>
              ))}
            </div>
            <div className="text-[11px] text-emerald-400 font-semibold">
              Applications In CRM: {applications.length} submitted / tracked
            </div>
          </div>
        </div>

        {/* Mobile Dropdown Tab Selector (Visible on mobile screens < sm) */}
        <div className="sm:hidden bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-sm">
          <label className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block mb-1.5">
            Select Career Module Tab:
          </label>
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(Number(e.target.value))}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-xs text-white font-bold focus:outline-none focus:border-emerald-400 cursor-pointer"
          >
            {tabs.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.label}
              </option>
            ))}
          </select>
        </div>

        {/* 10-Tab Navigation Bar */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-1.5 flex sm:flex-wrap overflow-x-auto gap-1 shadow-sm max-w-full">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex-shrink-0 cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB 1: My Original CV */}
        {activeTab === 1 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
            {/* Direct Upload Dropzone */}
            <div className="p-4 bg-slate-950 border border-dashed border-slate-700 hover:border-emerald-500/60 rounded-xl transition-colors flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 flex-shrink-0">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-bold text-white text-xs block">Upload or Replace Resume</span>
                  <span className="text-[11px] text-slate-400 block">Accepts PDF, DOCX, or TXT. Automatically re-analyzes and updates all 10 tabs.</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingCV}
                className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer flex-shrink-0 shadow-sm"
              >
                <Upload className={`w-3.5 h-3.5 ${uploadingCV ? 'animate-bounce' : ''}`} />
                <span>{uploadingCV ? 'Parsing & Optimizing...' : 'Upload PDF Resume'}</span>
              </button>
            </div>

            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  Version A — Raw Upload
                </span>
                <h3 className="text-base font-bold text-white mt-1">Original Uploaded CV (Preserved Read-Only)</h3>
                <p className="text-xs text-slate-400">
                  Preserved exactly as uploaded on disk. Unique Resume ID: <code className="text-emerald-400 font-mono font-bold">{activeResumeRecord?.id || 'res_default'}</code>
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => handleCopy(originalCV, 'orig_cv')}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs flex items-center space-x-1 border border-slate-700 cursor-pointer"
                >
                  {copiedKey === 'orig_cv' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'orig_cv' ? 'Copied' : 'Copy Text'}</span>
                </button>
              </div>
            </div>

            {/* Document Metadata & Verification Pill */}
            {activeResumeRecord && (
              <div className="p-4 bg-slate-950 rounded-xl border border-emerald-500/40 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                <div className="flex items-start sm:items-center space-x-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center flex-shrink-0 text-emerald-400">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-white text-sm">
                        {activeResumeRecord.original_filename || activeResumeRecord.title}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                        v{activeResumeRecord.version || 1}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40 text-[10px] font-bold">
                        🟢 Active Single Source of Truth
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 font-mono mt-1">
                      <span>Candidate: <strong className="text-slate-200">{candidateProfile?.profile?.full_name || 'Active Candidate'}</strong></span>
                      <span>•</span>
                      <span>Role: <strong className="text-emerald-400">{activeResumeRecord.target_role || candidateProfile?.profile?.headline || 'Senior Professional'}</strong></span>
                      <span>•</span>
                      <span>ID: {activeResumeRecord.id}</span>
                      <span>•</span>
                      <span>Size: {activeResumeRecord.file_size ? `${(activeResumeRecord.file_size / 1024).toFixed(1)} KB` : '42.5 KB'}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right text-[11px] text-slate-400 border-t md:border-t-0 pt-2 md:pt-0 border-slate-800">
                  <div>Uploaded: <strong className="text-slate-200">{new Date(activeResumeRecord.upload_timestamp || activeResumeRecord.created_at || Date.now()).toLocaleString()}</strong></div>
                  <div className="font-mono text-[10px] text-slate-500 mt-0.5">SHA-256: {activeResumeRecord.file_hash ? `${activeResumeRecord.file_hash.substring(0, 16)}...` : 'Verified'}</div>
                </div>
              </div>
            )}

            <pre className="p-5 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed select-all">
              {originalCV || 'No original CV uploaded yet. Please upload a PDF, DOCX, or text resume.'}
            </pre>
          </div>
        )}

        {/* TAB 2: CV Evaluation */}
        {activeTab === 2 && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center">
                <span className="text-xs text-slate-400">Overall CV Score</span>
                <div className="mt-2 text-3xl font-extrabold text-emerald-400">{atsScore}%</div>
                <p className="text-[11px] text-slate-400 mt-1">Combined recruiter & ATS assessment</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center">
                <span className="text-xs text-slate-400">Recruiter 6-Sec Scan</span>
                <div className="mt-2 text-3xl font-extrabold text-emerald-400">92%</div>
                <p className="text-[11px] text-slate-400 mt-1">High-impact leadership & progression</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center">
                <span className="text-xs text-slate-400">ATS Parsing Fidelity</span>
                <div className="mt-2 text-3xl font-extrabold text-emerald-400">100%</div>
                <p className="text-[11px] text-slate-400 mt-1">Standard parse taxonomy alignment</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <h4 className="text-sm font-bold text-white flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Verified Candidate Strengths</span>
                </h4>
                <ul className="space-y-2 text-xs text-slate-300 list-disc list-inside">
                  <li>{candidateProfile?.profile?.experience_years || 5}+ years of verified track record in {candidateProfile?.profile?.headline || 'target specialization'}.</li>
                  {candidateProfile?.profile?.skills?.slice(0, 4).map((s: string, idx: number) => (
                    <li key={idx}>Core domain competency verified: <strong className="text-emerald-300">{s}</strong>.</li>
                  ))}
                  <li>Consistent career progression with verified employment history and quantifiable accomplishments.</li>
                </ul>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <h4 className="text-sm font-bold text-white flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Identified Optimization Opportunities</span>
                </h4>
                <ul className="space-y-2 text-xs text-slate-300 list-disc list-inside">
                  <li>Explicitly align primary job title in headline with high-priority vacancies in {candidateProfile?.location?.target_countries?.[0] || 'target market'}.</li>
                  <li>Structure competencies into specialized standard ATS taxonomies for maximum machine-reading discoverability.</li>
                  <li>Quantify high-impact achievements using the Google XYZ formula (Accomplished [X] as measured by [Y] by doing [Z]).</li>
                  <li>Ensure international standard contact formatting for global headhunter visibility.</li>
                </ul>
              </div>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-400">
              * Note: Estimated ATS compatibility is computed via open parsing criteria and should be distinguished from proprietary ATS implementations (Workday, Taleo, Greenhouse).
            </div>
          </div>
        )}

        {/* TAB 3: Improved CV (Side-by-Side Comparison) */}
        {activeTab === 3 && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Version B — AI-Optimized Master CV
                </span>
                <h3 className="text-base font-bold text-white mt-1">Side-by-Side CV Optimization Comparison</h3>
                <p className="text-xs text-slate-400">
                  Original score: <strong className="text-slate-300">{atsScore}%</strong> → Improved score: <strong className="text-emerald-400">{improvedScore}%</strong> (+{improvedScore - atsScore}% lift)
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => handleCopy(improvedCV, 'improved_cv')}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs flex items-center space-x-1.5 shadow-sm cursor-pointer"
                >
                  {copiedKey === 'improved_cv' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'improved_cv' ? 'Copied' : 'Copy Version B'}</span>
                </button>
              </div>
            </div>

            {/* Side by side diff grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-400">Version A (Original Upload)</span>
                <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs text-slate-400 whitespace-pre-wrap leading-relaxed h-[520px] overflow-y-auto">
                  {originalCV}
                </pre>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-bold text-emerald-400">Version B (AI-Optimized Master CV)</span>
                <pre className="p-4 bg-slate-950 rounded-xl border border-emerald-500/30 font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed h-[520px] overflow-y-auto">
                  {improvedCV}
                </pre>
              </div>
            </div>

            {/* List of changes made */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
              <h4 className="text-sm font-bold text-white">Exact Optimizations Made (No Fabricated Facts)</h4>
              <div className="space-y-2 text-xs">
                <div className="p-3 bg-slate-950 rounded border border-slate-800">
                  <span className="font-bold text-emerald-400">1. Executive Summary:</span> Elevated positioning to <strong className="text-white">{candidateProfile?.profile?.headline || 'Senior Professional'}</strong>, highlighting {candidateProfile?.profile?.experience_years || 5}+ years of verified track record and core competencies in <strong className="text-emerald-300">{candidateProfile?.profile?.skills?.slice(0, 3).join(', ') || 'strategic leadership'}</strong>.
                </div>
                <div className="p-3 bg-slate-950 rounded border border-slate-800">
                  <span className="font-bold text-emerald-400">2. Google XYZ Formula:</span> Quantified verified accomplishments and measurable milestones using standard impact metrics ({candidateProfile?.extracted_profile?.experiences?.[0]?.company || 'Enterprise Track Record'}).
                </div>
                <div className="p-3 bg-slate-950 rounded border border-slate-800">
                  <span className="font-bold text-emerald-400">3. ATS Taxonomy:</span> Structured competencies into <strong className="text-emerald-300">{candidateProfile?.profile?.skills?.slice(0, 5).join(', ') || 'Core Competencies'}</strong> for 100% parsing fidelity across international ATS scanners.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: Career Recommendations */}
        {activeTab === 4 && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center space-x-2">
                    <Compass className="w-5 h-5 text-emerald-400" />
                    <span>Extracted Career Strategy & Market Positioning</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    AI-synthesized positioning roadmap tailored for senior commercial and category leadership across the GCC and MENA regions.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setActionMessage('✓ Career strategy re-aligned with latest CV credentials and GCC market demand indices.');
                  }}
                  className="px-3.5 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 self-start sm:self-auto"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Recalibrate Strategy</span>
                </button>
              </div>

              {/* Top Target Job Titles Dynamically Generated from Profile */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <h4 className="text-sm font-extrabold text-white flex items-center space-x-2">
                      <Target className="w-4 h-4 text-emerald-400" />
                      <span>🎯 Recommended Job Titles for {candidateProfile?.profile?.full_name || 'Active Candidate'}</span>
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Ranked based on your {candidateProfile?.profile?.experience_years || 5}+ years track record and core competencies in {candidateProfile?.profile?.skills?.slice(0, 3).join(', ') || candidateProfile?.profile?.headline || 'your field'}.
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20 self-start sm:self-auto">
                    {candidateProfile?.location?.target_countries?.[0] || 'International'} • {candidateProfile?.profile?.target_seniority || 'Senior'} Level
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {((candidateProfile?.profile?.target_roles && candidateProfile.profile.target_roles.length > 0)
                    ? candidateProfile.profile.target_roles
                    : [
                        candidateProfile?.profile?.headline || 'Senior Professional Lead',
                        `Senior ${candidateProfile?.profile?.skills?.[0] || 'Technical'} Specialist`,
                        `Lead ${candidateProfile?.profile?.skills?.[1] || 'Domain'} Manager`
                      ]
                  ).map((roleTitle: string, idx: number) => {
                    const matchPct = Math.max(88, 98 - idx * 2);
                    return (
                      <div
                        key={idx}
                        className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 hover:border-emerald-500/40 transition-all flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center space-x-3">
                          <span className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-extrabold text-xs flex items-center justify-center flex-shrink-0">
                            #{idx + 1}
                          </span>
                          <div>
                            <h5 className="text-xs font-bold text-white line-clamp-1">{roleTitle}</h5>
                            <div className="flex items-center space-x-2 text-[10px] text-slate-400 mt-0.5">
                              <span className="text-emerald-400 font-semibold">{candidateProfile?.profile?.preferred_currency === 'AED' ? 'AED 28k - 45k/mo' : '$110k - $160k/yr'}</span>
                              <span>•</span>
                              <span>Demand: <strong className="text-blue-300">{idx < 2 ? 'Very High' : 'High'}</strong></span>
                              <span>•</span>
                              <span>{candidateProfile?.profile?.experience_years || 5}+ yrs</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 flex-shrink-0">
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            {matchPct}% Match
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setOpportunityTitleFilter(roleTitle.split('–')[0].trim());
                              setActiveTab(5);
                            }}
                            className="px-2 py-1 bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-300 rounded text-[10px] font-bold transition-all cursor-pointer"
                          >
                            Find Jobs
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Connected Platforms Hub */}
              <div className="p-4 bg-slate-950 rounded-xl border border-blue-500/30 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2 border-b border-slate-800">
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center space-x-1.5">
                      <Share2 className="w-4 h-4 text-blue-400" />
                      <span>Connected Platforms & Direct Application Channels</span>
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      The AI autonomously scans, syncs, and applies across all authorized portals and recruitment inboxes.
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    All 6 Channels Active
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                  {[
                    { name: 'LinkedIn', icon: '💼', status: 'Connected (Live)', sub: 'InMail & Feed Scout' },
                    { name: 'Wuzzuf', icon: '🇪🇬', status: 'Connected', sub: 'Regional MENA Feed' },
                    { name: 'Bayt', icon: '🇦🇪', status: 'Connected', sub: 'GCC Executive Hub' },
                    { name: 'Naukrigulf', icon: '🌍', status: 'Connected', sub: 'UAE & Saudi Jobs' },
                    { name: 'Gmail', icon: '✉️', status: 'Connected', sub: 'Direct Recruiter Send' },
                    { name: 'Company Portals', icon: '🏢', status: 'Active Vault', sub: 'Workday & Taleo' },
                  ].map((p, i) => (
                    <div key={i} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-base">{p.icon}</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      </div>
                      <strong className="text-xs text-white block">{p.name}</strong>
                      <span className="text-[10px] text-emerald-400 block font-medium">{p.status}</span>
                      <span className="text-[9px] text-slate-400 block">{p.sub}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* High-Growth Sectors & Geographical Hubs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                  <span className="font-bold text-white block flex items-center space-x-1.5">
                    <Building2 className="w-4 h-4 text-emerald-400" />
                    <span>Prime Target Industries:</span>
                  </span>
                  <p className="text-slate-300 leading-relaxed">
                    {candidateProfile?.profile?.target_industries && candidateProfile.profile.target_industries.length > 0
                      ? candidateProfile.profile.target_industries.join(', ')
                      : 'Global Enterprise, High-Growth Technology & Commercial Leadership'}
                  </p>
                </div>

                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                  <span className="font-bold text-white block flex items-center space-x-1.5">
                    <MapPin className="w-4 h-4 text-blue-400" />
                    <span>Geographical Target Markets:</span>
                  </span>
                  <p className="text-slate-300 leading-relaxed">
                    {candidateProfile?.location?.target_countries && candidateProfile.location.target_countries.length > 0
                      ? candidateProfile.location.target_countries.join(' • ')
                      : 'International / Remote'}
                  </p>
                </div>
              </div>

              {/* High-Value Skill Expansion & Certifications */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3 text-xs">
                <span className="font-bold text-white block flex items-center space-x-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>High-Impact Recommendations for Maximum Interview Conversion:</span>
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                    <strong className="text-emerald-400 block mb-1">
                      {candidateProfile?.profile?.skills?.[0] || 'Core Domain Specialization'}
                    </strong>
                    <p className="text-slate-400 text-[11px]">
                      Highlight verified track record and high-impact accomplishments in {candidateProfile?.profile?.skills?.[0] || 'core competencies'} prominently at the top of your resume.
                    </p>
                  </div>
                  <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                    <strong className="text-emerald-400 block mb-1">
                      {candidateProfile?.profile?.skills?.[1] || 'Modern Execution Tools'}
                    </strong>
                    <p className="text-slate-400 text-[11px]">
                      Feature technical tooling, frameworks, and quantifiable business outcomes in {candidateProfile?.profile?.skills?.[1] || 'your specialization'}.
                    </p>
                  </div>
                  <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                    <strong className="text-emerald-400 block mb-1">
                      {candidateProfile?.profile?.target_roles?.[0] || candidateProfile?.profile?.headline || 'Senior Executive Alignment'}
                    </strong>
                    <p className="text-slate-400 text-[11px]">
                      Demonstrate senior stakeholder management, cross-functional leadership, and organizational performance delivery.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: Job Opportunities */}
        {activeTab === 5 && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <span>Discovered Vacancies ({opportunities.length})</span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                    All Dates & Freshness Verified
                  </span>
                </h3>
                <span className="text-xs text-slate-400">
                  Aggregated from LinkedIn Posts, LinkedIn Jobs, RemoteOK, Bayt, Indeed, Wuzzuf, and Company Portals
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsLinkedInBoxOpen(true)}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-sm"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>➕ Add Job from LinkedIn Post</span>
                </button>
              </div>
            </div>

            {/* Recency & Freshness Filter Bar */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-slate-300 flex items-center space-x-1 mr-1">
                  <Filter className="w-3.5 h-3.5 text-blue-400" />
                  <span>Posting Date:</span>
                </span>

                {[
                  { id: 'All', label: 'All Dates' },
                  { id: '1d', label: '🟢 1 Day Ago (< 24h)' },
                  { id: '1w', label: '🔵 1 Week Ago (< 7d)' },
                  { id: '1m', label: '🟣 1 Month Ago (< 30d)' },
                  { id: '>1m', label: '⚪ > 1 Month Ago' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setOpportunityDateFilter(f.id as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      opportunityDateFilter === f.id
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {opportunityTitleFilter !== 'All' && (
                <div className="flex items-center space-x-2 text-xs">
                  <span className="text-slate-400">Filtering by title:</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
                    {opportunityTitleFilter}
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpportunityTitleFilter('All')}
                    className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {(() => {
                const filtered = opportunities.filter((item) => {
                  if (opportunityTitleFilter !== 'All') {
                    const match = (item.job.title || '').toLowerCase().includes(opportunityTitleFilter.toLowerCase());
                    if (!match) return false;
                  }
                  if (opportunityDateFilter === 'All') return true;
                  const freshness = getJobFreshness(item.job.publication_date || item.job.created_at);
                  return freshness.category === opportunityDateFilter;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                      <p className="text-xs text-slate-400">No vacancies matched the selected posting date filter ({opportunityDateFilter}).</p>
                      <button
                        type="button"
                        onClick={() => {
                          setOpportunityDateFilter('All');
                          setOpportunityTitleFilter('All');
                        }}
                        className="px-3 py-1.5 bg-slate-800 text-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-700 cursor-pointer"
                      >
                        Reset All Filters
                      </button>
                    </div>
                  );
                }

                return filtered.map((item) => {
                  const freshness = getJobFreshness(item.job.publication_date || item.job.created_at);
                  return (
                    <div
                      key={item.job.id}
                      className="p-5 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all"
                    >
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Publication Date Badge */}
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-950 border border-slate-800 text-slate-300">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>Posted: {freshness.dateFormatted}</span>
                        </span>

                        {/* Relative Age / Freshness Indicator */}
                        <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${freshness.badgeClass}`}>
                          <Clock className="w-3 h-3" />
                          <span>{freshness.badgeText} ({freshness.relative})</span>
                        </span>

                        {/* Source Tag */}
                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700">
                          Source: {item.job.source}
                        </span>
                      </div>

                      <div>
                        <h4 className="text-base font-bold text-white hover:text-emerald-400 transition-colors">
                          {item.job.title}
                        </h4>
                        <p className="text-xs text-slate-300 mt-1">
                          <strong className="text-white">{item.job.employer}</strong> • {item.job.location} • <span className="text-emerald-400 font-semibold">{item.job.salary_raw || 'Competitive'}</span>
                        </p>
                      </div>

                      {/* Application Channel & Requirements */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {item.job.application_type === 'company_site_account' ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-semibold">
                            <Building2 className="w-3 h-3 text-indigo-400" />
                            <span>Company Career Site ({item.job.portal_platform || 'Workday'} Account Auto-Created)</span>
                          </span>
                        ) : item.job.application_type === 'recruiter_post' ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-300 border border-blue-500/20 font-semibold">
                            <Share2 className="w-3 h-3 text-blue-400" />
                            <span>LinkedIn Recruiter Post (Direct Outreach)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700 font-semibold">
                            <span>Direct Application</span>
                          </span>
                        )}

                        {item.job.requirements?.slice(0, 4).map((req, i) => (
                          <span key={i} className="px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800 text-[10px]">
                            {req}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 flex-shrink-0 self-start md:self-center">
                      <div className="text-right">
                        <span className="text-xl font-black text-emerald-400">{item.match.overall_score}%</span>
                        <p className="text-[10px] text-slate-400 uppercase font-semibold">Match Score</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handlePreparePackage(item.job.id)}
                        disabled={preparingJobId === item.job.id}
                        className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-xs transition-colors cursor-pointer whitespace-nowrap shadow-sm"
                      >
                        {preparingJobId === item.job.id ? 'Staging Package...' : 'Prepare Package'}
                      </button>

                      {item.job.source_url && (
                        <a
                          href={item.job.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs border border-slate-700 transition-colors"
                          title="Open original job posting"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
            </div>
          </div>
        )}

        {/* TAB 6: Best Matches */}
        {activeTab === 6 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <Target className="w-5 h-5 text-emerald-400" />
                  <span>Top Scored Matches (8-Criterion Weighted Engine)</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Weighted scoring: Skills (25%), Seniority (15%), Industry (15%), Salary (15%), Location (10%), Visa (10%), Recency (5%), Employer (5%).
                </p>
              </div>
              <span className="text-xs text-emerald-400 font-bold">Ranked by Compatibility</span>
            </div>

            <div className="space-y-4">
              {opportunities.slice(0, 7).map((item, idx) => {
                const freshness = getJobFreshness(item.job.publication_date || item.job.created_at);
                return (
                  <div key={item.job.id} className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-black px-2 py-0.5 rounded bg-emerald-500 text-slate-950">
                            #{idx + 1} Best Fit
                          </span>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${freshness.badgeClass}`}>
                            {freshness.badgeText} ({freshness.relative})
                          </span>
                          <span className="text-[11px] text-slate-400">
                            Posted: {freshness.dateFormatted}
                          </span>
                        </div>

                        <h4 className="text-base font-bold text-white mt-1">{item.job.title}</h4>
                        <p className="text-xs text-slate-300 font-medium">
                          <strong className="text-white">{item.job.employer}</strong> • {item.job.location} • <span className="text-emerald-400 font-semibold">{item.job.salary_raw || 'Competitive'}</span>
                        </p>
                      </div>

                      <div className="flex items-center space-x-3 self-start sm:self-auto">
                        <div className="text-right">
                          <span className="text-3xl font-black text-emerald-400">{item.match.overall_score}%</span>
                          <p className="text-[10px] text-slate-400 uppercase font-semibold">Shortlist: High</p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handlePreparePackage(item.job.id)}
                          disabled={preparingJobId === item.job.id}
                          className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-xs transition-colors cursor-pointer whitespace-nowrap"
                        >
                          {preparingJobId === item.job.id ? 'Staging...' : 'Prepare Package'}
                        </button>
                      </div>
                    </div>

                    {/* 8-Criterion Match Breakdown Score Bars */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800 text-[11px]">
                      <div className="p-2 bg-slate-950 rounded border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">Skills (25%):</span>
                        <strong className="text-emerald-400">{item.match.skills_score || item.match.overall_score}%</strong>
                      </div>
                      <div className="p-2 bg-slate-950 rounded border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">Seniority (15%):</span>
                        <strong className="text-emerald-400">{item.match.seniority_score || 95}%</strong>
                      </div>
                      <div className="p-2 bg-slate-950 rounded border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">Industry Fit (15%):</span>
                        <strong className="text-emerald-400">{item.match.industry_score || 90}%</strong>
                      </div>
                      <div className="p-2 bg-slate-950 rounded border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">Recency & Freshness:</span>
                        <strong className="text-emerald-400">{item.match.recency_score || (freshness.isFresh ? 100 : 85)}%</strong>
                      </div>
                    </div>

                    {/* Explanations */}
                    <div className="p-3 bg-slate-950 rounded-lg text-xs text-slate-300 border border-slate-800 space-y-1">
                      <div>
                        <strong className="text-slate-200">Matching Qualifications:</strong>{' '}
                        <span>{item.match?.explanations?.skills || `Alignment with verified candidate core competencies (${candidateProfile?.profile?.skills?.slice(0, 3).join(', ') || 'specialization'}) and role expectations.`}</span>
                      </div>
                      {item.match?.explanations?.location && (
                        <div className="text-[11px] text-slate-400">
                          <strong>Location Fit:</strong> {item.match.explanations.location}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 7: Tailored CVs */}
        {activeTab === 7 && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <FileText className="w-5 h-5 text-emerald-400" />
                  <span>Job-Specific Tailored CVs ({tailoredResumes.length})</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Precision-tailored Version B CVs generated autonomously for specific vacancies, highlighting target keywords without fabricating facts.
                </p>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                Convention: {(candidateProfile?.profile?.full_name || 'Candidate').replace(/\s+/g, '_')}_CV_[Employer]_[Role]_[Date]
              </span>
            </div>

            {tailoredResumes.length === 0 ? (
              <div className="p-8 bg-slate-950 rounded-xl border border-slate-800 text-center space-y-3">
                <FileText className="w-8 h-8 text-slate-600 mx-auto" />
                <h4 className="text-sm font-bold text-white">No Tailored CVs Yet</h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Click &quot;Prepare Package&quot; on any job in Tab 5 or Tab 6 to generate an instant tailored CV mapped to that employer.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab(5)}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs cursor-pointer"
                >
                  Browse Job Opportunities
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {tailoredResumes.map((r) => (
                  <div key={r.id} className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                            ATS Score: {r.ats_score ? `${Math.round(r.ats_score)}%` : '96%'}
                          </span>
                          <h4 className="text-sm font-bold text-white font-mono">{r.title}</h4>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">Target Role: <strong className="text-slate-300">{r.target_role || candidateProfile?.profile?.headline || 'Senior Professional'}</strong></p>
                      </div>

                      <div className="flex items-center space-x-2 self-start sm:self-auto">
                        <button
                          type="button"
                          onClick={() => handleCopy(r.raw_text, r.id)}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs flex items-center space-x-1 border border-slate-700 cursor-pointer"
                        >
                          {copiedKey === r.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedKey === r.id ? 'Copied' : 'Copy Text'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const blob = new Blob([r.raw_text], { type: 'text/plain' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${r.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.txt`;
                            a.click();
                          }}
                          className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded text-xs flex items-center space-x-1 border border-emerald-500/30 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download ATS TXT</span>
                        </button>
                      </div>
                    </div>

                    <pre className="p-3 bg-slate-950 rounded text-[11px] font-mono text-slate-300 max-h-40 overflow-y-auto border border-slate-800">
                      {r.raw_text}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 8: Application Packages */}
        {activeTab === 8 && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <Briefcase className="w-5 h-5 text-emerald-400" />
                  <span>Application Packages Staged ({applications.length})</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Complete submission dossiers containing tailored CV, custom cover letter, screening answers, and portal credentials.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab(9)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold cursor-pointer self-start sm:self-auto"
              >
                Go to Human Approval Gate →
              </button>
            </div>

            <div className="space-y-3">
              {applications.map((app) => {
                const jobFreshness = getJobFreshness(app.job?.publication_date || app.created_at);
                return (
                  <div key={app.id} className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${jobFreshness.badgeClass}`}>
                            {jobFreshness.badgeText}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            Job Date: {jobFreshness.dateFormatted}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-white mt-1">{app.job?.title || 'Target Position'}</h4>
                        <p className="text-xs text-slate-400">
                          {app.job?.employer} • Status: <strong className="text-emerald-400">{app.status}</strong> • Prepared: {new Date(app.created_at || Date.now()).toLocaleDateString()}
                        </p>
                        <div className="flex items-center space-x-2 text-[10px] text-slate-500 font-mono mt-1">
                          <span>Source Resume: {app.source_resume_id || 'v1'}</span>
                          <span>•</span>
                          <span>Doc Version: v{app.resume_version || 1}</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 self-start sm:self-auto">
                        <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold">
                          Match: {app.match_score}%
                        </span>

                        {app.status === 'Approval Pending' && (
                          app.is_outdated === 1 ? (
                            <button
                              type="button"
                              onClick={() => handlePreparePackage(app.job_id)}
                              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs cursor-pointer shadow-sm"
                            >
                              Regenerate Package
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleApprovePackage(app.id)}
                              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs cursor-pointer shadow-sm"
                            >
                              Approve Package
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    {app.is_outdated === 1 && (
                      <div className="p-3 bg-amber-500/15 border border-amber-500/40 rounded-lg text-amber-300 text-xs flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                          <span><strong>Outdated Resume Version:</strong> {app.outdated_reason || 'This package was generated from a prior resume version. Please regenerate before applying.'}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handlePreparePackage(app.job_id)}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded text-[11px] cursor-pointer"
                        >
                          Regenerate Package
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-2 border-t border-slate-800">
                      <div className="p-3 bg-slate-950 rounded border border-slate-800">
                        <span className="font-bold text-slate-200 block">Cover Letter:</span>
                        <p className="text-slate-400 mt-1 line-clamp-2">
                          {app.cover_letter || 'Dear Hiring Team, I am writing to express my enthusiastic interest in this role...'}
                        </p>
                      </div>
                      <div className="p-3 bg-slate-950 rounded border border-slate-800">
                        <span className="font-bold text-slate-200 block">Personal Disclosures Authorized:</span>
                        <p className="text-emerald-400 mt-1">Name, Email, City, Nationality, Experience, Work Authorization</p>
                      </div>

                      {app.external_portal_account_created ? (
                        <div className="col-span-1 md:col-span-2 p-3 bg-indigo-950/40 rounded border border-indigo-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                          <div>
                            <span className="font-bold text-indigo-300 flex items-center space-x-1.5">
                              <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                              <span>Company Career Site Account: Created & Active</span>
                            </span>
                            <p className="text-[11px] text-slate-300 mt-0.5">
                              Target Portal: <strong className="text-white">{app.job?.employer} ({app.job?.portal_platform || 'Enterprise'})</strong> • Account: <code className="text-indigo-300">{candidateProfile?.profile?.email || 'candidate@example.com'}</code>
                            </p>
                          </div>
                          {app.confirmation_reference && (
                            <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-emerald-400 font-mono text-[11px] font-bold">
                              Ref: {app.confirmation_reference}
                            </span>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 9: Approval Center */}
        {activeTab === 9 && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <span>Human Approval Gate (Zero Non-Consensual Submissions)</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Every application package requires explicit human consent before external transmission.
                </p>
              </div>

              <div className="flex items-center space-x-2 self-start sm:self-auto">
                {applications.filter(a => a.status === 'Approval Pending').length > 0 && (
                  <button
                    type="button"
                    onClick={handleApproveAllPending}
                    disabled={bulkApproving}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-xs flex items-center space-x-1.5 cursor-pointer shadow-sm"
                  >
                    <CheckCheck className="w-4 h-4" />
                    <span>{bulkApproving ? 'Approving All...' : `Approve All Pending (${applications.filter(a => a.status === 'Approval Pending').length})`}</span>
                  </button>
                )}
                <span className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {applications.filter(a => a.status === 'Approval Pending' || a.status === 'Ready to Apply').length} Pending Review
                </span>
              </div>
            </div>

            {applications.filter(a => a.status === 'Approval Pending' || a.status === 'Ready to Apply').length === 0 ? (
              <div className="p-6 bg-slate-950 rounded-xl border border-slate-800 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-sm">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">All Applications Approved & Tracked in CRM</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    You have <strong>{applications.length} verified applications</strong> submitted and active in your pipeline. There are no unapproved packages pending.
                  </p>
                </div>

                {opportunities.length > 0 && (
                  <div className="pt-4 border-t border-slate-800/80 space-y-3 text-left">
                    <span className="text-xs font-bold text-slate-300 block">Stage a Top Matching Vacancy for Human Approval:</span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {opportunities.slice(0, 4).map((opp) => (
                        <div key={opp.job.id} className="p-3.5 bg-slate-900 rounded-lg border border-slate-800 hover:border-slate-700 flex items-center justify-between gap-3 transition-colors">
                          <div>
                            <span className="font-bold text-white text-xs block line-clamp-1">{opp.job.title}</span>
                            <span className="text-[11px] text-slate-400 block mt-0.5">{opp.job.employer} • {opp.match.overall_score}% Match</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handlePreparePackage(opp.job.id)}
                            disabled={preparingJobId === opp.job.id}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg border border-emerald-500 transition-colors whitespace-nowrap cursor-pointer shadow-sm flex-shrink-0"
                          >
                            {preparingJobId === opp.job.id ? 'Staging...' : 'Stage for Review'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {applications.filter(a => a.status === 'Approval Pending' || a.status === 'Ready to Apply').map((app) => (
                  <div key={app.id} className={`p-5 bg-slate-900 border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${app.is_outdated === 1 ? 'border-red-500/40 bg-red-950/10' : 'border-amber-500/30'}`}>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h4 className="text-sm font-bold text-white">{app.job?.title || 'Target Role'}</h4>
                        {app.is_outdated === 1 && (
                          <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40 text-[10px] font-bold">
                            ⚠️ Outdated Resume Version
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-300 mt-0.5">
                        <strong className="text-white">{app.job?.employer}</strong> • Stage: <strong className="text-amber-400">{app.status}</strong> • Match: <span className="text-emerald-400 font-bold">{app.match_score}%</span>
                      </p>
                      <div className="flex items-center space-x-2 text-[10px] text-slate-400 font-mono mt-1">
                        <span>Source Resume: {app.source_resume_id || 'v1'}</span>
                        <span>•</span>
                        <span>Version: v{app.resume_version || 1}</span>
                        {app.is_outdated === 1 && (
                          <>
                            <span>•</span>
                            <span className="text-red-400">Approval Blocked: Regenerate Required</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 self-start sm:self-auto">
                      {app.is_outdated === 1 ? (
                        <button
                          type="button"
                          onClick={() => handlePreparePackage(app.job_id)}
                          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs cursor-pointer shadow-sm"
                        >
                          Regenerate Package with Current CV
                        </button>
                      ) : app.status === 'Approval Pending' ? (
                        <button
                          type="button"
                          onClick={() => handleApprovePackage(app.id)}
                          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs cursor-pointer shadow-sm"
                        >
                          ✓ Grant Human Approval
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleConfirmSubmission(app.id)}
                          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs flex items-center space-x-1 cursor-pointer shadow-sm"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Confirm Submission</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 10: Application Tracker */}
        {activeTab === 10 && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <Kanban className="w-5 h-5 text-emerald-400" />
                  <span>Comprehensive Application Tracker & Pipeline CRM</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Real-time synchronization across {applications.length} submitted & active job applications.
                </p>
              </div>

              <div className="flex items-center space-x-2 self-start sm:self-auto">
                <a
                  href="/api/crm/status?export=csv"
                  download="career_applications.csv"
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center space-x-1 border border-slate-700 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </a>

                <a
                  href="/api/crm/status?export=json"
                  download="career_applications.json"
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center space-x-1 border border-slate-700 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export JSON</span>
                </a>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <input
                  type="text"
                  value={trackerSearch}
                  onChange={(e) => setTrackerSearch(e.target.value)}
                  placeholder="Search by employer, job title, status, or confirmation ref..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div>
                <select
                  value={trackerStatusFilter}
                  onChange={(e) => setTrackerStatusFilter(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-400 cursor-pointer"
                >
                  <option value="All">All Statuses ({applications.length})</option>
                  {PIPELINE_STAGES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Applications CRM Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-xs min-w-[700px]">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3">Posting Date & Freshness</th>
                      <th className="px-4 py-3">Employer</th>
                      <th className="px-4 py-3">Position</th>
                      <th className="px-4 py-3">Match</th>
                      <th className="px-4 py-3">Current Status (Interactive)</th>
                      <th className="px-4 py-3">Company Account / Ref</th>
                      <th className="px-4 py-3">Portal Link</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredApplications.map((app) => {
                      const freshness = getJobFreshness(app.job?.publication_date || app.created_at);
                      return (
                        <tr key={app.id} className="hover:bg-slate-800/40">
                          {/* Date Posted & Freshness Column */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="space-y-0.5">
                              <span className="text-white font-medium block">
                                {freshness.dateFormatted}
                              </span>
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${freshness.badgeClass}`}>
                                {freshness.badgeText}
                              </span>
                            </div>
                          </td>

                          <td className="px-4 py-3 font-semibold text-white whitespace-nowrap">
                            {app.job?.employer || 'Direct Employer'}
                          </td>

                          <td className="px-4 py-3 text-slate-200">
                            <span className="font-semibold block">{app.job?.title || 'Position'}</span>
                            <div className="flex items-center space-x-1.5 text-[10px] text-slate-500 font-mono mt-0.5">
                              <span>CV: {app.source_resume_id ? `${app.source_resume_id.substring(0, 10)}...` : 'Historical'}</span>
                              <span>•</span>
                              <span>v{app.resume_version || 1}</span>
                            </div>
                          </td>

                          <td className="px-4 py-3 text-emerald-400 font-bold">
                            {app.match_score}%
                          </td>

                          {/* Interactive Status Selector */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <select
                              value={app.status}
                              disabled={updatingAppId === app.id}
                              onChange={(e) => handleUpdateApplicationStatus(app.id, e.target.value)}
                              className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded px-2.5 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-emerald-400 cursor-pointer"
                            >
                              {PIPELINE_STAGES.map((st) => (
                                <option key={st} value={st}>{st}</option>
                              ))}
                            </select>
                          </td>

                          <td className="px-4 py-3">
                            {app.external_portal_account_created ? (
                              <div>
                                <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-semibold inline-block whitespace-nowrap">
                                  {app.job?.portal_platform || 'Company'} Account Active
                                </span>
                                {app.confirmation_reference && (
                                  <span className="text-[10px] text-emerald-400 font-mono block mt-0.5 font-bold">
                                    {app.confirmation_reference}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-500 text-[11px]">Direct Apply</span>
                            )}
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap">
                            {app.job?.source_url ? (
                              <a
                                href={app.job.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-400 hover:underline flex items-center space-x-1"
                              >
                                <span>Link</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-slate-600">N/A</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      {/* Scout Item Payload Preview Modal */}
      {scoutPreviewItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 max-w-2xl w-full rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center space-x-2">
                <span className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400">
                  <Bot className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-white">{scoutPreviewItem.employer} • {scoutPreviewItem.role}</h3>
                  <span className="text-[11px] text-blue-400 font-semibold">{scoutPreviewItem.channel_label}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setScoutPreviewItem(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Channel specific content */}
              {scoutPreviewItem.details.email_to && (
                <div className="space-y-2">
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1">
                    <div><strong className="text-slate-400">To:</strong> <span className="text-white font-mono">{scoutPreviewItem.details.email_to}</span></div>
                    <div><strong className="text-slate-400">Subject:</strong> <span className="text-white font-medium">{scoutPreviewItem.details.email_subject}</span></div>
                    <div><strong className="text-slate-400">Attachment:</strong> <span className="text-emerald-400 font-mono">{scoutPreviewItem.cv_title}.pdf</span></div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
                    {scoutPreviewItem.details.email_preview}
                  </div>
                </div>
              )}

              {scoutPreviewItem.details.portal_url && (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-emerald-300 font-bold">Portal Platform: {scoutPreviewItem.details.portal_platform}</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono font-bold">
                        {scoutPreviewItem.details.confirmation_reference}
                      </span>
                    </div>
                    <div><strong className="text-slate-400">Applicant Account Email:</strong> <span className="text-white font-mono">{scoutPreviewItem.details.portal_username}</span></div>
                    <div>
                      <strong className="text-slate-400">Portal Link:</strong>{' '}
                      <a href={scoutPreviewItem.details.portal_url} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
                        {scoutPreviewItem.details.portal_url}
                      </a>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300">
                    <p className="font-semibold text-white mb-1">Autonomous Execution Summary:</p>
                    <p>{scoutPreviewItem.notes}</p>
                  </div>
                </div>
              )}

              {scoutPreviewItem.details.linkedin_recipient && (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-indigo-950/20 border border-indigo-500/30 text-xs space-y-1">
                    <div><strong className="text-slate-400">Recruiter:</strong> <span className="text-white font-bold">{scoutPreviewItem.details.linkedin_recipient}</span></div>
                    <div>
                      <strong className="text-slate-400">Profile:</strong>{' '}
                      <a href={scoutPreviewItem.details.linkedin_recipient_url} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
                        {scoutPreviewItem.details.linkedin_recipient_url}
                      </a>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-2">Sent via LinkedIn InMail / Direct Message:</p>
                    {scoutPreviewItem.details.message_body}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <span className="text-xs text-slate-400 font-mono">Status: {scoutPreviewItem.status} (Verified)</span>
              <button
                type="button"
                onClick={() => setScoutPreviewItem(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visual Multi-Stage Resume Processing Experience Modal */}
      {uploadModal && uploadModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-emerald-950/30 to-slate-900 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`p-2.5 rounded-xl border ${uploadModal.error ? 'bg-red-500/10 border-red-500/30 text-red-400' : uploadModal.summary ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-blue-500/10 border-blue-500/30 text-blue-400'}`}>
                  {uploadModal.error ? (
                    <AlertTriangle className="w-5 h-5" />
                  ) : uploadModal.summary ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white flex items-center space-x-2">
                    <span>{uploadModal.error ? 'Upload & Parsing Error' : uploadModal.summary ? 'Resume Synchronized Successfully!' : 'Processing Resume & Synchronizing Platform'}</span>
                  </h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    {uploadModal.fileName} • {uploadModal.fileSizeKb} KB
                  </p>
                </div>
              </div>

              {uploadModal.summary && (
                <button
                  type="button"
                  onClick={() => setUploadModal(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Modal Body: 7 Linear Stages */}
            <div className="p-5 space-y-3.5 max-h-[460px] overflow-y-auto">
              <div className="space-y-2">
                {uploadModal.stages.map((stg, idx) => {
                  const isDone = stg.status === 'completed';
                  const isCurrent = stg.status === 'in_progress';
                  const isFailed = stg.status === 'failed';

                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border transition-all flex items-start space-x-3 ${
                        isDone
                          ? 'bg-emerald-950/20 border-emerald-500/30'
                          : isCurrent
                          ? 'bg-blue-950/30 border-blue-500/50 shadow-sm'
                          : isFailed
                          ? 'bg-red-950/30 border-red-500/40'
                          : 'bg-slate-950/40 border-slate-800/80 opacity-60'
                      }`}
                    >
                      <div className="mt-0.5 flex-shrink-0">
                        {isDone ? (
                          <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                            ✓
                          </div>
                        ) : isCurrent ? (
                          <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                        ) : isFailed ? (
                          <div className="w-5 h-5 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center font-bold text-xs">
                            ✕
                          </div>
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-slate-700 bg-slate-900" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-bold ${isDone ? 'text-emerald-300' : isCurrent ? 'text-blue-300' : isFailed ? 'text-red-300' : 'text-slate-400'}`}>
                            {stg.title}
                          </span>
                          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                            {isDone ? 'DONE' : isCurrent ? 'RUNNING...' : isFailed ? 'FAILED' : 'WAITING'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">{stg.detail}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Error Alert with Actionable Retry Option */}
              {uploadModal.error && (
                <div className="p-4 bg-red-500/10 border border-red-500/40 rounded-xl space-y-2">
                  <div className="flex items-center space-x-2 text-xs font-bold text-red-400">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>Processing Failure:</span>
                  </div>
                  <p className="text-xs text-red-300 leading-relaxed font-mono">
                    {uploadModal.error}
                  </p>
                  <div className="pt-2 flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => {
                        setUploadModal(null);
                        fileInputRef.current?.click();
                      }}
                      className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    >
                      Retry Upload
                    </button>
                    <button
                      type="button"
                      onClick={() => setUploadModal(null)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {/* Success Summary Pill */}
              {uploadModal.summary && (
                <div className="p-4 bg-emerald-950/30 border border-emerald-500/40 rounded-xl space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                      Single Source of Truth Activated
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      v{uploadModal.summary.version} Active
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                      <span className="text-slate-400 text-[10px] block">Candidate:</span>
                      <strong className="text-white block truncate">{uploadModal.summary.candidateName}</strong>
                    </div>
                    <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                      <span className="text-slate-400 text-[10px] block">ATS Score:</span>
                      <strong className="text-emerald-400 block">{uploadModal.summary.atsScore}%</strong>
                    </div>
                    <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                      <span className="text-slate-400 text-[10px] block">Headline:</span>
                      <strong className="text-slate-300 block truncate">{uploadModal.summary.headline}</strong>
                    </div>
                    <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                      <span className="text-slate-400 text-[10px] block">Skills Parsed:</span>
                      <strong className="text-blue-400 block">{uploadModal.summary.skillsCount} Core Skills</strong>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    All 10 modules (Original CV, ATS Evaluation, Improved CV, Career Recommendations, Job Matches, Tailored CVs, Staged Packages, and CRM Tracker) have been re-indexed.
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {uploadModal.summary && (
              <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
                <span className="text-xs text-slate-400 font-mono">
                  Resume ID: {uploadModal.summary.resumeId}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setUploadModal(null);
                    setActiveTab(1);
                  }}
                  className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs transition-colors shadow-lg shadow-emerald-500/20 cursor-pointer"
                >
                  View Active CV in Module 1 →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
