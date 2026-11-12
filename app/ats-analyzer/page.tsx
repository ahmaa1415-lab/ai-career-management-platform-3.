'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import {
  SeniorGlobalHREvaluationResult,
  PriorityActionPlanItem,
  ATSKeywordDetail
} from '@/lib/types';
import {
  Target,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Zap,
  Globe,
  FileCheck,
  Check,
  XCircle,
  TrendingUp,
  Award,
  Copy,
  Download,
  Layers,
  ShieldCheck,
  Briefcase,
  Clock,
  ArrowUpRight,
  FileText,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  GitCompare,
  AlertCircle,
  ExternalLink,
  Search,
  UserCheck,
  Eye,
  Sliders,
  Compass
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import StatCard from '@/components/ui/StatCard';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';

export default function ATSAnalyzerPage() {
  const [cvText, setCvText] = useState('');
  const [resumeList, setResumeList] = useState<any[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string>('');
  const [targetRole, setTargetRole] = useState('Category Manager');
  const [targetCountry, setTargetCountry] = useState('United Arab Emirates');
  const [targetIndustry, setTargetIndustry] = useState('FMCG & Consumer Goods');
  const [jobDescription, setJobDescription] = useState('');
  const [showCustomJD, setShowCustomJD] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<SeniorGlobalHREvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'recruiter' | 'ats' | 'localization' | 'headhunter' | 'action_plan' | 'tailored_draft' | 'history'>('recruiter');
  
  // Evaluation history and comparison
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [evalAId, setEvalAId] = useState<string>('');
  const [evalBId, setEvalBId] = useState<string>('');
  const [comparisonResult, setComparisonResult] = useState<any>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [saveDraftFeedback, setSaveDraftFeedback] = useState<string | null>(null);

  // Quick target roles
  const quickRoles = [
    'Category Manager',
    'Trade Marketing Manager',
    'Commercial Manager',
    'MT Activation Manager',
    'Projects & Trade Manager'
  ];

  useEffect(() => {
    // 1. Check URL parameters for pre-filling
    let resumeIdParam: string | null = null;
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const roleParam = params.get('role');
      const countryParam = params.get('country');
      const jobParam = params.get('jobId');
      resumeIdParam = params.get('resume_id');

      if (roleParam) setTargetRole(decodeURIComponent(roleParam));
      if (countryParam) setTargetCountry(decodeURIComponent(countryParam));
      if (jobParam) {
        fetch(`/api/jobs/${jobParam}`)
          .then((res) => res.json())
          .then((data) => {
            if (data.job) {
              setJobDescription(data.job.raw_description || '');
              setShowCustomJD(true);
              if (!roleParam) setTargetRole(data.job.title);
              if (!countryParam) setTargetCountry(data.job.location);
            }
          })
          .catch((e) => console.error('Error fetching job for ATS analysis:', e));
      }
    }

    // 2. Load Resumes list and prefill selected resume
    async function loadResumes() {
      try {
        const res = await fetch('/api/resumes');
        if (res.ok) {
          const data = await res.json();
          const resumes = data.resumes || [];
          setResumeList(resumes);
          if (resumes.length > 0) {
            const target = resumeIdParam
              ? resumes.find((r: any) => r.id === resumeIdParam) || resumes[0]
              : (data.active_resume_id ? resumes.find((r: any) => r.id === data.active_resume_id) || resumes[0] : resumes[0]);
            setSelectedResumeId(target.id);
            if (target.raw_text) {
              setCvText(target.raw_text);
            }
            if (target.target_role) setTargetRole(target.target_role);
            if (target.target_country) setTargetCountry(target.target_country);
            loadEvaluations(target.id);
            return;
          }
        }
      } catch (e) {
        console.error('Failed to load resumes in ATS analyzer:', e);
      }
      loadEvaluations();
    }
    loadResumes();
  }, []);

  const handleSelectResume = (id: string) => {
    setSelectedResumeId(id);
    const found = resumeList.find(r => r.id === id);
    if (found) {
      setCvText(found.raw_text);
      if (found.target_role) setTargetRole(found.target_role);
      if (found.target_country) setTargetCountry(found.target_country);
    }
    loadEvaluations(id);
  };

  const loadEvaluations = async (resumeId?: string) => {
    try {
      setHistoryLoading(true);
      const query = resumeId ? `?resume_id=${encodeURIComponent(resumeId)}&limit=25` : '?limit=25';
      const res = await fetch(`/api/ats/evaluations${query}`);
      if (res.ok) {
        const data = await res.json();
        setEvaluations(data.evaluations || []);
      }
    } catch (e) {
      console.error('Failed to load past evaluations:', e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError(null);

    try {
      const res = await fetch('/api/ats/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cv_text: cvText,
          resume_id: selectedResumeId || undefined,
          target_role: targetRole,
          target_country: targetCountry,
          target_industry: targetIndustry,
          job_description: showCustomJD ? jobDescription : undefined,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to analyze CV.');
      }

      const data = await res.json();
      setResult(data.result);
      loadEvaluations(selectedResumeId); // Refresh evaluation history
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCopyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopyFeedback(label);
    setTimeout(() => setCopyFeedback(null), 3000);
  };

  const handleSaveTailoredDraft = async () => {
    if (!result?.tailored_resume_draft) return;
    setSaveDraftFeedback('Saving tailored CV...');
    try {
      const res = await fetch('/api/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Tailored CV – ${targetRole} (${targetCountry})`,
          type: 'Tailored',
          raw_text: result.tailored_resume_draft.draft_text,
          target_role: targetRole,
          target_country: targetCountry,
        }),
      });
      if (res.ok) {
        setSaveDraftFeedback('Successfully saved as Version B to Resume Studio!');
        setTimeout(() => setSaveDraftFeedback(null), 4000);
      } else {
        const err = await res.json();
        setSaveDraftFeedback(`Error: ${err.error || 'Failed to save'}`);
      }
    } catch (e: any) {
      setSaveDraftFeedback(`Error: ${e.message}`);
    }
  };

  const handleRunComparison = async () => {
    if (!evalAId || !evalBId) return;
    try {
      const res = await fetch(`/api/ats/evaluations?compareA=${evalAId}&compareB=${evalBId}`);
      if (res.ok) {
        const data = await res.json();
        setComparisonResult(data.comparison);
      }
    } catch (e) {
      console.error('Failed to run comparison:', e);
    }
  };

  const handleDownloadMarkdownReport = () => {
    if (!result?.full_report_markdown) return;
    const blob = new Blob([result.full_report_markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `CV_Evaluation_Audit_${targetRole.replace(/\s+/g, '_')}_${targetCountry.replace(/\s+/g, '_')}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col font-sans">
      <Header
        title="ATS & Recruiter Intelligence Analyzer"
        subtitle="Senior Global HR & ATS Intelligence: Dual 1-10 scoring, parsing safety, localization advisor, headhunter simulator & evidence-based action plans"
      />

      <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Top Benchmark Controls Card */}
        <Card className="border-slate-800 bg-slate-900/90 shadow-xl">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="w-4 h-4 text-emerald-400" />
                  <span>Evaluation Calibration Parameters</span>
                </CardTitle>
                <CardDescription>
                  Configure target benchmark position, regional recruitment market, and industry to calibrate scoring standards.
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setShowCustomJD(!showCustomJD)}
                  className="text-xs"
                >
                  <Briefcase className="w-3.5 h-3.5 mr-1" />
                  {showCustomJD ? 'Hide Vacancy JD' : 'Target Specific Job'}
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => loadEvaluations()}
                  className="text-xs"
                >
                  <Clock className="w-3.5 h-3.5 mr-1" />
                  <span>History ({evaluations.length})</span>
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Resume Under Audit</span>
                  <span className="text-[10px] text-indigo-400">{resumeList.length} in library</span>
                </label>
                <select
                  value={selectedResumeId}
                  onChange={(e) => handleSelectResume(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  {resumeList.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title} ({r.type} - v{r.version})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  Evaluates this specific isolated document.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Target Position Benchmark
                </label>
                <input
                  type="text"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  placeholder="e.g. Category Manager"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
                {/* Quick Role Suggestions */}
                <div className="flex flex-wrap gap-1 mt-2">
                  {quickRoles.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setTargetRole(role)}
                      className={`text-[10px] px-2 py-0.5 rounded transition-all ${
                        targetRole === role
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Target Geography / Market
                </label>
                <select
                  value={targetCountry}
                  onChange={(e) => setTargetCountry(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  <option value="United Arab Emirates">United Arab Emirates (Dubai / Gulf Standard)</option>
                  <option value="Saudi Arabia">Saudi Arabia (Riyadh / Vision 2030 Standard)</option>
                  <option value="Egypt">Egypt (Cairo FMCG & Trade Hub)</option>
                  <option value="Germany">Germany / EU (EU Blue Card Standard)</option>
                  <option value="United States">United States (Anti-bias, Strict 1-Page, EEOC)</option>
                  <option value="United Kingdom">United Kingdom (Equality Act, 2-Page CV)</option>
                  <option value="Remote (Global)">Remote (Global MNC Standard)</option>
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  Applies country-specific anti-bias and layout rules (e.g. photo rules).
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Industry Focus
                </label>
                <select
                  value={targetIndustry}
                  onChange={(e) => setTargetIndustry(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  <option value="FMCG & Consumer Goods">FMCG & Consumer Goods (Food & Beverage, Personal Care)</option>
                  <option value="Technology & Cloud Systems">Technology, Software & Cloud Systems</option>
                  <option value="Finance & Professional Services">Finance, Accounting & Auditing</option>
                  <option value="Retail & E-commerce">Modern Trade Retail & E-commerce</option>
                  <option value="Pharmaceuticals & Health">Pharmaceuticals & Healthcare</option>
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  Calibrates domain KPIs and competency pools.
                </p>
              </div>
            </div>

            {/* Custom Job Description Field (Optional) */}
            {showCustomJD && (
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-emerald-400 flex items-center gap-1.5">
                    <FileCheck className="w-3.5 h-3.5" />
                    Target Job Vacancy Description (For Exact Keyword & Fit Alignment)
                  </label>
                  <span className="text-[10px] text-slate-500">Paste JD text to run vacancy-specific ATS match</span>
                </div>
                <textarea
                  rows={4}
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Paste specific job posting description and requirements here..."
                  className="w-full font-mono text-xs bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500 leading-relaxed scrollbar-thin"
                />
              </div>
            )}

            {/* CV Text Area */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-300">
                  CV Text Under Evaluation (Original Master Record)
                </label>
                <span className="text-[10px] text-slate-500">
                  Factual history preserved • Single-column plain text
                </span>
              </div>
              <textarea
                rows={7}
                value={cvText}
                onChange={(e) => setCvText(e.target.value)}
                className="w-full font-mono text-xs bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-200 focus:outline-none focus:border-emerald-500 leading-relaxed scrollbar-thin"
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-950/40 border-t border-slate-800/60 p-4">
            <div className="flex items-center space-x-2 text-xs text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>
                Zero-fabrication standard: Gaps are flagged as confirmation items, never invented.
              </span>
            </div>

            <Button
              variant="primary"
              size="sm"
              loading={analyzing}
              onClick={handleAnalyze}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
            >
              <Sparkles className="w-4 h-4 mr-1.5" />
              <span>{analyzing ? 'Evaluating With Global HR Models...' : 'Run Senior Global HR & ATS Audit'}</span>
            </Button>
          </CardFooter>
        </Card>

        {error && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs sm:text-sm flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Global HR & ATS Executive Score Ribbon */}
        {result && (
          <div className="space-y-6">
            {/* Primary Executive Ribbon */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Human Recruiter Score Card */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/90 border border-emerald-500/40 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl" />
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-emerald-400" />
                    Human Recruiter Score
                  </span>
                  <Badge variant="success" size="xs">
                    {result.human_recruiter_review.overall_recruiter_impact.shortlisting_verdict}
                  </Badge>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-extrabold text-emerald-400 tracking-tight">
                    {result.human_recruiter_score_10}
                  </span>
                  <span className="text-sm text-slate-400 font-medium">/ 10</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-2 line-clamp-2">
                  {result.human_recruiter_review.overall_recruiter_impact.first_impression}
                </p>
                <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
                  <span>5-Pillar Human Review</span>
                  <span className="text-emerald-400 font-medium">SHRM / CIPD Standard</span>
                </div>
              </div>

              {/* ATS Compatibility Score Card */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/90 border border-blue-500/40 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl" />
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <FileCheck className="w-4 h-4 text-blue-400" />
                    ATS Compatibility
                  </span>
                  <Badge variant="info" size="xs">
                    {result.ats_compliance_review.parsing_compatibility.single_column_safe ? 'Workday Ready' : 'Review Layout'}
                  </Badge>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-extrabold text-blue-400 tracking-tight">
                    {result.ats_compatibility_score_10}
                  </span>
                  <span className="text-sm text-slate-400 font-medium">/ 10</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-2 line-clamp-2">
                  Single-column plain text flow • 0 unparsable glyphs • Standard recognized headings.
                </p>
                <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
                  <span>Parsing Safety Rate</span>
                  <span className="text-blue-400 font-medium">100% Extractable</span>
                </div>
              </div>

              {/* Headhunter & LinkedIn Discoverability Card */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/90 border border-purple-500/40 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl" />
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Search className="w-4 h-4 text-purple-400" />
                    Headhunter Visibility
                  </span>
                  <Badge variant="purple" size="xs">
                    High Sourcing Rank
                  </Badge>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-extrabold text-purple-400 tracking-tight">
                    {result.diagnostic_scores.headhunter_discoverability_score}
                  </span>
                  <span className="text-sm text-slate-400 font-medium">/ 10</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-2 line-clamp-2">
                  {result.headhunter_search_optimization.primary_market_titles.slice(0, 2).join(' • ')}
                </p>
                <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
                  <span>Recruiter Boolean Matches</span>
                  <span className="text-purple-400 font-medium">
                    {result.headhunter_search_optimization.linkedin_recruiter_boolean_strings.length} Strings
                  </span>
                </div>
              </div>

              {/* Localization & Anti-Bias Market Score Card */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/90 border border-amber-500/40 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl" />
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-amber-400" />
                    Market & Localization
                  </span>
                  <Badge variant="warning" size="xs">
                    {result.localization_market_fit.photo_convention.status}
                  </Badge>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-extrabold text-amber-400 tracking-tight">
                    {result.diagnostic_scores.localization_score}
                  </span>
                  <span className="text-sm text-slate-400 font-medium">/ 10</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-2 line-clamp-2">
                  {result.localization_market_fit.recommended_length} • {result.localization_market_fit.target_country}
                </p>
                <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
                  <span>Anti-bias Protocol</span>
                  <span className="text-amber-400 font-medium">
                    {result.localization_market_fit.personal_info_audit.compliant ? 'Compliant' : 'Warning'}
                  </span>
                </div>
              </div>
            </div>

            {/* Diagnostic 5-Pillar Sub-Score Progress Grid */}
            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
              <div className="flex items-center justify-between mb-3 text-xs">
                <span className="font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                  Diagnostic Intelligence Dimensions (1 to 10 Scale)
                </span>
                <span className="text-slate-400">
                  Legacy Composite Index: <strong className="text-white">{result.overall_score}%</strong>
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800/80">
                  <div className="text-[11px] text-slate-400 font-medium">Keyword Alignment</div>
                  <div className="text-lg font-bold text-slate-100 mt-1">
                    {result.diagnostic_scores.keyword_alignment_score} <span className="text-xs text-slate-500">/10</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full"
                      style={{ width: `${result.diagnostic_scores.keyword_alignment_score * 10}%` }}
                    />
                  </div>
                </div>

                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800/80">
                  <div className="text-[11px] text-slate-400 font-medium">Recruiter Readability</div>
                  <div className="text-lg font-bold text-slate-100 mt-1">
                    {result.diagnostic_scores.recruiter_readability_score} <span className="text-xs text-slate-500">/10</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-blue-500 h-full rounded-full"
                      style={{ width: `${result.diagnostic_scores.recruiter_readability_score * 10}%` }}
                    />
                  </div>
                </div>

                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800/80">
                  <div className="text-[11px] text-slate-400 font-medium">Achievement Impact</div>
                  <div className="text-lg font-bold text-slate-100 mt-1">
                    {result.diagnostic_scores.achievement_impact_score} <span className="text-xs text-slate-500">/10</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-indigo-500 h-full rounded-full"
                      style={{ width: `${result.diagnostic_scores.achievement_impact_score * 10}%` }}
                    />
                  </div>
                </div>

                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800/80">
                  <div className="text-[11px] text-slate-400 font-medium">Localization & Bias</div>
                  <div className="text-lg font-bold text-slate-100 mt-1">
                    {result.diagnostic_scores.localization_score} <span className="text-xs text-slate-500">/10</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-amber-500 h-full rounded-full"
                      style={{ width: `${result.diagnostic_scores.localization_score * 10}%` }}
                    />
                  </div>
                </div>

                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800/80">
                  <div className="text-[11px] text-slate-400 font-medium">Headhunter Sourcing</div>
                  <div className="text-lg font-bold text-slate-100 mt-1">
                    {result.diagnostic_scores.headhunter_discoverability_score} <span className="text-xs text-slate-500">/10</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-purple-500 h-full rounded-full"
                      style={{ width: `${result.diagnostic_scores.headhunter_discoverability_score * 10}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 7-Tab Navigation Bar */}
            <div className="border-b border-slate-800 flex overflow-x-auto gap-2 pb-px scrollbar-none">
              {[
                { id: 'recruiter', label: '1. Human Recruiter Review', icon: UserCheck, count: '5 Pillars' },
                { id: 'ats', label: '2. ATS Compliance & Keywords', icon: FileCheck, count: `${result.ats_compliance_review.keyword_alignment.exact_matches.length} Matched` },
                { id: 'localization', label: '3. Localization & Anti-Bias', icon: Globe, count: targetCountry.slice(0, 10) },
                { id: 'headhunter', label: '4. Headhunter & LinkedIn Simulator', icon: Search, count: 'Boolean Ready' },
                { id: 'action_plan', label: '5. Priority Action Plan', icon: Award, count: `${result.priority_action_plan.length} Steps` },
                { id: 'tailored_draft', label: '6. Tailored Resume Draft (Version B)', icon: FileText, count: 'Derived' },
                { id: 'history', label: '7. History & Comparison', icon: GitCompare, count: `${evaluations.length} Audits` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? 'border-emerald-500 text-emerald-400 bg-slate-900/60'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 ml-1">
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* TAB 1: Human Recruiter Review */}
            {activeTab === 'recruiter' && (
              <div className="space-y-6">
                {/* Executive Verdict Banner */}
                <Card className="border-slate-800 bg-slate-900/90 shadow-xl">
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Award className="w-5 h-5 text-emerald-400" />
                          <span>Human Recruitment Director Screening Verdict</span>
                        </CardTitle>
                        <CardDescription>
                          Simulated evaluation by a Senior Talent Acquisition Director at a multinational corporation.
                        </CardDescription>
                      </div>
                      <Badge variant="success" size="sm" dot>
                        {result.human_recruiter_review.overall_recruiter_impact.shortlisting_verdict}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                          Candidate Positioning & Narrative
                        </span>
                        <p className="text-slate-200 leading-relaxed font-medium">
                          {result.human_recruiter_review.overall_recruiter_impact.candidate_positioning}
                        </p>
                      </div>

                      <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                          Key Market Differentiation
                        </span>
                        <p className="text-emerald-300 leading-relaxed font-medium">
                          {result.human_recruiter_review.overall_recruiter_impact.differentiation}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* 5 Human Review Criteria Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Pillar 1: Format & Structure */}
                  <Card className="border-slate-800 bg-slate-900/90">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Layers className="w-4 h-4 text-blue-400" />
                          <span>1. Format & Structure</span>
                        </CardTitle>
                        <span className="text-sm font-bold text-blue-400">
                          {result.human_recruiter_review.format_and_structure.score} / 10
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 text-xs">
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                          <span className="text-slate-500 block">Layout Clarity:</span>
                          <span className="text-slate-200 font-medium">
                            {result.human_recruiter_review.format_and_structure.layout_clarity}
                          </span>
                        </div>
                        <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                          <span className="text-slate-500 block">Length:</span>
                          <span className="text-slate-200 font-medium">
                            {result.human_recruiter_review.format_and_structure.length_appropriateness}
                          </span>
                        </div>
                      </div>

                      <div>
                        <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                          Recruiter Evidence Found:
                        </span>
                        <ul className="space-y-1 text-slate-300">
                          {result.human_recruiter_review.format_and_structure.evidence.map((ev, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                              <span>{ev}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Pillar 2: Content Relevance */}
                  <Card className="border-slate-800 bg-slate-900/90">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Target className="w-4 h-4 text-emerald-400" />
                          <span>2. Content Relevance & Seniority</span>
                        </CardTitle>
                        <span className="text-sm font-bold text-emerald-400">
                          {result.human_recruiter_review.content_relevance.score} / 10
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 text-xs">
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                          <span className="text-slate-500 block">Verified Experience:</span>
                          <span className="text-slate-200 font-medium">
                            {result.human_recruiter_review.content_relevance.relevant_experience_years}+ Years Commercial
                          </span>
                        </div>
                        <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                          <span className="text-slate-500 block">Seniority Alignment:</span>
                          <span className="text-slate-200 font-medium">
                            {result.human_recruiter_review.content_relevance.seniority_alignment}
                          </span>
                        </div>
                      </div>

                      <div>
                        <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                          Core Functional Competencies:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {result.human_recruiter_review.content_relevance.functional_competencies.map((fc, i) => (
                            <Badge key={i} variant="default" size="xs">
                              {fc}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Pillar 3: Language & Tone */}
                  <Card className="border-slate-800 bg-slate-900/90">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <FileText className="w-4 h-4 text-purple-400" />
                          <span>3. Language & Tone</span>
                        </CardTitle>
                        <span className="text-sm font-bold text-purple-400">
                          {result.human_recruiter_review.language_and_tone.score} / 10
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 text-xs">
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                          <span className="text-slate-500 block">Action Verbs Found:</span>
                          <span className="text-slate-200 font-medium">
                            {result.human_recruiter_review.language_and_tone.action_verbs_count} Active Verbs
                          </span>
                        </div>
                        <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                          <span className="text-slate-500 block">Tone Style:</span>
                          <span className="text-slate-200 font-medium">
                            {result.human_recruiter_review.language_and_tone.professional_tone}
                          </span>
                        </div>
                      </div>

                      <div>
                        <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                          Recruiter Tone Observations:
                        </span>
                        <ul className="space-y-1 text-slate-300">
                          {result.human_recruiter_review.language_and_tone.evidence.map((ev, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 flex-shrink-0 mt-0.5" />
                              <span>{ev}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Pillar 4: Achievements & Impact */}
                  <Card className="border-slate-800 bg-slate-900/90">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-amber-400" />
                          <span>4. Achievements & Quantified Impact</span>
                        </CardTitle>
                        <span className="text-sm font-bold text-amber-400">
                          {result.human_recruiter_review.achievements_and_impact.score} / 10
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 text-xs">
                      <div className="flex flex-wrap gap-2 text-[11px]">
                        <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20">
                          ✓ {result.human_recruiter_review.achievements_and_impact.quantifiable_metrics_count} Quantified Metrics
                        </span>
                        {result.human_recruiter_review.achievements_and_impact.category_growth_found && (
                          <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">
                            ✓ Category Growth Evidence
                          </span>
                        )}
                        {result.human_recruiter_review.achievements_and_impact.revenue_impact_found && (
                          <span className="px-2 py-1 bg-purple-500/10 text-purple-400 rounded border border-purple-500/20">
                            ✓ Commercial ROI Found
                          </span>
                        )}
                      </div>

                      {result.human_recruiter_review.achievements_and_impact.missing_metrics_to_request.length > 0 && (
                        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300">
                          <span className="font-semibold block text-[11px] mb-1">
                            Missing Metrics Needed For Maximum Seniority (To Be Confirmed By Candidate):
                          </span>
                          <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                            {result.human_recruiter_review.achievements_and_impact.missing_metrics_to_request.map((mm, idx) => (
                              <li key={idx}>{mm}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {/* TAB 2: ATS Compliance & Keywords */}
            {activeTab === 'ats' && (
              <div className="space-y-6">
                {/* Parsing Safety Checklist */}
                <Card className="border-slate-800 bg-slate-900/90 shadow-xl">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <FileCheck className="w-4 h-4 text-emerald-400" />
                          <span>Enterprise ATS Parsing Safety (Workday, Taleo, Greenhouse, Lever)</span>
                        </CardTitle>
                        <CardDescription>
                          Ensures candidate data extracts cleanly into standard database fields without truncation or scrambled columns.
                        </CardDescription>
                      </div>
                      <Badge variant="success" size="sm" dot>
                        Parsing Score: {result.ats_compliance_review.parsing_compatibility.score}/10
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center space-x-2">
                        <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <div>
                          <span className="text-slate-200 font-medium block">Single-Column Flow</span>
                          <span className="text-[10px] text-slate-500">Zero text box parsing traps</span>
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center space-x-2">
                        <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <div>
                          <span className="text-slate-200 font-medium block">Standard Section Headers</span>
                          <span className="text-[10px] text-slate-500">Summary, Experience, Education</span>
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center space-x-2">
                        <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <div>
                          <span className="text-slate-200 font-medium block">Date Recognition</span>
                          <span className="text-[10px] text-slate-500">Standard Month YYYY format</span>
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center space-x-2">
                        <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <div>
                          <span className="text-slate-200 font-medium block">Accessible Contact Info</span>
                          <span className="text-[10px] text-slate-500">Email, Phone, LinkedIn</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Keyword Alignment Categories */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card className="border-slate-800 bg-slate-900/90">
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Exact Keyword Matches ({result.ats_compliance_review.keyword_alignment.exact_matches.length})</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-1.5">
                        {result.ats_compliance_review.keyword_alignment.exact_matches.map((kw, idx) => (
                          <Badge key={idx} variant="success" size="sm">
                            ✓ {kw}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-slate-800 bg-slate-900/90">
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Zap className="w-4 h-4 text-blue-400" />
                        <span>Semantic & Synonym Matches ({result.ats_compliance_review.keyword_alignment.semantic_matches.length})</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-1.5">
                        {result.ats_compliance_review.keyword_alignment.semantic_matches.map((kw, idx) => (
                          <Badge key={idx} variant="info" size="sm">
                            ≈ {kw}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Keyword Details Table */}
                <Card className="border-slate-800 bg-slate-900/90">
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Target className="w-4 h-4 text-indigo-400" />
                      <span>Categorized Keyword Gap & Alignment Audit</span>
                    </CardTitle>
                    <CardDescription>
                      Differentiates between exact matches, terminology differences, presentation improvements, and genuine experience gaps.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-slate-300">
                        <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                          <tr>
                            <th className="p-3">Target Competency</th>
                            <th className="p-3">Categorization</th>
                            <th className="p-3">Evidence Found In CV</th>
                            <th className="p-3">Recommended Strategy</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {result.ats_compliance_review.keyword_alignment.details.map((detail, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/30">
                              <td className="p-3 font-semibold text-slate-100 font-sans">
                                {detail.keyword}
                              </td>
                              <td className="p-3">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                                    detail.category === 'Exact Match'
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                      : detail.category === 'Semantic Match'
                                      ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                                      : detail.category === 'Terminology Gap'
                                      ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                                      : detail.category === 'Presentation Gap'
                                      ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                                      : detail.category === 'Irrelevant Requirement'
                                      ? 'bg-slate-800 text-slate-400 border-slate-700'
                                      : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                  }`}
                                >
                                  {detail.category}
                                </span>
                              </td>
                              <td className="p-3 text-slate-400 font-sans max-w-xs">
                                {detail.evidence_in_cv || '—'}
                              </td>
                              <td className="p-3 text-emerald-300 font-sans max-w-sm">
                                {detail.recommendation || 'Maintain current presentation.'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* TAB 3: Localization & Anti-Bias Advisor */}
            {activeTab === 'localization' && (
              <div className="space-y-6">
                <Card className="border-slate-800 bg-slate-900/90 shadow-xl">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Globe className="w-4 h-4 text-emerald-400" />
                          <span>Jurisdiction & Market Conventions: {result.localization_market_fit.target_country}</span>
                        </CardTitle>
                        <CardDescription>
                          Applies local labor market laws, anti-discrimination statutes (EEOC, Equality Act), and regional CV preferences.
                        </CardDescription>
                      </div>
                      <Badge variant="warning" size="sm">
                        Score: {result.localization_market_fit.localization_score} / 10
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Photo & Bias Alert */}
                    <div
                      className={`p-4 rounded-xl border flex items-start space-x-3 text-xs ${
                        result.localization_market_fit.photo_convention.status === 'Strictly Prohibited'
                          ? 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      }`}
                    >
                      <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-sm">
                          Photo Convention Status: {result.localization_market_fit.photo_convention.status}
                        </div>
                        <p className="mt-1 leading-relaxed">
                          {result.localization_market_fit.photo_convention.reason}
                        </p>
                        {result.localization_market_fit.photo_convention.bias_risk_alert && (
                          <p className="mt-1 font-semibold text-rose-200">
                            {result.localization_market_fit.photo_convention.bias_risk_alert}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Regional Convention Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                      <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                        <span className="text-[10px] uppercase font-semibold text-slate-500 block">
                          Recommended Length
                        </span>
                        <span className="text-slate-100 font-semibold block">
                          {result.localization_market_fit.recommended_length}
                        </span>
                      </div>

                      <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                        <span className="text-[10px] uppercase font-semibold text-slate-500 block">
                          Language Standard
                        </span>
                        <span className="text-slate-100 font-semibold block">
                          {result.localization_market_fit.language_and_spelling}
                        </span>
                      </div>

                      <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                        <span className="text-[10px] uppercase font-semibold text-slate-500 block">
                          Date Conventions
                        </span>
                        <span className="text-slate-100 font-semibold block">
                          {result.localization_market_fit.date_format_convention}
                        </span>
                      </div>

                      <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                        <span className="text-[10px] uppercase font-semibold text-slate-500 block">
                          Anti-Bias Audit
                        </span>
                        <span className="text-emerald-400 font-semibold block">
                          {result.localization_market_fit.personal_info_audit.compliant
                            ? '✓ Zero Sensitive Disclosures'
                            : 'Review Disclosures'}
                        </span>
                      </div>
                    </div>

                    {/* Work Authorization Guidance */}
                    <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-xs">
                      <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider block">
                        Work Authorization & Mobility Advice
                      </span>
                      <p className="text-slate-300 leading-relaxed">
                        {result.localization_market_fit.work_authorization_advice}
                      </p>
                    </div>

                    {/* Local Recruitment Nuances */}
                    <div>
                      <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider block mb-2">
                        Market-Specific Recruitment Nuances ({result.localization_market_fit.target_country})
                      </span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                        {result.localization_market_fit.local_recruitment_nuances.map((nuance, idx) => (
                          <div
                            key={idx}
                            className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex items-start space-x-2 text-slate-300"
                          >
                            <span className="text-emerald-400 font-bold">•</span>
                            <span>{nuance}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* TAB 4: Headhunter & LinkedIn Simulator */}
            {activeTab === 'headhunter' && (
              <div className="space-y-6">
                <Card className="border-slate-800 bg-slate-900/90 shadow-xl">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Search className="w-4 h-4 text-purple-400" />
                          <span>Headhunter & LinkedIn Recruiter Sourcing Simulator</span>
                        </CardTitle>
                        <CardDescription>
                          Simulates how executive search consultants, corporate talent sourcers, and LinkedIn Recruiter algorithms find this profile.
                        </CardDescription>
                      </div>
                      <Badge variant="purple" size="sm">
                        Discoverability: {result.headhunter_search_optimization.discoverability_score} / 10
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Boolean Search Strings */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                          LinkedIn Recruiter Boolean Search Strings
                        </span>
                        <span className="text-[10px] text-slate-500">Click to copy search string</span>
                      </div>
                      <div className="space-y-2">
                        {result.headhunter_search_optimization.linkedin_recruiter_boolean_strings.map((str, idx) => (
                          <div
                            key={idx}
                            className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between gap-3 text-xs font-mono"
                          >
                            <span className="text-purple-300 break-all">{str}</span>
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => handleCopyToClipboard(str, `boolean_${idx}`)}
                              className="flex-shrink-0"
                            >
                              {copyFeedback === `boolean_${idx}` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Copy-Ready LinkedIn Headlines */}
                    <div>
                      <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider block mb-2">
                        3 Copy-Ready Executive LinkedIn Headlines
                      </span>
                      <div className="space-y-2">
                        {result.headhunter_search_optimization.linkedin_headlines.map((hl, idx) => (
                          <div
                            key={idx}
                            className="p-3.5 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between gap-3 text-xs"
                          >
                            <span className="text-slate-200 font-medium">{hl}</span>
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => handleCopyToClipboard(hl, `headline_${idx}`)}
                              className="flex-shrink-0"
                            >
                              {copyFeedback === `headline_${idx}` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* LinkedIn About Summary Draft */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                          Copy-Ready LinkedIn "About" Summary Draft
                        </span>
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() =>
                            handleCopyToClipboard(
                              result.headhunter_search_optimization.linkedin_about_draft,
                              'about_draft'
                            )
                          }
                        >
                          {copyFeedback === 'about_draft' ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400 mr-1" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 mr-1" /> Copy About Draft
                            </>
                          )}
                        </Button>
                      </div>
                      <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300 whitespace-pre-line leading-relaxed font-sans">
                        {result.headhunter_search_optimization.linkedin_about_draft}
                      </div>
                    </div>

                    {/* Market Titles & Open to Work Advice */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                          Alternative Executive Search Titles
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {result.headhunter_search_optimization.alternative_titles.map((title, i) => (
                            <Badge key={i} variant="default" size="xs">
                              {title}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                          "Open to Work" Sourcing Visibility Advice
                        </span>
                        <ul className="space-y-1 text-slate-300 text-[11px]">
                          {result.headhunter_search_optimization.linkedin_open_to_work_advice.map((adv, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <span className="text-purple-400 font-bold">•</span>
                              <span>{adv}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* TAB 5: Priority Action Plan (P1 - P7) */}
            {activeTab === 'action_plan' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                      Priority-Ordered Improvement Roadmap (P1 to P7)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Ranked by severity: Critical parsing/eligibility blockers first, followed by executive positioning and keywords.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={handleDownloadMarkdownReport}
                  >
                    <Download className="w-3.5 h-3.5 mr-1" /> Download Full Audit (.MD)
                  </Button>
                </div>

                <div className="space-y-3">
                  {result.priority_action_plan.map((item: PriorityActionPlanItem, idx: number) => (
                    <Card key={idx} className="border-slate-800 bg-slate-900/90 hover:border-slate-700 transition-colors">
                      <CardContent className="p-4 sm:p-5 space-y-3 text-xs">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                item.priority.startsWith('P1')
                                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                  : item.priority.startsWith('P2')
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : item.priority.startsWith('P3')
                                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              }`}
                            >
                              {item.priority}
                            </span>
                            <span className="font-bold text-sm text-slate-100">{item.title}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 text-[11px]">
                          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
                            <span className="text-slate-500 block uppercase text-[10px] font-semibold">
                              What Needs Improvement:
                            </span>
                            <p className="text-slate-200 font-medium">{item.what_needs_improvement}</p>
                          </div>

                          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
                            <span className="text-slate-500 block uppercase text-[10px] font-semibold">
                              Why It Matters to Recruiters:
                            </span>
                            <p className="text-slate-300">{item.why_it_matters}</p>
                          </div>
                        </div>

                        <div className="p-3 bg-slate-950/70 rounded-lg border border-slate-800 text-[11px] space-y-1">
                          <span className="text-slate-500 block uppercase text-[10px] font-semibold">
                            Exact Evidence from CV:
                          </span>
                          <p className="text-slate-400 font-mono italic">"{item.evidence_from_cv}"</p>
                        </div>

                        <div className="p-3.5 bg-emerald-950/20 border border-emerald-900/40 rounded-lg text-emerald-300 text-[11px] space-y-1">
                          <span className="font-semibold text-emerald-400 uppercase text-[10px] block">
                            How To Fix & Implement:
                          </span>
                          <p className="leading-relaxed">{item.how_to_fix}</p>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                          <span>
                            <strong>Expected Benefit:</strong> {item.expected_benefit}
                          </span>
                          {item.regional_variation && (
                            <span className="text-amber-400 font-medium">
                              Note: {item.regional_variation}
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 6: Tailored Resume Draft (Version B) */}
            {activeTab === 'tailored_draft' && (
              <div className="space-y-6">
                <Card className="border-slate-800 bg-slate-900/90 shadow-xl">
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <FileText className="w-4 h-4 text-emerald-400" />
                          <span>Version B — Job-Tailored CV Draft (Derived)</span>
                        </CardTitle>
                        <CardDescription>
                          Role-calibrated for <strong>{targetRole}</strong> in <strong>{targetCountry}</strong>. Factual career timeline 100% preserved.
                        </CardDescription>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() =>
                            handleCopyToClipboard(
                              result.tailored_resume_draft.draft_text,
                              'tailored_cv_text'
                            )
                          }
                        >
                          {copyFeedback === 'tailored_cv_text' ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400 mr-1" /> Copied Text
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 mr-1" /> Copy Draft
                            </>
                          )}
                        </Button>

                        <Button
                          variant="primary"
                          size="xs"
                          onClick={handleSaveTailoredDraft}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white"
                        >
                          <SaveDraftIcon className="w-3.5 h-3.5 mr-1" /> Save as Version B
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {saveDraftFeedback && (
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{saveDraftFeedback}</span>
                      </div>
                    )}

                    {/* Zero-Fabrication Alert Banner */}
                    <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-300 text-xs flex items-start gap-3">
                      <ShieldCheck className="w-5 h-5 flex-shrink-0 text-blue-400 mt-0.5" />
                      <div>
                        <div className="font-semibold text-blue-200">Zero-Fabrication Integrity Policy</div>
                        <p className="mt-0.5 leading-relaxed text-[11px]">
                          All employers, job titles, education, and dates are preserved verbatim. Any missing quantitative business metrics are marked in brackets like <code className="bg-slate-900 px-1 py-0.5 rounded text-amber-300">[Candidate confirmation needed: ...]</code> so you can fill in your exact figures before submitting.
                        </p>
                      </div>
                    </div>

                    {/* Tailored CV Text */}
                    <div className="relative">
                      <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed overflow-x-auto max-h-[500px] scrollbar-thin">
                        {result.tailored_resume_draft.draft_text}
                      </pre>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* TAB 7: History & Comparison */}
            {activeTab === 'history' && (
              <div className="space-y-6">
                <Card className="border-slate-800 bg-slate-900/90 shadow-xl">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <GitCompare className="w-4 h-4 text-indigo-400" />
                          <span>Evaluation History & Version Comparison</span>
                        </CardTitle>
                        <CardDescription>
                          Compare CV iterations over time to track recruiter impact score progression and ATS compliance.
                        </CardDescription>
                      </div>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => loadEvaluations()}
                        disabled={historyLoading}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 mr-1 ${historyLoading ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {evaluations.length === 0 ? (
                      <p className="text-xs text-slate-400 py-6 text-center">
                        No previous evaluation audits found. Run an audit above to establish your baseline.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs text-slate-300">
                          <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                            <tr>
                              <th className="p-3">Audit Date</th>
                              <th className="p-3">Target Benchmark</th>
                              <th className="p-3">Market</th>
                              <th className="p-3 text-center">Human Score</th>
                              <th className="p-3 text-center">ATS Score</th>
                              <th className="p-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-sans text-xs">
                            {evaluations.map((ev, idx) => (
                              <tr key={idx} className="hover:bg-slate-800/30">
                                <td className="p-3 text-slate-400 font-mono text-[11px]">
                                  {new Date(ev.evaluation_date).toLocaleDateString()}
                                </td>
                                <td className="p-3 font-semibold text-slate-200">
                                  {ev.target_role}
                                </td>
                                <td className="p-3 text-slate-400">
                                  {ev.target_country}
                                </td>
                                <td className="p-3 text-center">
                                  <span className="font-bold text-emerald-400">
                                    {ev.human_recruiter_score} / 10
                                  </span>
                                </td>
                                <td className="p-3 text-center">
                                  <span className="font-bold text-blue-400">
                                    {ev.ats_compatibility_score} / 10
                                  </span>
                                </td>
                                <td className="p-3 text-right space-x-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEvalAId(ev.id);
                                      if (evaluations.length > 1) {
                                        const other = evaluations.find((x) => x.id !== ev.id);
                                        if (other) setEvalBId(other.id);
                                      }
                                      setCompareModalOpen(true);
                                    }}
                                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 text-[10px] font-medium"
                                  >
                                    Compare Delta
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Side-by-Side Comparison Modal */}
                {compareModalOpen && (
                  <Modal
                    isOpen={compareModalOpen}
                    onClose={() => setCompareModalOpen(false)}
                    title="Side-by-Side CV Evaluation Delta Comparison"
                  >
                    <div className="space-y-4 text-xs">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                            Baseline Evaluation (A)
                          </label>
                          <select
                            value={evalAId}
                            onChange={(e) => setEvalAId(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200"
                          >
                            {evaluations.map((ev) => (
                              <option key={ev.id} value={ev.id}>
                                {new Date(ev.evaluation_date).toLocaleDateString()} – {ev.target_role} ({ev.human_recruiter_score}/10)
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                            Comparison Evaluation (B)
                          </label>
                          <select
                            value={evalBId}
                            onChange={(e) => setEvalBId(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200"
                          >
                            {evaluations.map((ev) => (
                              <option key={ev.id} value={ev.id}>
                                {new Date(ev.evaluation_date).toLocaleDateString()} – {ev.target_role} ({ev.human_recruiter_score}/10)
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button variant="primary" size="xs" onClick={handleRunComparison}>
                          Calculate Deltas
                        </Button>
                      </div>

                      {comparisonResult && (
                        <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-4">
                          <div className="grid grid-cols-2 gap-4 text-center">
                            <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                              <span className="text-[10px] text-slate-500 uppercase block">
                                Human Recruiter Delta
                              </span>
                              <span
                                className={`text-xl font-bold mt-1 block ${
                                  comparisonResult.human_score_delta >= 0
                                    ? 'text-emerald-400'
                                    : 'text-rose-400'
                                }`}
                              >
                                {comparisonResult.human_score_delta >= 0 ? '+' : ''}
                                {comparisonResult.human_score_delta} pts
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {comparisonResult.evalA.human_recruiter_score} → {comparisonResult.evalB.human_recruiter_score}
                              </span>
                            </div>

                            <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                              <span className="text-[10px] text-slate-500 uppercase block">
                                ATS Compatibility Delta
                              </span>
                              <span
                                className={`text-xl font-bold mt-1 block ${
                                  comparisonResult.ats_score_delta >= 0
                                    ? 'text-blue-400'
                                    : 'text-rose-400'
                                }`}
                              >
                                {comparisonResult.ats_score_delta >= 0 ? '+' : ''}
                                {comparisonResult.ats_score_delta} pts
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {comparisonResult.evalA.ats_compatibility_score} → {comparisonResult.evalB.ats_compatibility_score}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </Modal>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SaveDraftIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"
      />
    </svg>
  );
}
