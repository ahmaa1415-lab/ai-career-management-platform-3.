'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { ApplicationRecord } from '@/lib/types';
import {
  Briefcase,
  FileText,
  CheckCircle2,
  ExternalLink,
  ShieldAlert,
  Clock,
  Eye,
  MessageSquare,
  Send,
  RefreshCw
} from 'lucide-react';
import Link from 'next/link';

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [selectedApp, setSelectedApp] = useState<ApplicationRecord | null>(null);
  const [activeTab, setActiveTab] = useState<'cv' | 'cover' | 'screening' | 'disclosures'>('cv');
  const [loading, setLoading] = useState(true);
  const [runningAutopilot, setRunningAutopilot] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [candidateProfile, setCandidateProfile] = useState<any>(null);

  useEffect(() => {
    fetchApplications();
  }, []);

  const handleApplyEverywhere = async () => {
    setRunningAutopilot(true);
    setActionMessage('⚡ Initiating autonomous autopilot across all platforms...');
    try {
      let res: Response | null = null;
      let lastErr: any = null;

      // Robust fetch with retry in case server was momentarily restarting
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          res = await fetch('/api/applications/auto-apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ minMatchScore: 70, forceAll: false })
          });
          if (res.ok) break;
        } catch (fetchErr: any) {
          lastErr = fetchErr;
          if (attempt === 1) {
            await new Promise(r => setTimeout(r, 1200));
          }
        }
      }

      if (!res) {
        throw new Error(lastErr ? lastErr.message : 'Server was momentarily unreachable. Please retry now.');
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Auto-apply failed');
      setActionMessage(`⚡ ${data.message} (${data.newly_applied_count} newly applied, ${data.total_applied_in_system} total in CRM)`);
      await fetchApplications();
    } catch (err: any) {
      setActionMessage(`Auto-apply notice: ${err.message}. Click button to retry.`);
    } finally {
      setRunningAutopilot(false);
    }
  };

  const fetchApplications = async () => {
    try {
      setLoading(true);
      try {
        const profRes = await fetch('/api/profile');
        if (profRes.ok) {
          const pData = await profRes.json();
          setCandidateProfile(pData);
        }
      } catch (e) {
        console.error('Error fetching profile:', e);
      }

      const res = await fetch('/api/crm/status');
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications || []);
        if (data.applications && data.applications.length > 0) {
          setSelectedApp(data.applications[0]);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  let screeningMap: Record<string, any> = {};
  try {
    if (selectedApp?.screening_responses) {
      screeningMap = typeof selectedApp.screening_responses === 'string'
        ? JSON.parse(selectedApp.screening_responses)
        : (selectedApp.screening_responses || {});
    }
  } catch {
    screeningMap = {};
  }

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="Application Workspace & Package Inspection"
        subtitle="Review tailored CVs, customized cover letters, screening answers, and personal disclosures before dispatch"
      />

      <div className="p-4 sm:p-6 md:p-8 max-w-7xl space-y-5 w-full overflow-hidden">
        {actionMessage && (
          <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center space-x-2 shadow-sm">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{actionMessage}</span>
          </div>
        )}

        {/* Autonomous Apply Everywhere Banner */}
        <div className="bg-gradient-to-r from-blue-950/40 via-emerald-950/30 to-slate-900 border border-emerald-500/30 rounded-xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <h3 className="text-sm font-bold text-white">Autonomous Autopilot: Apply Everywhere on My Behalf</h3>
            </div>
            <p className="text-xs text-slate-300">
              Dispatches tailored Version B CVs, custom cover letters, and verified applications across LinkedIn, RemoteOK, Bayt, Indeed, Wuzzuf, GulfTalent, and direct company careers portals.
            </p>
          </div>
          <button
            type="button"
            onClick={handleApplyEverywhere}
            disabled={runningAutopilot}
            className="w-full md:w-auto px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center space-x-2 flex-shrink-0 transition-colors shadow-md"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{runningAutopilot ? 'Applying Everywhere...' : '⚡ Apply Everywhere Autonomously'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: List of Application Packages */}
        <div className="space-y-3">
          <div className="flex items-center justify-between pb-2">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Application Packages ({applications.length})
            </h3>
            <Link href="/top-opportunities" className="text-xs text-emerald-400 hover:underline">
              + New Package
            </Link>
          </div>

          <div className="space-y-2">
            {applications.map((app) => (
              <div
                key={app.id}
                onClick={() => setSelectedApp(app)}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  selectedApp?.id === app.id
                    ? 'bg-slate-900 border-emerald-500/50 shadow-md'
                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-100">{app.job?.title}</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">{app.job?.employer}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                    app.status === 'Approval Pending'
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      : app.status === 'Applied'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}>
                    {app.status}
                  </span>
                </div>

                <div className="flex items-center justify-between mt-3 text-[11px] text-slate-400 pt-2 border-t border-slate-800/60">
                  <span>Match: <strong className="text-emerald-400">{app.match_score}%</strong></span>
                  <span>{app.human_approved ? 'Approved ✓' : 'Pending Approval ⚠'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right 2 Columns: Inspection Tabs */}
        <div className="lg:col-span-2 space-y-4">
          {selectedApp ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
                <div>
                  <h3 className="text-base font-bold text-white">{selectedApp.job?.title}</h3>
                  <p className="text-xs text-slate-400">{selectedApp.job?.employer} • {selectedApp.job?.location}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  {selectedApp.status === 'Approval Pending' && (
                    <Link
                      href="/approvals"
                      className="w-full sm:w-auto px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center space-x-1 shadow-sm"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>Review in Approval Center</span>
                    </Link>
                  )}
                  {selectedApp.job?.source_url && (
                    <a
                      href={selectedApp.job.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs border border-slate-700"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>

              {/* Package Asset Tabs */}
              <div className="flex items-center space-x-2 border-b border-slate-800 pb-2 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setActiveTab('cv')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    activeTab === 'cv' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Tailored CV
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('cover')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    activeTab === 'cover' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Cover Letter
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('screening')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    activeTab === 'screening' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Screening Answers
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('disclosures')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    activeTab === 'disclosures' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Personal Disclosures
                </button>
              </div>

              {/* Tab Content */}
              <div>
                {activeTab === 'cover' && (
                  <pre className="text-xs font-mono text-slate-300 bg-slate-950 p-4 rounded-lg border border-slate-800 whitespace-pre-wrap leading-relaxed">
                    {selectedApp.cover_letter || 'No cover letter generated.'}
                  </pre>
                )}

                {activeTab === 'screening' && (
                  <div className="space-y-3">
                    {Object.entries(screeningMap).map(([question, answer], idx) => (
                      <div key={idx} className="p-3.5 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5 text-xs">
                        <span className="font-semibold text-emerald-400">Q: {question}</span>
                        <p className="text-slate-300">A: {String(answer)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'disclosures' && (
                  <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-3 text-xs">
                    <span className="font-bold text-slate-200">Personal Data Items Included in this Application:</span>
                    <ul className="space-y-1 list-disc list-inside text-slate-300">
                      <li>Full Legal Name: {candidateProfile?.profile?.full_name || '—'}</li>
                      <li>Contact Email: {candidateProfile?.profile?.email || '—'}</li>
                      <li>Current City & Country: {candidateProfile?.location?.target_cities?.[0] || candidateProfile?.location?.target_countries?.[0] || '—'}</li>
                      <li>Visa & Work Authorization Status: {candidateProfile?.location?.visa_sponsorship_required ? 'Sponsorship requested for relocation' : 'Authorized to work'}</li>
                      <li>Target Salary Expectation: ${candidateProfile?.profile?.min_salary?.toLocaleString() || '75,000'} {candidateProfile?.profile?.preferred_currency || 'USD'}</li>
                      <li>Verified Employment & Academic Credentials</li>
                    </ul>
                    <p className="text-[11px] text-emerald-400 font-medium pt-2 border-t border-slate-800">
                      ✓ Zero financial data, government ID numbers, or passwords are ever disclosed.
                    </p>
                  </div>
                )}

                {activeTab === 'cv' && (
                  <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
                    <span className="text-xs font-semibold text-emerald-400">Linked Tailored Resume Record:</span>
                    <p className="text-xs text-slate-300 font-mono">ID: {selectedApp.tailored_cv_id || 'Embedded in Application'}</p>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Customized specifically for {selectedApp.job?.employer} to highlight matching competencies in {Array.isArray(selectedApp.job?.requirements) ? selectedApp.job.requirements.join(', ') : (selectedApp.job?.requirements || 'Core Competencies')}.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-500 bg-slate-900 border border-slate-800 rounded-xl">
              No application package selected.
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
