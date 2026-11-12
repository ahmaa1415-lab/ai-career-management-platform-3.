'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { optimizeLinkedInProfile, LinkedInOptimizationResult } from '@/lib/ai/linkedin-optimizer';
import {
  Share2,
  Copy,
  Check,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  Eye,
  Zap,
  Briefcase,
  Layers,
  Send,
  Mail,
  MapPin,
  ExternalLink,
  Building,
  Clock,
  ChevronRight,
  RefreshCw,
  Search
} from 'lucide-react';

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

const CHALHOUB_SAMPLE = `✨ Exciting Career Opportunity in Dubai Design District!

Chalhoub Group is expanding our Beauty division. We are scouting for an exceptional **Category Manager – Prestige Beauty & Personal Care**.

Key Requirements:
- 5+ years leading category strategy, brand partnerships & assortment planning in Cosmetics/Personal Care.
- Demonstrated distributor & supplier commercial management.
- Location: Dubai Design District (Hybrid 4/1).

Candidates must apply through our official career portal:
🌐 https://careers.chalhoubgroup.com/job/cat-mgr-luxury-beauty-2026
Feel free to drop me a direct message here on LinkedIn once submitted!

#ChalhoubGroup #BeautyCareers #CategoryManager #DubaiJobs #LuxuryRetail`;

const NOON_SAMPLE = `🚀 We are hiring at noon! Downtown Dubai E-Commerce Hub.

Our Grocery & FMCG business is scaling rapidly across UAE and KSA.
Looking for a high-impact **Senior Category Manager – Personal Care & FMCG**.

What we're looking for:
- 6+ years in commercial category management, Joint Business Planning (JBP), and distributor execution.
- Proven track record handling multinational or fast-moving consumer brands (FMCG, OTC Health, Personal Care).
- Data-driven mindset, high-velocity pricing & promotion strategies.

DM me directly on LinkedIn with your CV or send it straight to my inbox: omar.farooq@noon.com.

#noon #Ecommerce #CategoryManager #HiringDubai #FMCG`;

