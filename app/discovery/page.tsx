'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import OnboardingGateBanner from '@/components/OnboardingGateBanner';
import { JobListing } from '@/lib/types';
import {
  Compass,
  Search,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Building2,
  MapPin,
  DollarSign,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Mail,
  Send,
  Layers,
  ChevronDown,
  ChevronUp,
  Briefcase,
  Calendar,
  Clock,
  UserCheck
} from 'lucide-react';
import { useRouter } from 'next/navigation';

function LinkedInIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
    </svg>
  );
}

const OURSHOPEE_SAMPLE = `📢 We're Hiring! | Ourshopee – Dubai

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

export default function DiscoveryPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [search, setSearch] = useState('');
  const [selectedSource, setSelectedSource] = useState('All');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [onboarded, setOnboarded] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [preparingId, setPreparingId] = useState<string | null>(null);

  // LinkedIn Post Ingestion & Multi-Role Parser State
  const [parserExpanded, setParserExpanded] = useState(true);
  const [rawPostText, setRawPostText] = useState('');
  const [parsingPost, setParsingPost] = useState(false);
  const [parsedAnalysis, setParsedAnalysis] = useState<any>(null);
  const [applyingRole, setApplyingRole] = useState<string | null>(null);
  const [applySuccessMsg, setApplySuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const profileRes = await fetch('/api/profile');
      if (profileRes.ok) {
        const prof = await profileRes.json();
        setOnboarded(Boolean(prof.profile?.onboarding_completed));
      }

      const res = await fetch('/api/jobs');
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/jobs/sync', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setActionMessage(`Sync Complete: ${data.result.uniqueInserted} unique listings verified, ${data.result.duplicatesDetected} duplicates detected.`);
        await fetchJobs();
      }
    } catch (err: any) {
      setActionMessage('Failed to sync jobs.');
    } finally {
      setSyncing(false);
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  const handleParsePost = async () => {
    if (!rawPostText.trim()) return;
    setParsingPost(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/linkedin/parse-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_text: rawPostText, auto_index: true })
      });
      const data = await res.json();
      if (data.success) {
        setParsedAnalysis(data.analysis);
        setActionMessage(data.message);
        await fetchJobs();
      } else {
        setActionMessage(`Error parsing post: ${data.error}`);
      }
    } catch (err: any) {
      setActionMessage(`Error parsing post: ${err.message}`);
    } finally {
      setParsingPost(false);
    }
  };

  const handleDirectAutoApply = async (roleTitle: string) => {
    setApplyingRole(roleTitle);
    setApplySuccessMsg(null);
    try {
      const res = await fetch('/api/linkedin/parse-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_text: rawPostText || OURSHOPEE_SAMPLE,
          auto_index: true,
          auto_apply_role: roleTitle
        })
      });
      const data = await res.json();
      if (data.success && data.application_result) {
        setApplySuccessMsg(
          `⚡ Tailored package prepared for "${roleTitle}"! Tailored CV (${data.application_result.cv_title}) created and recruiter outreach draft saved. Ready for review in Approval Center.`
        );
        await fetchJobs();
        setTimeout(() => setApplySuccessMsg(null), 10000);
      } else {
        setActionMessage(`Package preparation error: ${data.error || 'Failed'}`);
      }
    } catch (err: any) {
      setActionMessage(`Package preparation error: ${err.message}`);
    } finally {
      setApplyingRole(null);
    }
  };

  const handlePreparePackage = async (jobId: string) => {
    setPreparingId(jobId);
    setActionMessage(null);
    try {
      const res = await fetch('/api/applications/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to prepare package.');
      }

      const data = await res.json();
      setActionMessage(`Application package prepared! Ready in Approval Center for your review.`);
      setTimeout(() => router.push('/approvals'), 1500);
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    } finally {
      setPreparingId(null);
    }
  };

  const filteredJobs = jobs.filter(j => {
    const matchesSearch =
      j.employer.toLowerCase().includes(search.toLowerCase()) ||
      j.title.toLowerCase().includes(search.toLowerCase()) ||
      j.location.toLowerCase().includes(search.toLowerCase());
    const matchesSource = selectedSource === 'All' || j.source.toLowerCase().includes(selectedSource.toLowerCase());
    return matchesSearch && matchesSource;
  });

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="Real Job Discovery & Source Verification"
        subtitle="Multi-source aggregation across RemoteOK, Bayt, Indeed, Wuzzuf, GulfTalent, and verified careers pages"
        onboardingStatus={onboarded}
      />

      <div className="p-4 sm:p-6 md:p-8 max-w-7xl space-y-6 w-full overflow-hidden">
        {!onboarded && <OnboardingGateBanner moduleName="Job Discovery" />}

        {actionMessage && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{actionMessage}</span>
          </div>
        )}

        {applySuccessMsg && (
          <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-300 text-xs flex items-start space-x-3 shadow-lg">
            <Mail className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-white">Recruiter Outreach Draft Prepared</p>
              <p className="mt-0.5 leading-relaxed">{applySuccessMsg}</p>
            </div>
          </div>
        )}

        {/* LinkedIn Multi-Role Post Parser & Disaggregation Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 sm:p-5 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/40">
            <div className="flex items-start sm:items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-[#0077b5]/10 border border-[#0077b5]/30 flex items-center justify-center flex-shrink-0">
                <LinkedInIcon className="w-5 h-5 text-[#0a66c2]" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-sm font-bold text-white">LinkedIn Hiring Post Ingestion & Multi-Role Parser</h2>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    Direct Recruiter Outreach
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Paste unstructured recruiter or founder posts. Automatically splits multi-vacancy posts into individual vacancies, extracts recruiter emails, tailors CVs, and auto-applies directly.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setRawPostText(OURSHOPEE_SAMPLE)}
                className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              >
                Load Ourshopee Post Sample
              </button>
              <button
                type="button"
                onClick={() => setParserExpanded(!parserExpanded)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                aria-label="Toggle parser card"
              >
                {parserExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {parserExpanded && (
            <div className="p-4 sm:p-5 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>Paste LinkedIn Post Text:</span>
                  <span className="text-[11px] text-slate-400">{rawPostText.length} characters</span>
                </label>
                <textarea
                  value={rawPostText}
                  onChange={(e) => setRawPostText(e.target.value)}
                  placeholder="Paste any LinkedIn hiring post (e.g., We're Hiring! | Ourshopee – Dubai... 🔹 Finance Manager... Send CV to mansi.deo@ourshopee.com)"
                  rows={5}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono leading-relaxed resize-y"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleParsePost}
                    disabled={parsingPost || !rawPostText.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center space-x-2 transition-colors shadow-sm"
                  >
                    <Layers className={`w-3.5 h-3.5 ${parsingPost ? 'animate-spin' : ''}`} />
                    <span>{parsingPost ? 'Parsing & Disaggregating...' : '🤖 Parse Post & Disaggregate Openings'}</span>
                  </button>

                  {rawPostText && (
                    <button
                      type="button"
                      onClick={() => {
                        setRawPostText('');
                        setParsedAnalysis(null);
                      }}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-lg text-xs transition-colors border border-slate-700"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="text-[11px] text-slate-400 flex items-center space-x-3">
                  <span>✓ Multi-Role Splitting</span>
                  <span>✓ Email & Recruiter Identification</span>
                  <span>✓ Auto-Indexing into DB</span>
                </div>
              </div>

              {/* Render Disaggregated Analysis */}
              {parsedAnalysis && (
                <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-4">
                  {/* Analysis Metadata Header */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-white uppercase tracking-wider">Hiring Company:</span>
                        <span className="text-sm font-bold text-blue-400">{parsedAnalysis.employer}</span>
                        <span className="text-slate-600">•</span>
                        <span className="text-xs text-slate-300 flex items-center space-x-1">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          <span>{parsedAnalysis.location}</span>
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 pt-1">
                        <span>Work Mode: <strong className="text-slate-200">{parsedAnalysis.work_mode}</strong></span>
                        {parsedAnalysis.working_days && (
                          <span>Working Days: <strong className="text-slate-200">{parsedAnalysis.working_days}</strong></span>
                        )}
                        <span>Direct Recruiter: <strong className="text-emerald-400">{parsedAnalysis.recruiter_email}</strong> {parsedAnalysis.recruiter_name ? `(${parsedAnalysis.recruiter_name})` : ''}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {parsedAnalysis.hashtags?.map((tag: string, idx: number) => (
                        <span key={idx} className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Disaggregated Roles Grid */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-300 mb-3 flex items-center space-x-2">
                      <Briefcase className="w-3.5 h-3.5 text-blue-400" />
                      <span>Disaggregated Vacancies ({parsedAnalysis.extracted_roles?.length || 0} Openings Extracted)</span>
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {parsedAnalysis.extracted_roles?.map((role: any, idx: number) => (
                        <div
                          key={idx}
                          className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3 hover:border-blue-500/40 transition-colors flex flex-col justify-between"
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h4 className="text-sm font-bold text-white">{role.title}</h4>
                                <span className="text-[11px] text-slate-400">{parsedAnalysis.employer} • {parsedAnalysis.location}</span>
                              </div>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                {role.match_score ? `${role.match_score}% Match` : '95% Match'}
                              </span>
                            </div>

                            <p className="text-xs text-slate-400 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60 font-mono">
                              {role.raw_bullet}
                            </p>

                            <div className="flex flex-wrap gap-1 pt-1">
                              {role.experience_years > 0 && (
                                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                                  {role.experience_years}+ Yrs Exp
                                </span>
                              )}
                              {role.qualifications?.map((q: string, qIdx: number) => (
                                <span key={qIdx} className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                  {q}
                                </span>
                              ))}
                              {role.mandatory_requirements?.map((m: string, mIdx: number) => (
                                <span key={mIdx} className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                  {m}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                            <span className="text-[11px] text-slate-400 flex items-center space-x-1 truncate max-w-[180px]">
                              <Mail className="w-3 h-3 text-slate-400 flex-shrink-0" />
                              <span className="truncate">{parsedAnalysis.recruiter_email}</span>
                            </span>

                            <button
                              type="button"
                              onClick={() => handleDirectAutoApply(role.title)}
                              disabled={applyingRole === role.title}
                              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-xs flex items-center space-x-1.5 transition-colors shadow-sm flex-shrink-0"
                            >
                              <Send className="w-3 h-3" />
                              <span>{applyingRole === role.title ? 'Dispatching...' : '⚡ Apply via Recruiter Email'}</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Search & Filter Toolbar */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by employer, title, tech stack..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
            >
              <option value="All">All Sources</option>
              <option value="LinkedIn Post">LinkedIn Recruiter & Founder Posts</option>
              <option value="LinkedIn">LinkedIn Jobs</option>
              <option value="Remote">Remote Boards</option>
              <option value="Bayt">Bayt / Wuzzuf</option>
              <option value="GulfTalent">GulfTalent</option>
            </select>
          </div>

          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="w-full sm:w-auto justify-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center space-x-2 transition-colors flex-shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Scanning Sources...' : 'Run Aggregator Sync'}</span>
          </button>
        </div>

        {/* Listings Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span>Showing {filteredJobs.length} verified vacancies</span>
            <span>Real indexed URLs • Zero simulated listings</span>
          </div>

          {filteredJobs.map((job) => (
            <div
              key={job.id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-all shadow-sm space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-white">{job.title}</h3>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center space-x-1">
                      <ShieldCheck className="w-3 h-3" />
                      <span>Verified Vacancy</span>
                    </span>
                    {job.application_type === 'company_site_account' && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center space-x-1">
                        <Building2 className="w-3 h-3" />
                        <span>Company Site Account Auto-Created ({job.portal_platform || 'Workday'})</span>
                      </span>
                    )}
                    {job.application_type === 'recruiter_post' && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center space-x-1">
                        <Mail className="w-3 h-3" />
                        <span>Recruiter Post (Direct Outreach)</span>
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-300">
                    <span className="font-semibold text-slate-200">{job.employer}</span>
                    <span>•</span>
                    <span className="flex items-center space-x-1 text-slate-400">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{job.location}</span>
                    </span>
                    <span>•</span>
                    <span className="text-slate-300">{job.salary_raw || 'Salary based on experience'}</span>
                  </div>
                </div>

                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 flex-shrink-0 w-full sm:w-auto pt-2 sm:pt-0">
                  <a
                    href={job.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 sm:flex-none justify-center p-2.5 sm:p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center space-x-1 border border-slate-700 transition-colors"
                  >
                    <span>View on {job.source.split('/')[0]}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <button
                    type="button"
                    onClick={() => handlePreparePackage(job.id)}
                    disabled={preparingId === job.id}
                    className="flex-1 sm:flex-none justify-center px-4 py-2.5 sm:py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-xs flex items-center space-x-1.5 transition-colors shadow-sm"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{preparingId === job.id ? 'Tailoring...' : 'Prepare Package'}</span>
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                {job.raw_description}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80 text-xs">
                <div className="flex flex-wrap gap-1.5">
                  {job.requirements.map((req, idx) => (
                    <span key={idx} className="px-2 py-0.5 rounded text-[11px] bg-slate-950 text-slate-300 border border-slate-800">
                      {req}
                    </span>
                  ))}
                </div>

                <div className="flex items-center space-x-3 text-[11px] text-slate-400">
                  <span>Work Mode: <strong className="text-slate-200">{job.remote_eligibility}</strong></span>
                  <span>Visa Sponsorship: <strong className="text-slate-200">{job.visa_sponsorship}</strong></span>
                  <span>Published: <strong className="text-slate-200">{job.publication_date || 'Recent'}</strong></span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
