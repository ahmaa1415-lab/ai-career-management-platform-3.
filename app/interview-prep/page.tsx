'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import {
  Sparkles,
  Briefcase,
  HelpCircle,
  Award,
  DollarSign,
  MessageSquare,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Send,
  RefreshCw,
  TrendingUp,
  ShieldCheck,
  Building,
  Target
} from 'lucide-react';

export default function InterviewPrepPage() {
  const [prepData, setPrepData] = useState<any>(null);
  const [availableJobs, setAvailableJobs] = useState<any[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'star' | 'mock' | 'salary' | 'ask'>('star');
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>('q_01');

  // Mock interview state
  const [mockQuestion, setMockQuestion] = useState<string>('');
  const [userAnswer, setUserAnswer] = useState<string>('');
  const [evaluating, setEvaluating] = useState(false);
  const [mockResult, setMockResult] = useState<any>(null);

  useEffect(() => {
    fetchInterviewPrep(selectedJobId);
  }, [selectedJobId]);

  const fetchInterviewPrep = async (jobId?: string) => {
    setLoading(true);
    try {
      const url = jobId ? `/api/interview-prep?job_id=${encodeURIComponent(jobId)}` : '/api/interview-prep';
      const res = await fetch(url);
      const json = await res.json();
      if (res.ok && json.data) {
        setPrepData(json.data);
        if (json.available_jobs) {
          setAvailableJobs(json.available_jobs);
          if (!selectedJobId && json.data.target_job_id) {
            setSelectedJobId(json.data.target_job_id);
          }
        }
        if (json.data.questions?.length > 0 && !mockQuestion) {
          setMockQuestion(json.data.questions[0].question);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleEvaluateMock = async () => {
    if (!mockQuestion || !userAnswer.trim()) return;
    setEvaluating(true);
    try {
      const res = await fetch('/api/interview-prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'evaluate_answer',
          question: mockQuestion,
          user_answer: userAnswer,
        }),
      });
      const json = await res.json();
      if (res.ok && json.evaluation) {
        setMockResult(json.evaluation);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="Interview Preparation AI"
        subtitle="STAR model answers, competency questions, salary negotiation playbook, and mock interview evaluation"
      />

      <div className="p-4 sm:p-6 md:p-8 max-w-7xl space-y-6 w-full">
        {/* Target Job Selector Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-emerald-400">
              Target Interview Role
            </span>
            <h2 className="text-base sm:text-lg font-black text-white flex items-center space-x-2">
              <Briefcase className="w-5 h-5 text-blue-400" />
              <span>{prepData?.target_job_title || 'Category & Commercial Management'}</span>
            </h2>
            <p className="text-xs text-slate-400">
              Company: <strong className="text-slate-200">{prepData?.employer || 'Target Employer'}</strong> • Candidate: <span className="text-emerald-400 font-medium">{prepData?.candidate_name}</span>
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
            <div className="flex items-center space-x-2 bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl text-xs">
              <span className="text-slate-400">Readiness:</span>
              <span className="font-extrabold text-emerald-400">{prepData?.preparation_readiness_score || 96}% Ready</span>
            </div>

            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-medium focus:outline-none focus:border-emerald-400 cursor-pointer"
            >
              {availableJobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title} ({j.employer})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Workspace Navigation Tabs */}
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-3 overflow-x-auto">
          {[
            { id: 'star', label: 'STAR Model Answers', icon: Award },
            { id: 'mock', label: 'Interactive Mock Interview', icon: MessageSquare },
            { id: 'salary', label: 'GCC Salary Negotiation', icon: DollarSign },
            { id: 'ask', label: 'Questions to Ask Interviewer', icon: HelpCircle },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center space-x-2 transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: STAR MODEL ANSWERS */}
        {activeTab === 'star' && prepData && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Award className="w-4 h-4 text-emerald-400" />
                  <span>Role-Specific Interview Questions & Grounded STAR Responses</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Every answer is strictly grounded in your verified career history at Sulinda, Arab Otsuka, and Abu Dawood.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {prepData.questions?.map((q: any) => {
                const isExpanded = expandedQuestion === q.id;
                return (
                  <div
                    key={q.id}
                    className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 sm:p-5 space-y-3 transition-all"
                  >
                    <div
                      onClick={() => setExpandedQuestion(isExpanded ? null : q.id)}
                      className="flex items-start justify-between gap-3 cursor-pointer select-none"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            {q.category}
                          </span>
                          <span className="text-[11px] text-slate-400 italic">{q.intent}</span>
                        </div>
                        <h4 className="text-sm font-bold text-white pt-1">{q.question}</h4>
                      </div>

                      <button
                        type="button"
                        className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors flex-shrink-0"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-slate-800 space-y-3 animate-fadeIn">
                        {/* STAR Breakdown */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
                            <span className="text-[10px] font-black uppercase text-amber-400 block tracking-wider">
                              [S] Situation
                            </span>
                            <p className="text-xs text-slate-300 leading-relaxed">{q.model_star_answer.situation}</p>
                          </div>
                          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
                            <span className="text-[10px] font-black uppercase text-cyan-400 block tracking-wider">
                              [T] Task
                            </span>
                            <p className="text-xs text-slate-300 leading-relaxed">{q.model_star_answer.task}</p>
                          </div>
                          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
                            <span className="text-[10px] font-black uppercase text-blue-400 block tracking-wider">
                              [A] Action (Your Direct Ownership)
                            </span>
                            <p className="text-xs text-slate-300 leading-relaxed">{q.model_star_answer.action}</p>
                          </div>
                          <div className="bg-slate-950 p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-950/10 space-y-1">
                            <span className="text-[10px] font-black uppercase text-emerald-400 block tracking-wider">
                              [R] Result (Quantifiable Commercial Impact)
                            </span>
                            <p className="text-xs text-emerald-200 font-medium leading-relaxed">
                              {q.model_star_answer.result}
                            </p>
                          </div>
                        </div>

                        {/* Highlighted Proof Points */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Key Metrics:</span>
                            {q.key_metrics_highlighted?.map((m: string, idx: number) => (
                              <span
                                key={idx}
                                className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              >
                                {m}
                              </span>
                            ))}
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setMockQuestion(q.question);
                              setActiveTab('mock');
                            }}
                            className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center space-x-1"
                          >
                            <span>Practice This Question</span>
                            <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: INTERACTIVE MOCK INTERVIEW */}
        {activeTab === 'mock' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <MessageSquare className="w-4 h-4 text-blue-400" />
                  <span>AI Mock Interview Simulator</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Select or type an interview question. Practice your delivery and get instant STAR adherence scoring and executive feedback.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300">Question Under Practice:</label>
                <input
                  type="text"
                  value={mockQuestion}
                  onChange={(e) => setMockQuestion(e.target.value)}
                  placeholder="e.g. Tell me about a time you handled a difficult distributor negotiation..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-bold text-slate-300">Your Response (Practice typing or dictating):</label>
                  <span className="text-slate-400 text-[11px]">{userAnswer.length} characters</span>
                </div>
                <textarea
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  placeholder="Structure your answer using STAR: At Sulinda/Arab Otsuka, my task was... I led... and the result was 30% sales growth..."
                  rows={6}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono leading-relaxed"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleEvaluateMock}
                  disabled={evaluating || !userAnswer.trim()}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center space-x-2 transition-all shadow-md shadow-blue-500/20 cursor-pointer"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${evaluating ? 'animate-spin' : ''}`} />
                  <span>{evaluating ? 'Grading Response...' : '🤖 Grade My Answer with AI'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const sample = prepData?.questions?.[0]?.model_star_answer;
                    if (sample) {
                      setUserAnswer(`${sample.situation} ${sample.task} ${sample.action} ${sample.result}`);
                    }
                  }}
                  className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 bg-slate-800 rounded-lg border border-slate-700"
                >
                  Load Model STAR Example
                </button>
              </div>

              {/* Evaluation Output */}
              {mockResult && (
                <div className="mt-5 pt-5 border-t border-slate-800 space-y-4 animate-fadeIn">
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Evaluation Grade</span>
                      <div className="flex items-center space-x-2 mt-0.5">
                        <span className="text-2xl font-black text-emerald-400">{mockResult.score} / 100</span>
                        <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {mockResult.grade}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 text-xs">
                      {['situation', 'task', 'action', 'result'].map((k) => {
                        const ok = mockResult.star_adherence?.[`has_${k}`];
                        return (
                          <span
                            key={k}
                            className={`px-2 py-1 rounded font-bold uppercase text-[10px] border ${
                              ok
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : 'bg-slate-900 text-slate-500 border-slate-800'
                            }`}
                          >
                            {k} {ok ? '✓' : '✗'}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2">
                    <h5 className="text-xs font-bold text-blue-400">Recruiter Feedback:</h5>
                    <p className="text-xs text-slate-300 leading-relaxed">{mockResult.feedback}</p>
                    <p className="text-xs text-slate-400 italic pt-1">{mockResult.suggested_refinement}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: SALARY NEGOTIATION */}
        {activeTab === 'salary' && prepData && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5 shadow-sm">
              <div className="space-y-1">
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-emerald-400">
                  Regional Commercial Benchmarks
                </span>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <DollarSign className="w-5 h-5 text-emerald-400" />
                  <span>GCC Salary & Executive Compensation Strategy</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Negotiation positioning tailored for Dubai, UAE and Riyadh, KSA markets.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-950 p-4 rounded-xl border border-emerald-500/30 space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Recommended Target Package
                  </span>
                  <div className="text-lg font-black text-emerald-400">
                    {prepData.salary_negotiation_strategy.recommended_target_range}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed pt-1">
                    {prepData.salary_negotiation_strategy.market_benchmark_context}
                  </p>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Minimum Acceptable Base
                  </span>
                  <div className="text-lg font-black text-slate-200">
                    {prepData.salary_negotiation_strategy.minimum_acceptable_threshold}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed pt-1">
                    Defines your walk-away threshold. Any offer below this requires additional equity, performance bonuses, or guaranteed relocation support.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                  <span>Strategic Negotiation Tactics</span>
                </h4>
                <div className="space-y-2">
                  {prepData.salary_negotiation_strategy.tactics?.map((t: string, idx: number) => (
                    <div key={idx} className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex items-start space-x-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                      <span className="text-xs text-slate-300 leading-relaxed">{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: QUESTIONS TO ASK INTERVIEWER */}
        {activeTab === 'ask' && prepData && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <HelpCircle className="w-4 h-4 text-blue-400" />
                  <span>High-Impact Questions to Ask the Hiring Team</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Asking these questions positions you as a strategic commercial partner rather than just another candidate.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                {prepData.smart_questions_to_ask_interviewer?.map((q: string, idx: number) => (
                  <div key={idx} className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                    <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider block">Question #{idx + 1}</span>
                    <p className="text-xs text-slate-200 font-semibold leading-relaxed">"{q}"</p>
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
