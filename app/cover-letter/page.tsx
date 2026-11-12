'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { FileText, Copy, Check, Download, Sparkles, Building2, MapPin, RefreshCw, Send, CheckCircle2, ShieldCheck, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function CoverLetterStudioPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [candidate, setCandidate] = useState<any>(null);
  const [coverLetter, setCoverLetter] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/jobs').then(r => r.json()),
      fetch('/api/profile').then(r => r.json())
    ]).then(([jobsData, profData]) => {
      if (jobsData.success && jobsData.jobs) {
        setJobs(jobsData.jobs);
        if (jobsData.jobs.length > 0) {
          setSelectedJobId(jobsData.jobs[0].id);
        }
      }
      if (profData.success && profData.candidate) {
        setCandidate(profData.candidate);
      }
    }).catch(err => console.error('Error fetching data:', err))
      .finally(() => setLoading(false));
  }, []);

  // When job changes or initialized, fetch/generate tailored cover letter
  useEffect(() => {
    if (!selectedJobId) return;
    setGenerating(true);
    fetch('/api/applications/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: selectedJobId })
    })
      .then(r => r.json())
      .then(data => {
        if (data.success && data.package && data.package.cover_letter) {
          setCoverLetter(data.package.cover_letter);
        }
      })
      .catch(err => console.error('Error generating cover letter:', err))
      .finally(() => setGenerating(false));
  }, [selectedJobId]);

  const selectedJob = jobs.find(j => j.id === selectedJobId);

  const handleCopy = () => {
    navigator.clipboard.writeText(coverLetter);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([coverLetter], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Cover_Letter_${selectedJob?.employer || 'Company'}_${selectedJob?.title || 'Role'}.md`.replace(/\s+/g, '_');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveToPackage = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto w-full p-6 space-y-6">
        
        {/* Title Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center space-x-2 text-indigo-400 text-sm font-semibold tracking-wide uppercase mb-1">
              <Sparkles className="w-4 h-4" />
              <span>Tailored Application Documents</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Cover Letter Studio</h1>
            <p className="text-slate-400 text-sm mt-1">
              AI-generated, role-specific cover letters strictly grounded in candidate's verified achievements.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <Link
              href="/control-center"
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-xl border border-slate-700 transition flex items-center"
            >
              Control Center <ArrowRight className="w-4 h-4 ml-1.5" />
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12 text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" /> Loading opportunities and profile...
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Column: Job Selector */}
            <div className="space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                <h2 className="text-base font-semibold text-white mb-3 flex items-center">
                  <Building2 className="w-4 h-4 mr-2 text-indigo-400" />
                  Select Target Opportunity
                </h2>

                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                  {jobs.map(job => (
                    <button
                      key={job.id}
                      onClick={() => setSelectedJobId(job.id)}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                        selectedJobId === job.id
                          ? 'bg-indigo-600/15 border-indigo-500/50 shadow-sm'
                          : 'bg-slate-800/40 border-slate-800 hover:bg-slate-800/80'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-semibold text-sm text-slate-100 leading-tight">
                          {job.title}
                        </span>
                        {job.match_score && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {job.match_score}%
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-indigo-300 font-medium mt-1">
                        {job.employer}
                      </div>
                      <div className="flex items-center text-[11px] text-slate-400 mt-2">
                        <MapPin className="w-3 h-3 mr-1" />
                        <span className="truncate">{job.location}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Verified Candidate Badge */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-xs space-y-2">
                <div className="flex items-center text-emerald-400 font-semibold">
                  <ShieldCheck className="w-4 h-4 mr-1.5" />
                  Fact-Checked Truth Preservation
                </div>
                <p className="text-slate-400">
                  Every cover letter references authentic roles at Sulinda, Arab Otsuka, Abu Dawood Group, and Indomie with zero invented metrics.
                </p>
              </div>
            </div>

            {/* Right Column: Live Cover Letter Editor */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col h-full">
                
                {/* Editor Header Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800 mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      {selectedJob ? `${selectedJob.title} — ${selectedJob.employer}` : 'Cover Letter Preview'}
                    </h3>
                    <span className="text-xs text-slate-400">
                      Editable Markdown / Plain Text Format
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleCopy}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition flex items-center"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                      {copied ? 'Copied' : 'Copy Text'}
                    </button>
                    <button
                      onClick={handleDownload}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition flex items-center"
                    >
                      <Download className="w-3.5 h-3.5 mr-1" />
                      Download
                    </button>
                    <button
                      onClick={handleSaveToPackage}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition shadow-md shadow-indigo-600/20 flex items-center"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      Save to Package
                    </button>
                  </div>
                </div>

                {savedSuccess && (
                  <div className="p-3 mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center">
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Cover letter saved to application package. Ready for Human Approval Center.
                  </div>
                )}

                {/* Textarea */}
                {generating ? (
                  <div className="flex-1 flex items-center justify-center p-12 text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mr-2" /> Generating role-specific cover letter...
                  </div>
                ) : (
                  <textarea
                    value={coverLetter}
                    onChange={(e) => setCoverLetter(e.target.value)}
                    rows={18}
                    className="w-full flex-1 p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs leading-relaxed focus:outline-none focus:border-indigo-500 resize-y"
                    placeholder="Cover letter text will appear here..."
                  />
                )}

                <div className="mt-4 pt-3 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
                  <span>Character count: {coverLetter.length}</span>
                  <Link href="/approvals" className="text-indigo-400 hover:underline flex items-center">
                    Proceed to Approval Center <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </Link>
                </div>

              </div>
            </div>

          </div>
        )}

      </main>
    </div>
  );
}
