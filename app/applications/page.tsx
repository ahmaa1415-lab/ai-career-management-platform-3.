'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { ApplicationRecord } from '@/lib/types';
import { classifyApplicationLifecycle, calculateApplicationKPIs } from '@/lib/applications/lifecycle';
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

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [evidenceRef, setEvidenceRef] = useState('');
  const [submittingConfirm, setSubmittingConfirm] = useState(false);

  useEffect(() => {
    fetchApplications();
  }, []);

  const handlePrepareAllPackages = async () => {
    setRunningAutopilot(true);
    setActionMessage('⚡ Generating tailored application packages for all matching vacancies...');
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
      if (!res.ok) throw new Error(data.error || 'Package generation failed');
      setActionMessage(`⚡ ${data.message} (${data.newly_applied_count || 0} newly prepared)`);
      await fetchApplications();
    } catch (err: any) {
      setActionMessage(`Package generation notice: ${err.message}. Click button to retry.`);
    } finally {
      setRunningAutopilot(false);
    }
  };

  const handleCandidateConfirmSubmission = async (appId: string) => {
    try {
      setActionMessage('Confirming candidate submission on official portal...');
      const res = await fetch('/api/applications/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: appId,
          candidate_confirmed: true,
          notes: 'Candidate confirmed manual submission on official employer career portal.'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission confirmation failed');
      setActionMessage('✓ Application status updated: Submitted by Candidate!');
      await fetchApplications();
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    }
  };

  const handleRecordEmployerConfirmation = async (appId: string) => {
    if (!evidenceRef.trim()) {
      alert('Please enter an application reference number or confirmation ID.');
      return;
    }
    setSubmittingConfirm(true);
    try {
      const res = await fetch('/api/applications/confirm-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: appId,
          confirmation_reference: evidenceRef.trim(),
          evidence_type: 'candidate_receipt',
          notes: 'Candidate verified confirmation receipt from employer.'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record confirmation');
      setActionMessage('✓ Candidate confirmation evidence successfully recorded! Pending independent employer verification.');
      setShowConfirmModal(false);
      setEvidenceRef('');
      await fetchApplications();
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    } finally {
      setSubmittingConfirm(false);
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

        {/* Application Package Generator Banner */}
        <div className="bg-gradient-to-r from-blue-950/40 via-emerald-950/30 to-slate-900 border border-emerald-500/30 rounded-xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <h3 className="text-sm font-bold text-white">Application Package Generator: Prepare All Matches</h3>
            </div>
            <p className="text-xs text-slate-300">
              Generates bespoke Version B CVs, custom cover letters, and screening answers for your review, ready for submission on official employer portals.
            </p>
          </div>
          <button
            type="button"
            onClick={handlePrepareAllPackages}
            disabled={runningAutopilot}
            className="w-full md:w-auto px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center space-x-2 flex-shrink-0 transition-colors shadow-md"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{runningAutopilot ? 'Preparing Packages...' : '⚡ Prepare Packages for All Matches'}</span>
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
                  {(() => {
                    const lifecycle = classifyApplicationLifecycle(app);
                    const getBadgeClass = () => {
                      switch (lifecycle) {
                        case 'Employer Confirmation Independently Verified':
                          return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                        case 'Candidate Evidence Provided':
                          return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
                        case 'Submitted by Candidate':
                          return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
                        case 'Ready for Candidate Submission':
                          return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
                        case 'Package Prepared':
                        case 'Approval Pending':
                          return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
                        case 'Legacy Applied – Unverified':
                        default:
                          return 'bg-slate-700/50 text-slate-300 border-slate-600';
                      }
                    };
                    const getBadgeText = () => {
                      switch (lifecycle) {
                        case 'Employer Confirmation Independently Verified':
                          return 'Employer Confirmed (Verified)';
                        case 'Candidate Evidence Provided':
                          return 'Candidate Evidence Provided';
                        case 'Submitted by Candidate':
                          return 'Submitted by Candidate';
                        case 'Ready for Candidate Submission':
                          return 'Ready for Candidate Submission';
                        case 'Package Prepared':
                        case 'Approval Pending':
                          return 'Package Prepared';
                        case 'Legacy Applied – Unverified':
                          return 'Legacy Applied (Unverified)';
                        default:
                          return lifecycle;
                      }
                    };
                    return (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${getBadgeClass()}`}>
                        {getBadgeText()}
                      </span>
                    );
                  })()}
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
                  {(selectedApp.status === 'Package Prepared' || selectedApp.status === 'Approval Pending') && (
                    <Link
                      href="/approvals"
                      className="w-full sm:w-auto px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center space-x-1 shadow-sm"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>Review in Approval Center</span>
                    </Link>
                  )}
                  {(selectedApp.status === 'Ready for Candidate Submission' || selectedApp.status === 'Ready to Apply') && (
                    <button
                      type="button"
                      onClick={() => handleCandidateConfirmSubmission(selectedApp.id)}
                      className="w-full sm:w-auto px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs flex items-center justify-center space-x-1 shadow-sm"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Confirm I Have Submitted</span>
                    </button>
                  )}
                  {(selectedApp.status === 'Submitted by Candidate' || selectedApp.status === 'Applied') && (
                    <button
                      type="button"
                      onClick={() => setShowConfirmModal(true)}
                      className="w-full sm:w-auto px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg text-xs flex items-center justify-center space-x-1 shadow-sm"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Record Confirmation</span>
                    </button>
                  )}
                  {(selectedApp.job?.company_portal_url || selectedApp.job?.source_url) && (
                    <a
                      href={selectedApp.job?.company_portal_url || selectedApp.job?.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 font-semibold rounded-lg text-xs border border-slate-700 flex items-center gap-1.5"
                    >
                      <span>Open Employer Portal</span>
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

        {/* Confirmation Modal */}
        {showConfirmModal && selectedApp && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h4 className="text-sm font-bold text-white">Record Candidate Confirmation Evidence</h4>
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="text-slate-400 hover:text-white text-xs"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Enter the confirmation reference or requisition number provided by <strong>{selectedApp.job?.employer}</strong> upon your direct submission. This documentation will be stored as candidate self-reported evidence.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Candidate Submission Reference / Receipt:
                </label>
                <input
                  type="text"
                  value={evidenceRef}
                  onChange={(e) => setEvidenceRef(e.target.value)}
                  placeholder="e.g. REQ-98214, CAND-RECEIPT-2026"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submittingConfirm || !evidenceRef.trim()}
                  onClick={() => handleRecordEmployerConfirmation(selectedApp.id)}
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold rounded-lg text-xs"
                >
                  {submittingConfirm ? 'Saving...' : 'Save Candidate Evidence'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
