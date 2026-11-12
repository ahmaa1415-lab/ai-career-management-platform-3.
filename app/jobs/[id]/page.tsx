'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Briefcase,
  Building2,
  MapPin,
  Calendar,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
  Bookmark,
  Send,
  ArrowLeft,
  Clock,
  Sparkles,
  Info,
  Layers,
  FileCheck,
  Award,
  AlertCircle
} from 'lucide-react';
import Header from '@/components/Header';
import { JobListing, JobFitBreakdown, ATSKeywordDetail } from '@/lib/types';

export default function JobDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [job, setJob] = useState<JobListing | null>(null);
  const [verification, setVerification] = useState<any>(null);
  const [jobFit, setJobFit] = useState<JobFitBreakdown | null>(null);
  const [atsKeywords, setAtsKeywords] = useState<{ score: number; details: ATSKeywordDetail[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'employer' | 'description' | 'application' | 'fit'>('overview');
  const [isSaved, setIsSaved] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/jobs/${id}`)
      .then(res => res.json())
      .then(data => {
        if (data.job) {
          setJob(data.job);
          setVerification(data.verification);
          setJobFit(data.jobFit);
          setAtsKeywords(data.atsKeywords);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const handleSaveToggle = async () => {
    if (!job) return;
    try {
      if (isSaved) {
        await fetch(`/api/jobs/save?job_id=${job.id}`, { method: 'DELETE' });
        setIsSaved(false);
        setActionMessage('Removed from Saved Opportunities');
      } else {
        await fetch('/api/jobs/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: job.id, notes: 'Saved from Job Details page' })
        });
        setIsSaved(true);
        setActionMessage('Saved to Opportunities Vault');
      }
      setTimeout(() => setActionMessage(null), 3000);
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="flex items-center space-x-3 text-emerald-400">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium">Verifying opportunity intelligence...</span>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
        <Header title="Opportunity Not Found" />
        <div className="max-w-2xl mx-auto mt-12 bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Job Listing Not Found</h2>
          <p className="text-slate-400 text-sm mb-6">The requested opportunity ID could not be retrieved from the verified index.</p>
          <Link href="/job-intelligence" className="inline-flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Job Intelligence
          </Link>
        </div>
      </div>
    );
  }

  const isDisqualified = jobFit?.is_disqualified;
  const fitScore = jobFit?.overall_score || job.job_fit_score || 0;
  const freshness = job.freshness_classification || verification?.freshness || 'Recent';
  const verStatus = job.verification_status || verification?.status || 'Curated Listing';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16">
      <Header title="Job Opportunity Intelligence & Verification" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        {/* Breadcrumb & Navigation */}
        <div className="flex items-center justify-between mb-4">
          <Link href="/job-intelligence" className="inline-flex items-center text-xs text-slate-400 hover:text-emerald-400 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back to Intelligence Hub
          </Link>
          {actionMessage && (
            <span className="text-xs bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full border border-emerald-500/30">
              {actionMessage}
            </span>
          )}
        </div>

        {/* Verification Disclaimer Banner */}
        <div className="bg-slate-900/90 border border-amber-500/30 rounded-xl p-4 mb-6 flex items-start space-x-3 text-xs text-amber-200/90 shadow-sm">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-semibold text-amber-300">Listing Verification Notice:</span> Curated listings verify domain format and source structure, but do not guarantee that the employer has not filled or closed the requisition. Always verify current vacancy availability directly on the official employer portal before applying.
          </div>
        </div>

        {/* Opportunity Hero Header Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 mb-6 shadow-xl relative overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2.5 mb-3">
                {/* Verification Status Badge */}
                <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border flex items-center gap-1.5 ${
                  verStatus === 'Curated Listing' || verStatus === 'Live Status Confirmed' || verStatus === 'Verified Open'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : verStatus === 'Broken Link'
                    ? 'bg-red-500/10 text-red-400 border-red-500/30'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                }`}>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {verStatus === 'Verified Open' ? 'Curated Listing' : verStatus}
                </span>

                {/* Freshness Badge */}
                <span className={`px-2.5 py-1 text-xs font-medium rounded-full border flex items-center gap-1.5 ${
                  freshness === 'Very recent'
                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                    : freshness === 'Archived'
                    ? 'bg-slate-800 text-slate-400 border-slate-700'
                    : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                }`}>
                  <Clock className="w-3.5 h-3.5" />
                  Freshness: {freshness}
                </span>

                {/* Job Family */}
                {job.job_family && (
                  <span className="px-2.5 py-1 text-xs bg-purple-500/10 text-purple-300 border border-purple-500/30 rounded-full">
                    {job.job_family}
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-bold text-slate-50 tracking-tight mb-2">
                {job.title}
              </h1>

              <div className="flex flex-wrap items-center gap-y-2 gap-x-6 text-sm text-slate-300">
                <span className="flex items-center gap-1.5 font-medium text-slate-200">
                  <Building2 className="w-4 h-4 text-emerald-400" />
                  {job.employer}
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  {job.location}
                </span>
                <span className="flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  {job.salary_raw || 'Not Disclosed'}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  Published: {job.original_publication_date || job.publication_date || 'Date Unconfirmed'}
                </span>
              </div>
            </div>

            {/* Score & Actions */}
            <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between gap-4 pt-4 lg:pt-0 border-t lg:border-t-0 border-slate-800">
              <div className="text-right">
                <div className="text-xs text-slate-400 uppercase tracking-wider mb-0.5">Candidate Match</div>
                <div className="flex items-center gap-2">
                  <span className={`text-3xl font-extrabold ${
                    isDisqualified
                      ? 'text-red-400'
                      : fitScore >= 85
                      ? 'text-emerald-400'
                      : fitScore >= 70
                      ? 'text-blue-400'
                      : 'text-amber-400'
                  }`}>
                    {fitScore}%
                  </span>
                  <span className="text-xs text-slate-400 font-medium">
                    ({jobFit?.fit_level || (fitScore >= 80 ? 'Strong Fit' : 'Moderate')})
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href={`/ats-analyzer?jobId=${job.id}&role=${encodeURIComponent(job.title)}&country=${encodeURIComponent(job.location)}`}
                  className="px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  ATS & HR Audit
                </Link>

                <button
                  onClick={handleSaveToggle}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-all ${
                    isSaved
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                  }`}
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  {isSaved ? 'Saved' : 'Save'}
                </button>

                <a
                  href={job.company_portal_url || job.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-emerald-900/30 transition-all"
                >
                  Apply at Source
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>

          {/* Hard Disqualification Notice if applicable */}
          {isDisqualified && (
            <div className="mt-5 p-4 rounded-xl bg-red-950/40 border border-red-900/60 text-red-300 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-sm text-red-200">Mandatory Domain Disqualification</div>
                <p className="text-xs text-red-300 mt-0.5 leading-relaxed">
                  {jobFit?.disqualification_reason || 'This role is outside your verified career track.'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 5-Tab Navigation Bar */}
        <div className="border-b border-slate-800 mb-6 flex overflow-x-auto gap-2">
          {[
            { id: 'overview', label: '1. Overview', icon: Layers },
            { id: 'fit', label: '2. Personalized 9-Dimension Fit', icon: Sparkles },
            { id: 'description', label: '3. Full Job Description', icon: FileCheck },
            { id: 'employer', label: '4. Employer & Hierarchy', icon: Building2 },
            { id: 'application', label: '5. Application Routes', icon: Send }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'border-emerald-500 text-emerald-400 bg-slate-900/40'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 1: Overview */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Quick Summary */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-4">Role Overview</h3>
                <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line mb-6">
                  {job.raw_description}
                </p>

                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Key Requirements</h4>
                <div className="flex flex-wrap gap-2">
                  {(job.requirements || []).map((req, i) => (
                    <span key={i} className="px-3 py-1 bg-slate-800 text-slate-200 text-xs rounded-lg border border-slate-700">
                      {req}
                    </span>
                  ))}
                </div>
              </div>

              {/* Verification Evidence */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Verification & Freshness Evidence
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block mb-1">Source Platform:</span>
                    <span className="font-semibold text-slate-200">{job.source}</span>
                  </div>
                  <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block mb-1">Publication Date:</span>
                    <span className="font-semibold text-slate-200">{job.original_publication_date || job.publication_date || 'Date Unconfirmed'}</span>
                  </div>
                  <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block mb-1">Verification Status:</span>
                    <span className="font-semibold text-emerald-400">{verStatus}</span>
                  </div>
                  <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block mb-1">Freshness Tier:</span>
                    <span className="font-semibold text-blue-400">{freshness}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar Overview Stats */}
            <div className="space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-4">Position Details</h3>
                <dl className="space-y-3 text-xs">
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <dt className="text-slate-400">Seniority Level:</dt>
                    <dd className="font-semibold text-slate-200">{job.seniority}</dd>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <dt className="text-slate-400">Required Experience:</dt>
                    <dd className="font-semibold text-slate-200">{job.experience_required_years} Years</dd>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <dt className="text-slate-400">Work Mode:</dt>
                    <dd className="font-semibold text-slate-200">{job.remote_eligibility}</dd>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <dt className="text-slate-400">Visa Sponsorship:</dt>
                    <dd className="font-semibold text-slate-200">{job.visa_sponsorship}</dd>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <dt className="text-slate-400">Portal Platform:</dt>
                    <dd className="font-semibold text-slate-200">{job.portal_platform || 'Direct'}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: 9-Dimension Fit & ATS Keyword Alignment */}
        {activeTab === 'fit' && (
          <div className="space-y-6">
            {/* 9 Dimensions Grid */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-100">9-Dimension Job Fit Breakdown</h3>
                  <p className="text-xs text-slate-400">Weighted evaluation comparing candidate confirmed background against job specifications</p>
                </div>
                <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full text-xs font-bold">
                  Overall Score: {fitScore}%
                </span>
              </div>

              {jobFit?.dimensions ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(jobFit.dimensions).map(([key, dim]) => (
                    <div key={key} className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-300">{dim.name}</span>
                        <span className="text-xs text-slate-400 font-mono">{(dim.weight * 100).toFixed(0)}% wt</span>
                      </div>
                      <div className="flex items-baseline gap-2 mb-2">
                        <span className={`text-xl font-bold ${
                          dim.score >= 80 ? 'text-emerald-400' : dim.score >= 60 ? 'text-blue-400' : 'text-amber-400'
                        }`}>
                          {dim.score}%
                        </span>
                        <span className="text-[11px] text-slate-400">({dim.status})</span>
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                        {dim.explanation}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-slate-400 text-sm py-4">Evaluation processing...</div>
              )}
            </div>

            {/* ATS Keyword Alignment */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-100">ATS Keyword Categorization & Gap Analysis</h3>
                  <p className="text-xs text-slate-400">Differentiates exact matches, terminology differences, and genuine experience gaps</p>
                </div>
                {atsKeywords && (
                  <span className="text-xs font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/30 px-3 py-1 rounded-full">
                    Alignment Score: {atsKeywords.score}%
                  </span>
                )}
              </div>

              {atsKeywords?.details && atsKeywords.details.length > 0 ? (
                <div className="space-y-3">
                  {atsKeywords.details.map((detail, idx) => (
                    <div key={idx} className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-200 text-sm">{detail.keyword}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                            detail.category === 'Exact Match'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : detail.category === 'Terminology Gap'
                              ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                              : detail.category === 'Related / Incomplete'
                              ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                              : detail.category === 'Irrelevant Requirement'
                              ? 'bg-slate-800 text-slate-400 border-slate-700'
                              : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                          }`}>
                            {detail.category}
                          </span>
                        </div>
                        <p className="text-slate-400 mt-1">{detail.evidence_in_cv}</p>
                      </div>
                      {detail.recommendation && (
                        <div className="text-slate-300 bg-slate-900 px-3 py-1.5 rounded border border-slate-800 max-w-sm flex-shrink-0">
                          <span className="text-slate-500 block text-[10px] uppercase">Recommendation:</span>
                          {detail.recommendation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">Standard competencies evaluated against candidate profile.</p>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Detailed Job Description */}
        {activeTab === 'description' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 sm:p-8 space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-100 mb-2">Job Description</h3>
              <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-line bg-slate-950/60 p-6 rounded-xl border border-slate-800">
                {job.raw_description}
              </div>
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-100 mb-2">Technical & Commercial Competencies</h3>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-slate-300">
                {(job.requirements || []).map((req, i) => (
                  <li key={i} className="flex items-center gap-2 p-2.5 bg-slate-950/40 rounded-lg border border-slate-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span>{req}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Tab 4: Employer & Hierarchy */}
        {activeTab === 'employer' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 sm:p-8 space-y-6">
            <h3 className="text-base font-bold text-slate-100">Employer Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
              <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Organization</span>
                <p className="text-lg font-bold text-slate-100">{job.employer}</p>
                <p className="text-slate-300 text-xs">Primary Location: {job.location}</p>
                {job.company_career_url && (
                  <a href={job.company_career_url} target="_blank" rel="noreferrer" className="text-xs text-emerald-400 hover:underline inline-flex items-center gap-1">
                    Official Corporate Career Portal <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Reporting Line & Team Scope</span>
                <p className="text-slate-200 text-xs font-medium">{job.reporting_line || 'Reports to Commercial Director / Business Unit Head'}</p>
                <p className="text-slate-400 text-xs">{job.team_responsibilities || 'Oversees category specialists and trade marketing execution.'}</p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Application Routes */}
        {activeTab === 'application' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 sm:p-8 space-y-6">
            <h3 className="text-base font-bold text-slate-100">Application Submission Options</h3>
            <p className="text-xs text-slate-400">Choose how to submit your tailored application package to {job.employer}.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-5 bg-slate-950/60 rounded-xl border border-slate-800 flex flex-col justify-between">
                <div>
                  <h4 className="font-semibold text-slate-100 text-sm mb-1">Direct Employer Application</h4>
                  <p className="text-xs text-slate-400 mb-4">Submit via official career site or verified ATS portal ({job.portal_platform || 'Enterprise Portal'}).</p>
                </div>
                <a
                  href={job.company_portal_url || job.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  Proceed to Official Portal
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <div className="p-5 bg-slate-950/60 rounded-xl border border-slate-800 flex flex-col justify-between">
                <div>
                  <h4 className="font-semibold text-slate-100 text-sm mb-1">Tailored Package Workspace</h4>
                  <p className="text-xs text-slate-400 mb-4">Generate role-tailored Version B CV and cover letter in your Application Center.</p>
                </div>
                <Link
                  href="/applications"
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  Open Application Workspace
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
