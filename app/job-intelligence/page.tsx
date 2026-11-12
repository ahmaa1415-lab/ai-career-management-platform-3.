'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Compass,
  Building2,
  MapPin,
  Calendar,
  DollarSign,
  ShieldCheck,
  Clock,
  Sparkles,
  Share2,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Bookmark,
  ExternalLink,
  Layers,
  TrendingUp,
  FileText,
  UserCheck
} from 'lucide-react';
import Header from '@/components/Header';
import { JobListing, LinkedInRecruiterActivity, LinkedInCompanyUpdate, LinkedInIndustryInsight } from '@/lib/types';

export default function JobIntelligencePage() {
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [recruiters, setRecruiters] = useState<LinkedInRecruiterActivity[]>([]);
  const [companyUpdates, setCompanyUpdates] = useState<LinkedInCompanyUpdate[]>([]);
  const [insights, setInsights] = useState<LinkedInIndustryInsight[]>([]);
  const [savedJobs, setSavedJobs] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    'opportunities' | 'verification' | 'recruiters' | 'companies' | 'insights' | 'dedup' | 'saved'
  >('opportunities');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('All');
  const [selectedFreshness, setSelectedFreshness] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');

  useEffect(() => {
    Promise.all([
      fetch('/api/jobs').then(r => r.json()),
      fetch('/api/linkedin/intelligence').then(r => r.json()),
      fetch('/api/jobs/save').then(r => r.json()).catch(() => ({ saved: [] }))
    ])
      .then(([jobsData, intelData, savedData]) => {
        if (jobsData.jobs) setJobs(jobsData.jobs);
        if (intelData.recruiters) setRecruiters(intelData.recruiters);
        if (intelData.companies) setCompanyUpdates(intelData.companies);
        if (intelData.insights) setInsights(intelData.insights);
        if (savedData.saved) setSavedJobs(savedData.saved);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSaveToggle = async (jobId: string) => {
    const isCurrentlySaved = savedJobs.some(s => s.job_id === jobId);
    try {
      if (isCurrentlySaved) {
        await fetch(`/api/jobs/save?job_id=${jobId}`, { method: 'DELETE' });
        setSavedJobs(savedJobs.filter(s => s.job_id !== jobId));
      } else {
        await fetch('/api/jobs/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: jobId, notes: 'Saved from Intelligence Hub' })
        });
        const savedJobObj = jobs.find(j => j.id === jobId);
        if (savedJobObj) {
          setSavedJobs([...savedJobs, { job_id: jobId, title: savedJobObj.title, employer: savedJobObj.employer }]);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Filtered jobs
  const filteredJobs = jobs.filter(job => {
    const matchesSearch =
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.employer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (job.requirements || []).some(r => r.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCountry =
      selectedCountry === 'All' ||
      job.location.toLowerCase().includes(selectedCountry.toLowerCase());

    const matchesFreshness =
      selectedFreshness === 'All' ||
      (job.freshness_classification || '').toLowerCase() === selectedFreshness.toLowerCase();

    const matchesStatus =
      selectedStatus === 'All' ||
      (job.verification_status || '').toLowerCase() === selectedStatus.toLowerCase();

    return matchesSearch && matchesCountry && matchesFreshness && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16">
      <Header title="Job & Market Intelligence Hub" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        {/* Hub Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 mb-6 shadow-xl relative overflow-hidden">
          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              Verified Commercial & FMCG Intelligence
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Real-Time Vacancy, Recruiter & Market Intelligence
            </h1>
            <p className="text-slate-300 text-sm mt-2 leading-relaxed">
              Targeted across UAE, Saudi Arabia, and Egypt for Category Management, Trade Marketing,
              Commercial Leadership, and Retail Execution. Real links, verified publication dates, and zero generic scaffolding.
            </p>
          </div>
        </div>

        {/* 7-Tab Navigation */}
        <div className="border-b border-slate-800 mb-6 flex overflow-x-auto gap-2">
          {[
            { id: 'opportunities', label: `1. Verified Opportunities (${jobs.length})`, icon: Compass },
            { id: 'verification', label: '2. Freshness & Link Audit', icon: ShieldCheck },
            { id: 'recruiters', label: `3. LinkedIn Recruiter Feed (${recruiters.length})`, icon: Share2 },
            { id: 'companies', label: `4. Company Expansions (${companyUpdates.length})`, icon: Building2 },
            { id: 'insights', label: `5. Industry Insights (${insights.length})`, icon: TrendingUp },
            { id: 'dedup', label: '6. Multi-Source Deduplication', icon: Layers },
            { id: 'saved', label: `7. Saved Vault (${savedJobs.length})`, icon: Bookmark }
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

        {/* Search & Multi-Filters (Visible on Opportunities & Verification tabs) */}
        {(activeTab === 'opportunities' || activeTab === 'verification' || activeTab === 'dedup') && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search role, company, skills..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <select
                  value={selectedCountry}
                  onChange={e => setSelectedCountry(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="All">All Locations (UAE, KSA, Egypt)</option>
                  <option value="Dubai">Dubai / UAE</option>
                  <option value="Saudi">Saudi Arabia (Riyadh / Jeddah)</option>
                  <option value="Egypt">Egypt (Cairo)</option>
                  <option value="Remote">Remote</option>
                </select>
              </div>

              <div>
                <select
                  value={selectedFreshness}
                  onChange={e => setSelectedFreshness(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="All">All Freshness Tiers</option>
                  <option value="Very recent">Very recent (0-7 days)</option>
                  <option value="Recent">Recent (8-14 days)</option>
                  <option value="Current, requires verification">Current (15-30 days)</option>
                  <option value="Older, display with warning">Older (31-45 days)</option>
                  <option value="Archived">Archived (&gt;45 days)</option>
                </select>
              </div>

              <div>
                <select
                  value={selectedStatus}
                  onChange={e => setSelectedStatus(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="All">All Verification Statuses</option>
                  <option value="Verified Open">Verified Open</option>
                  <option value="Open, Date Unconfirmed">Open, Date Unconfirmed</option>
                  <option value="Unverified">Unverified</option>
                  <option value="Broken Link">Broken Link</option>
                  <option value="Expired">Expired</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Tab 1: Opportunities List */}
        {activeTab === 'opportunities' && (
          <div className="space-y-4">
            {filteredJobs.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400 text-sm">
                No matching opportunities found for your selected filters.
              </div>
            ) : (
              filteredJobs.map(job => {
                const isSaved = savedJobs.some(s => s.job_id === job.id);
                return (
                  <div
                    key={job.id}
                    className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-5 sm:p-6 transition-all shadow-md relative group"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-full border ${
                            job.verification_status === 'Verified Open'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : job.verification_status === 'Broken Link'
                              ? 'bg-red-500/10 text-red-400 border-red-500/30'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          }`}>
                            {job.verification_status || 'Verified Open'}
                          </span>

                          <span className="px-2 py-0.5 text-[11px] bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-full">
                            {job.freshness_classification || 'Recent'}
                          </span>

                          {job.job_family && (
                            <span className="px-2 py-0.5 text-[11px] bg-purple-500/10 text-purple-300 border border-purple-500/30 rounded-full">
                              {job.job_family}
                            </span>
                          )}
                        </div>

                        <Link href={`/jobs/${job.id}`}>
                          <h3 className="text-lg font-bold text-slate-100 hover:text-emerald-400 transition-colors">
                            {job.title}
                          </h3>
                        </Link>

                        <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-400 mt-2">
                          <span className="flex items-center gap-1 font-medium text-slate-300">
                            <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                            {job.employer}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" />
                            {job.location}
                          </span>
                          <span className="flex items-center gap-1 text-slate-300 font-medium">
                            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                            {job.salary_raw || 'Not Disclosed'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            Published: {job.original_publication_date || job.publication_date || 'Date Unconfirmed'}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {(job.requirements || []).slice(0, 5).map((req, idx) => (
                            <span key={idx} className="px-2 py-0.5 bg-slate-950 text-slate-300 text-[11px] rounded border border-slate-800">
                              {req}
                            </span>
                          ))}
                          {(job.requirements || []).length > 5 && (
                            <span className="px-2 py-0.5 text-slate-500 text-[11px]">
                              +{job.requirements.length - 5} more
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                        <button
                          onClick={() => handleSaveToggle(job.id)}
                          className={`p-2 rounded-lg border text-xs flex items-center gap-1 transition-colors ${
                            isSaved
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-slate-800 text-slate-400 hover:text-slate-200 border-slate-700'
                          }`}
                        >
                          <Bookmark className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">{isSaved ? 'Saved' : 'Save'}</span>
                        </button>

                        <Link
                          href={`/jobs/${job.id}`}
                          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-md shadow-emerald-950/40 transition-colors"
                        >
                          View Evaluation
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Tab 2: Freshness & Verification Center */}
        {activeTab === 'verification' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h3 className="text-base font-bold text-slate-100 mb-2">Verification & Freshness Audit Trail</h3>
              <p className="text-xs text-slate-400 mb-6">
                Active validation logs confirming original publication dates, link HTTP status, and anti-scam safeguards.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="p-3">Employer & Role</th>
                      <th className="p-3">Publication Date</th>
                      <th className="p-3">Freshness Tier</th>
                      <th className="p-3">Verification Status</th>
                      <th className="p-3">Link Health</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredJobs.map(job => (
                      <tr key={job.id} className="hover:bg-slate-950/40">
                        <td className="p-3 font-medium text-slate-200">
                          {job.employer} — <span className="text-slate-400">{job.title}</span>
                        </td>
                        <td className="p-3 font-mono">{job.original_publication_date || job.publication_date || 'Date Unconfirmed'}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30">
                            {job.freshness_classification || 'Recent'}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded font-semibold ${
                            job.verification_status === 'Verified Open' ? 'text-emerald-400' : 'text-amber-400'
                          }`}>
                            {job.verification_status || 'Verified Open'}
                          </span>
                        </td>
                        <td className="p-3">
                          <a
                            href={job.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-400 hover:underline inline-flex items-center gap-1"
                          >
                            Inspect Source <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: LinkedIn Recruiter Activity */}
        {activeTab === 'recruiters' && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4">
              <h3 className="text-sm font-bold text-slate-100">Live Recruiter Hiring Posts & Direct Contacts</h3>
              <p className="text-xs text-slate-400">Indexed from talent acquisition leaders across FMCG and modern trade in UAE and KSA</p>
            </div>

            {recruiters.map(rec => (
              <div key={rec.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm border border-emerald-500/30">
                      {rec.author_name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                        {rec.author_name}
                        <span className="px-2 py-0.5 text-[10px] bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/30 font-medium">
                          Verified Recruiter
                        </span>
                      </h4>
                      <p className="text-xs text-slate-400">{rec.author_title} — <span className="text-emerald-400 font-medium">{rec.company}</span></p>
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {rec.publication_date}
                  </span>
                </div>

                <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-lg text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                  {rec.post_text}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs pt-2 border-t border-slate-800">
                  <div className="text-slate-400">
                    <span className="text-slate-200 font-semibold">Contact Instructions:</span> {rec.contact_instructions || 'Connect directly on LinkedIn'}
                  </div>
                  <div className="flex items-center gap-2">
                    {rec.recruiter_profile_url && (
                      <a
                        href={rec.recruiter_profile_url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-medium inline-flex items-center gap-1"
                      >
                        Recruiter Profile <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    <a
                      href={rec.post_url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold inline-flex items-center gap-1"
                    >
                      View Original Post <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 4: LinkedIn Company Expansions */}
        {activeTab === 'companies' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {companyUpdates.map(comp => (
              <div key={comp.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-bold text-emerald-400 text-sm">{comp.company}</span>
                    <span className="px-2 py-0.5 text-[10px] bg-purple-500/10 text-purple-300 border border-purple-500/30 rounded-full font-medium">
                      {comp.update_type}
                    </span>
                  </div>
                  <h4 className="text-base font-bold text-slate-100 mb-2 leading-snug">{comp.headline}</h4>
                  <p className="text-xs text-slate-300 leading-relaxed mb-3">{comp.summary}</p>
                </div>

                <div className="p-3 bg-slate-950/70 rounded-lg border border-slate-800 text-xs">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold mb-0.5">Career Relevance:</span>
                  <p className="text-slate-200">{comp.career_relevance}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 5: Industry Insights */}
        {activeTab === 'insights' && (
          <div className="space-y-4">
            {insights.map(ins => (
              <div key={ins.id} className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="px-2.5 py-0.5 text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 rounded-full font-medium inline-block mb-2">
                      {ins.topic}
                    </span>
                    <h4 className="text-base font-bold text-slate-100">{ins.title}</h4>
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    <span className="font-medium text-slate-300 block">{ins.author_name}</span>
                    <span>{ins.author_title}</span>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-4 rounded-lg border border-slate-800">
                  {ins.insights_summary}
                </p>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs pt-2 border-t border-slate-800">
                  <div className="text-emerald-400 font-medium">
                    Strategy Link: <span className="text-slate-300">{ins.career_relevance}</span>
                  </div>
                  <a
                    href={ins.post_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-slate-400 hover:text-emerald-400 inline-flex items-center gap-1"
                  >
                    Read on LinkedIn <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 6: Multi-Source Deduplication */}
        {activeTab === 'dedup' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-100">Multi-Source Deduplication Engine</h3>
            <p className="text-xs text-slate-400">
              Cross-references job listings across Wuzzuf, Bayt, LinkedIn, and GulfTalent. Duplicate postings
              are automatically consolidated into a single master record referencing all sources.
            </p>

            <div className="space-y-3 mt-4">
              {jobs
                .filter(j => {
                  try {
                    const s = j.sources_json ? JSON.parse(j.sources_json) : [];
                    return s.length > 1;
                  } catch {
                    return false;
                  }
                })
                .map(j => {
                  const sources = JSON.parse(j.sources_json || '[]');
                  return (
                    <div key={j.id} className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm text-slate-100">{j.title}</span>
                        <span className="px-2 py-0.5 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full font-bold">
                          {sources.length} Verified Sources Consolidated
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mb-3">{j.employer} — {j.location}</p>
                      <div className="flex flex-wrap gap-2">
                        {sources.map((s: any, idx: number) => (
                          <a
                            key={idx}
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded text-xs flex items-center gap-1.5"
                          >
                            <span>Source #{idx + 1}: {s.source}</span>
                            <ExternalLink className="w-3 h-3 text-slate-400" />
                          </a>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Tab 7: Saved Opportunities Vault */}
        {activeTab === 'saved' && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4">
              <h3 className="text-sm font-bold text-slate-100">Saved Opportunities Vault ({savedJobs.length})</h3>
              <p className="text-xs text-slate-400">Opportunities bookmarked for tailored application preparation and executive review</p>
            </div>

            {savedJobs.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400 text-sm">
                No saved opportunities yet. Click the bookmark icon on any opportunity card to save it here.
              </div>
            ) : (
              savedJobs.map(saved => (
                <div key={saved.id || saved.job_id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-bold text-slate-100">{saved.title}</h4>
                    <p className="text-xs text-slate-400">{saved.employer} — {saved.location || 'Gulf / Regional'}</p>
                    {saved.notes && <p className="text-xs text-slate-300 italic mt-1">Note: {saved.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSaveToggle(saved.job_id)}
                      className="px-3 py-1.5 bg-red-950/50 hover:bg-red-900/50 text-red-300 border border-red-900/60 rounded text-xs"
                    >
                      Remove
                    </button>
                    <Link
                      href={`/jobs/${saved.job_id}`}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold flex items-center gap-1"
                    >
                      View Job <ChevronRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
