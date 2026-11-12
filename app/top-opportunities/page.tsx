'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import OnboardingGateBanner from '@/components/OnboardingGateBanner';
import { JobListing, MatchBreakdown } from '@/lib/types';
import {
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  MapPin,
  Building2,
  DollarSign
} from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function TopOpportunitiesPage() {
  const router = useRouter();
  const [opportunities, setOpportunities] = useState<Array<{ job: JobListing; match: MatchBreakdown }>>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboarded, setOnboarded] = useState(true);
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    fetchTopOpportunities();
  }, []);

  const fetchTopOpportunities = async () => {
    try {
      setLoading(true);
      const profRes = await fetch('/api/profile');
      if (profRes.ok) {
        const prof = await profRes.json();
        setOnboarded(Boolean(prof.profile?.onboarding_completed));
      }

      const res = await fetch('/api/jobs?top=true');
      if (res.ok) {
        const data = await res.json();
        setOpportunities(data.opportunities || []);
        if (data.opportunities && data.opportunities.length > 0) {
          setExpandedId(data.opportunities[0].job.id);
        }
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePreparePackage = async (jobId: string) => {
    setPreparingId(jobId);
    setFeedback(null);
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

      setFeedback('Package generated! Redirecting to Approval Center for explicit human authorization...');
      setTimeout(() => router.push('/approvals'), 1200);
    } catch (err: any) {
      setFeedback(`Error: ${err.message}`);
    } finally {
      setPreparingId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="Top 10 Opportunity Ranking & Match Intelligence"
        subtitle="Ranked via configurable 8-criterion weighted engine (Skills 25%, Seniority 15%, Industry 15%, Salary 15%, Location 10%, Visa 10%, Quality 5%, Recency 5%)"
        onboardingStatus={onboarded}
      />

      <div className="p-4 sm:p-6 md:p-8 max-w-7xl space-y-6 w-full overflow-hidden">
        {!onboarded && <OnboardingGateBanner moduleName="Top 10 Opportunities" />}

        {feedback && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        {/* Algorithm Weights Banner */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs text-slate-300">
          <div className="flex items-center space-x-2 font-bold text-white mb-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span>Transparent 8-Criterion Evaluation Formula:</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-[11px]">
            <div className="bg-slate-950 p-2 rounded border border-slate-800 text-center">
              <span className="text-slate-400 block">Skills & Exp</span>
              <strong className="text-emerald-400">25%</strong>
            </div>
            <div className="bg-slate-950 p-2 rounded border border-slate-800 text-center">
              <span className="text-slate-400 block">Seniority</span>
              <strong className="text-emerald-400">15%</strong>
            </div>
            <div className="bg-slate-950 p-2 rounded border border-slate-800 text-center">
              <span className="text-slate-400 block">Industry</span>
              <strong className="text-emerald-400">15%</strong>
            </div>
            <div className="bg-slate-950 p-2 rounded border border-slate-800 text-center">
              <span className="text-slate-400 block">Salary</span>
              <strong className="text-emerald-400">15%</strong>
            </div>
            <div className="bg-slate-950 p-2 rounded border border-slate-800 text-center">
              <span className="text-slate-400 block">Location</span>
              <strong className="text-emerald-400">10%</strong>
            </div>
            <div className="bg-slate-950 p-2 rounded border border-slate-800 text-center">
              <span className="text-slate-400 block">Visa</span>
              <strong className="text-emerald-400">10%</strong>
            </div>
            <div className="bg-slate-950 p-2 rounded border border-slate-800 text-center">
              <span className="text-slate-400 block">Quality</span>
              <strong className="text-emerald-400">5%</strong>
            </div>
            <div className="bg-slate-950 p-2 rounded border border-slate-800 text-center">
              <span className="text-slate-400 block">Recency</span>
              <strong className="text-emerald-400">5%</strong>
            </div>
          </div>
        </div>

        {/* Opportunities Ranked List */}
        <div className="space-y-4">
          {opportunities.map((item, idx) => {
            const isExpanded = expandedId === item.job.id;

            return (
              <div
                key={item.job.id}
                className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition-all shadow-sm"
              >
                {/* Summary Header */}
                <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start space-x-3.5">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex-shrink-0">
                      #{idx + 1}
                    </span>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="text-base font-bold text-white">{item.job.title}</h3>
                        <span className="text-[10px] text-slate-400 font-mono">({item.job.source.split('/')[0]})</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-300">
                        <span className="font-semibold text-slate-200">{item.job.employer}</span>
                        <span>•</span>
                        <span className="text-slate-400">{item.job.location}</span>
                        <span>•</span>
                        <span className="text-slate-300">{item.job.salary_raw || 'Salary Unlisted'}</span>
                        <span>•</span>
                        <span className="text-slate-400">Visa: {item.job.visa_sponsorship}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap sm:flex-nowrap items-center justify-between sm:justify-end gap-3 w-full md:w-auto pt-2 md:pt-0 border-t border-slate-800/60 md:border-t-0">
                    <div className="text-left sm:text-right">
                      <div className="text-2xl font-black text-emerald-400">
                        {item.match.overall_score}%
                      </div>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider">Weighted Score</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => handlePreparePackage(item.job.id)}
                        disabled={preparingId === item.job.id}
                        className="px-3 sm:px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-xs flex items-center space-x-1.5 transition-colors shadow-sm"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{preparingId === item.job.id ? 'Generating...' : 'Prepare App'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : item.job.id)}
                        className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Score Explanation & Requirements Drawer */}
                {isExpanded && (
                  <div className="p-6 bg-slate-950/70 border-t border-slate-800 space-y-6">
                    {/* Explanations Grid */}
                    <div>
                      <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-3">
                        Detailed 8-Criterion Score Explanations
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                          <div className="flex justify-between font-semibold text-slate-200">
                            <span>1. Skills & Experience (25%)</span>
                            <span className="text-emerald-400">{item.match.skills_score}%</span>
                          </div>
                          <p className="text-slate-400 mt-1">{item.match.explanations.skills}</p>
                        </div>

                        <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                          <div className="flex justify-between font-semibold text-slate-200">
                            <span>2. Seniority Alignment (15%)</span>
                            <span className="text-emerald-400">{item.match.seniority_score}%</span>
                          </div>
                          <p className="text-slate-400 mt-1">{item.match.explanations.seniority}</p>
                        </div>

                        <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                          <div className="flex justify-between font-semibold text-slate-200">
                            <span>3. Industry Relevance (15%)</span>
                            <span className="text-emerald-400">{item.match.industry_score}%</span>
                          </div>
                          <p className="text-slate-400 mt-1">{item.match.explanations.industry}</p>
                        </div>

                        <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                          <div className="flex justify-between font-semibold text-slate-200">
                            <span>4. Salary Expectation (15%)</span>
                            <span className="text-emerald-400">{item.match.salary_score}%</span>
                          </div>
                          <p className="text-slate-400 mt-1">{item.match.explanations.salary}</p>
                        </div>

                        <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                          <div className="flex justify-between font-semibold text-slate-200">
                            <span>5. Location & Relocation (10%)</span>
                            <span className="text-emerald-400">{item.match.location_score}%</span>
                          </div>
                          <p className="text-slate-400 mt-1">{item.match.explanations.location}</p>
                        </div>

                        <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                          <div className="flex justify-between font-semibold text-slate-200">
                            <span>6. Visa Sponsorship (10%)</span>
                            <span className="text-emerald-400">{item.match.visa_score}%</span>
                          </div>
                          <p className="text-slate-400 mt-1">{item.match.explanations.visa}</p>
                        </div>

                        <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                          <div className="flex justify-between font-semibold text-slate-200">
                            <span>7. Employer Quality (5%)</span>
                            <span className="text-emerald-400">{item.match.employer_score}%</span>
                          </div>
                          <p className="text-slate-400 mt-1">{item.match.explanations.employer}</p>
                        </div>

                        <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                          <div className="flex justify-between font-semibold text-slate-200">
                            <span>8. Job Recency (5%)</span>
                            <span className="text-emerald-400">{item.match.recency_score}%</span>
                          </div>
                          <p className="text-slate-400 mt-1">{item.match.explanations.recency}</p>
                        </div>
                      </div>
                    </div>

                    {/* Missing Qualifications & Next Recommended Actions */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 space-y-2">
                        <span className="font-bold text-amber-400 flex items-center space-x-1.5">
                          <AlertTriangle className="w-4 h-4" />
                          <span>Identified Missing Qualifications</span>
                        </span>
                        {item.match.missing_qualifications.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {item.match.missing_qualifications.map((mq, mIdx) => (
                              <span key={mIdx} className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                {mq}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-slate-400">All required skills fully covered by candidate profile!</p>
                        )}
                      </div>

                      <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 space-y-2">
                        <span className="font-bold text-emerald-400 flex items-center space-x-1.5">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Recommended Next Action</span>
                        </span>
                        <p className="text-slate-300">
                          Prepare tailored package with custom CV and cover letter. Authorize package in Approval Center to proceed with submission.
                        </p>
                        <div className="pt-1">
                          <a
                            href={item.job.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center space-x-1 text-emerald-400 hover:underline"
                          >
                            <span>Inspect Official Vacancy URL</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