export default function LinkedInPage() {
  const [activeTab, setActiveTab] = useState<'scout' | 'parser' | 'seo'>('scout');
  const [seoData, setSeoData] = useState<LinkedInOptimizationResult | null>(null);
  const [candidateProfile, setCandidateProfile] = useState<any>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Autonomous Scout state
  const [isScouting, setIsScouting] = useState(false);
  const [scoutResult, setScoutResult] = useState<any>(null);
  const [connectionInfo, setConnectionInfo] = useState<any>(null);

  // Parser state
  const [rawPostText, setRawPostText] = useState('');
  const [parsingPost, setParsingPost] = useState(false);
  const [parsedAnalysis, setParsedAnalysis] = useState<any>(null);
  const [applyingRole, setApplyingRole] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchProfileAndOptimize();
    fetchScoutConnection();
  }, []);

  const fetchProfileAndOptimize = async () => {
    try {
      const res = await fetch('/api/profile');
      if (res.ok) {
        const candidate = await res.json();
        setCandidateProfile(candidate);
        if (candidate.profile) {
          const opt = optimizeLinkedInProfile(candidate);
          setSeoData(opt);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchScoutConnection = async () => {
    try {
      const res = await fetch('/api/linkedin/scout-and-apply');
      if (res.ok) {
        const data = await res.json();
        setConnectionInfo(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleRunAutonomousScout = async () => {
    setIsScouting(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/linkedin/scout-and-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run_scout' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to execute LinkedIn scout');
      setScoutResult(data);
      setStatusMessage(`⚡ ${data.message}`);
    } catch (err: any) {
      setStatusMessage(`Scout Error: ${err.message}`);
    } finally {
      setIsScouting(false);
    }
  };

  const handleParsePost = async () => {
    if (!rawPostText.trim()) return;
    setParsingPost(true);
    setStatusMessage(null);
    setParsedAnalysis(null);

    try {
      const res = await fetch('/api/linkedin/parse-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_text: rawPostText,
          auto_index: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to parse post');

      setParsedAnalysis(data.analysis);
      setStatusMessage(`✓ Extracted ${data.analysis?.extracted_roles?.length || 0} distinct openings from ${data.analysis?.employer || 'Recruiter'} in ${data.analysis?.location || 'Dubai'}!`);
    } catch (err: any) {
      setStatusMessage(`Parse Error: ${err.message}`);
    } finally {
      setParsingPost(false);
    }
  };

  const handleDirectAutoApply = async (roleTitle: string) => {
    if (!rawPostText.trim()) return;
    setApplyingRole(roleTitle);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/linkedin/parse-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_text: rawPostText,
          auto_index: true,
          auto_apply_role: roleTitle,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to auto-apply');

      setStatusMessage(`🎉 ${data.message || `Successfully dispatched tailored application for ${roleTitle}!`}`);
      // Refresh connection and parse analysis
      if (data.analysis) {
        setParsedAnalysis(data.analysis);
      }
    } catch (err: any) {
      setStatusMessage(`Application Error: ${err.message}`);
    } finally {
      setApplyingRole(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="LinkedIn Scout & Post Parser"
        subtitle="Autonomous hiring post scouting, multi-role disaggregation, multi-channel auto-apply, and recruiter SEO"
      />

      <div className="p-4 sm:p-6 md:p-8 max-w-7xl space-y-6 w-full">
        {/* Navigation Tabs */}
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab('scout')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'scout'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-300" />
            <span>Autonomous Scout & Apply</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('parser')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'parser'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-cyan-300" />
            <span>Ingest & Parse Recruiter Posts</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('seo')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'seo'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
            <span>Profile SEO & Headlines</span>
          </button>
        </div>

        {/* Global Action Banner */}
        {statusMessage && (
          <div className="p-4 rounded-xl text-xs font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center justify-between shadow-sm animate-fadeIn">
            <span className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
              <span>{statusMessage}</span>
            </span>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-slate-400 hover:text-white text-xs font-bold ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* TAB 1: AUTONOMOUS LINKEDIN SCOUT & APPLY */}
        {activeTab === 'scout' && (
          <div className="space-y-6">
            {/* Connection Status Card */}
            <div className="bg-gradient-to-br from-slate-900 via-blue-950/20 to-slate-900 border border-blue-500/30 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${connectionInfo?.connection?.is_live ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`}></span>
                    <span className="text-[11px] font-extrabold uppercase tracking-widest text-emerald-400">
                      Autonomous Scout Engine {connectionInfo?.connection?.is_live ? 'Active' : 'Ready'}
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-black text-white">
                    Account: {connectionInfo?.connection?.account_name || candidateProfile?.profile?.full_name || 'Active Candidate'}
                  </h3>
                  <p className="text-xs text-slate-300">
                    LinkedIn: <a href={connectionInfo?.connection?.profile_url || candidateProfile?.profile?.linkedin_url || 'https://linkedin.com'} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">{connectionInfo?.connection?.profile_url || candidateProfile?.profile?.linkedin_url || 'https://linkedin.com'}</a>
                    {candidateProfile?.profile?.email && (
                      <span> • Email: <span className="text-slate-200 font-mono">{candidateProfile.profile.email}</span></span>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>{connectionInfo?.connection?.status || 'Active Agent Access'}</span>
                  </span>
                </div>
              </div>

              {/* Target Search Queries & Multi-Channel Pipeline */}
              <div className="mt-5 pt-5 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                    <Search className="w-3.5 h-3.5 text-blue-400" />
                    <span>Target Query Matrix ({candidateProfile?.profile?.headline || 'Active Specialization'})</span>
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {(candidateProfile?.profile?.target_roles?.length > 0
                      ? candidateProfile.profile.target_roles.slice(0, 4).map((r: string) => `#Hiring #${r.replace(/\s+/g, '')} ${candidateProfile.location?.target_countries?.[0] || 'Remote'}`)
                      : [
                          '#Hiring Senior Roles GCC',
                          '#Hiring Opportunities Remote',
                          'Direct Recruiter Posts UAE'
                        ]
                    ).map((q: string, idx: number) => (
                      <span key={idx} className="text-[11px] font-mono px-2.5 py-1 rounded-md bg-slate-950 text-slate-300 border border-slate-800">
                        {q}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                    <Layers className="w-3.5 h-3.5 text-emerald-400" />
                    <span>3-Way Multi-Channel Autonomous Dispatch</span>
                  </h4>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <Mail className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                      <span className="text-[10px] font-bold text-slate-200 block">Direct Email</span>
                      <span className="text-[9px] text-slate-400">Recruiter Inbox</span>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <Building className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                      <span className="text-[10px] font-bold text-slate-200 block">Company Portals</span>
                      <span className="text-[9px] text-slate-400">Workday / Taleo</span>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <Share2 className="w-4 h-4 text-indigo-400 mx-auto mb-1" />
                      <span className="text-[10px] font-bold text-slate-200 block">LinkedIn Outreach</span>
                      <span className="text-[9px] text-slate-400">Hiring Manager DM</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Launch Autonomous Scout Button */}
              <div className="mt-5">
                <button
                  type="button"
                  onClick={handleRunAutonomousScout}
                  disabled={isScouting}
                  className="w-full py-3.5 px-6 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-black rounded-xl text-xs sm:text-sm flex items-center justify-center space-x-2.5 transition-all shadow-lg shadow-blue-500/20 cursor-pointer"
                >
                  <Zap className={`w-4 h-4 ${isScouting ? 'animate-bounce text-amber-300' : 'text-amber-300'}`} />
                  <span>{isScouting ? 'Agent Searching LinkedIn & Dispatching Across Channels...' : `🚀 Launch Autonomous LinkedIn Search & Apply${candidateProfile?.profile?.full_name ? ` for ${candidateProfile.profile.full_name}` : ''}`}</span>
                </button>
              </div>
            </div>

            {/* Discovered Posts & Dispatched Applications Results */}
            {scoutResult && scoutResult.dispatched_applications && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Autonomous Applications Dispatched ({scoutResult.dispatched_applications.length})</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Tailored CVs generated and sent across all detected recruiter contact points
                    </p>
                  </div>
                  <div className="flex items-center space-x-3 text-xs bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
                    <span className="text-blue-400 font-bold">✉️ {scoutResult.channel_summary?.gmail_direct_emails} Gmail</span>
                    <span className="text-emerald-400 font-bold">🌐 {scoutResult.channel_summary?.company_portals_submitted} Portals</span>
                    <span className="text-indigo-400 font-bold">💬 {scoutResult.channel_summary?.linkedin_dms_sent} InMails</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {scoutResult.dispatched_applications.map((app: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-4 bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-xl space-y-3 transition-all flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{app.employer}</span>
                            <h4 className="text-xs font-bold text-white line-clamp-1">{app.role}</h4>
                            <span className="text-[10px] text-slate-400 flex items-center space-x-1 mt-0.5">
                              <MapPin className="w-3 h-3 text-slate-400" />
                              <span>{app.location}</span>
                            </span>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex-shrink-0">
                            {app.match_score}% Match
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-300 bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 font-medium space-y-1">
                          <span className="text-blue-400 font-bold block">{app.channel_label}</span>
                          <p className="text-slate-400 text-[10px] line-clamp-2">{app.notes}</p>
                          {app.details?.confirmation_number && (
                            <div className="text-[10px] text-emerald-400 font-mono pt-1">
                              Ref: {app.details.confirmation_number}
                            </div>
                          )}
                          {app.details?.email_to && (
                            <div className="text-[10px] text-slate-400 font-mono pt-1 truncate">
                              To: {app.details.email_to}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
                        <span className="text-[10px] text-emerald-400 font-semibold flex items-center space-x-1">
                          <Check className="w-3 h-3" />
                          <span>Status: {app.status}</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(app.applied_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: INGEST & PARSE RECRUITER POSTS */}
        {activeTab === 'parser' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-blue-400" />
                    <span>LinkedIn Hiring Post Ingestion & Multi-Role Parser</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Paste any recruiter or founder announcement. The AI automatically splits multiple roles, extracts recruiter contacts, tailors CVs, and auto-applies directly.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setRawPostText(OURSHOPEE_SAMPLE)}
                    className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                  >
                    Ourshopee (Dubai)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRawPostText(CHALHOUB_SAMPLE)}
                    className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                  >
                    Chalhoub (Beauty)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRawPostText(NOON_SAMPLE)}
                    className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                  >
                    noon (FMCG)
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <textarea
                  value={rawPostText}
                  onChange={(e) => setRawPostText(e.target.value)}
                  placeholder="Paste any LinkedIn hiring post here..."
                  rows={6}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleParsePost}
                  disabled={parsingPost || !rawPostText.trim()}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center space-x-2 transition-colors shadow-md shadow-blue-500/20 cursor-pointer"
                >
                  <Layers className={`w-3.5 h-3.5 ${parsingPost ? 'animate-spin' : ''}`} />
                  <span>{parsingPost ? 'Parsing Post & Extracting Vacancies...' : '🤖 Parse Post & Disaggregate Openings'}</span>
                </button>

                {rawPostText && (
                  <button
                    type="button"
                    onClick={() => {
                      setRawPostText('');
                      setParsedAnalysis(null);
                    }}
                    className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 bg-slate-800 rounded-lg"
                  >
                    Clear Post
                  </button>
                )}
              </div>

              {/* Render Disaggregated Openings */}
              {parsedAnalysis && (
                <div className="mt-6 pt-5 border-t border-slate-800 space-y-4 animate-fadeIn">
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
                        <span>Direct Recruiter: <strong className="text-emerald-400">{parsedAnalysis.recruiter_email}</strong></span>
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

                  <div>
                    <h4 className="text-xs font-bold text-slate-300 mb-3 flex items-center space-x-2">
                      <Briefcase className="w-3.5 h-3.5 text-blue-400" />
                      <span>Extracted Vacancies ({parsedAnalysis.extracted_roles?.length || 0} Openings Found)</span>
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {parsedAnalysis.extracted_roles?.map((role: any, idx: number) => (
                        <div
                          key={idx}
                          className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 hover:border-blue-500/40 transition-colors flex flex-col justify-between"
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h5 className="text-sm font-bold text-white">{role.title}</h5>
                                <span className="text-[11px] text-slate-400">{parsedAnalysis.employer} • {parsedAnalysis.location}</span>
                              </div>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                {role.title.toLowerCase().includes('category') ? '98% Match' : '88% Match'}
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
                              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-xs flex items-center space-x-1.5 transition-colors shadow-sm flex-shrink-0 cursor-pointer"
                            >
                              <Send className="w-3 h-3" />
                              <span>{applyingRole === role.title ? 'Dispatching...' : '⚡ Apply to Recruiter'}</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: PROFILE SEO & HEADLINES */}
        {activeTab === 'seo' && seoData && (
          <div className="space-y-6">
            {/* Assessment Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20 flex-shrink-0">
                    <Share2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">LinkedIn Recruiter Visibility Score</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{seoData.current_assessment.keyword_strength}</p>
                  </div>
                </div>
                <div className="text-left sm:text-right">
                  <span className="text-3xl font-extrabold text-emerald-400">{seoData.current_assessment.visibility_score}%</span>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">Algorithm Index</p>
                </div>
              </div>
            </div>

            {/* Headline Options */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>Copy-Ready Headline Options (Optimized for Recruiter Search & 220 Char Limit)</span>
              </h3>

              <div className="space-y-3">
                {seoData.copy_ready_content.headline_options.map((opt, idx) => (
                  <div key={idx} className="p-4 bg-slate-950/60 rounded-lg border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-emerald-400">{opt.style}</span>
                      <div className="flex items-center space-x-3">
                        <span className="text-slate-400 text-[11px]">{opt.character_count}/220 chars</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(opt.headline, `h_${idx}`)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs flex items-center space-x-1 cursor-pointer"
                        >
                          {copiedKey === `h_${idx}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedKey === `h_${idx}` ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-200 font-mono select-all bg-slate-900 p-2.5 rounded border border-slate-800">
                      {opt.headline}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* About Section */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>Optimized "About" Section (Story, Tech Stack & Clear CTA)</span>
                </h3>
                <button
                  type="button"
                  onClick={() => handleCopy(seoData.copy_ready_content.about_section, 'about')}
                  className="w-full sm:w-auto px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded text-xs flex items-center justify-center space-x-1.5 transition-colors shadow-sm cursor-pointer"
                >
                  {copiedKey === 'about' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'about' ? 'Copied' : 'Copy About Section'}</span>
                </button>
              </div>

              <pre className="text-xs font-mono text-slate-300 bg-slate-950/70 p-4 rounded-lg border border-slate-800 whitespace-pre-wrap leading-relaxed select-all">
                {seoData.copy_ready_content.about_section}
              </pre>
            </div>

            {/* Recruiter Visibility Checklist */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Eye className="w-4 h-4 text-emerald-400" />
                <span>Recruiter Visibility Action Checklist</span>
              </h3>

              <div className="space-y-2.5">
                {seoData.recruiter_visibility_checklist.map((item, idx) => (
                  <div key={idx} className="p-3.5 bg-slate-950/60 rounded-lg border border-slate-800 flex items-start justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-200">{item.item}</span>
                      <p className="text-xs text-slate-400 mt-0.5">{item.action}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                      item.importance === 'Critical'
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    }`}>
                      {item.importance}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
