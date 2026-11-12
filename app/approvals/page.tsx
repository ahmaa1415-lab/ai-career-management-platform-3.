'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { ApplicationRecord } from '@/lib/types';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Send,
  Eye,
  FileText,
  AlertCircle,
  RefreshCw
} from 'lucide-react';

export default function ApprovalsPage() {
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [runningAutopilot, setRunningAutopilot] = useState(false);

  useEffect(() => {
    fetchApplications();
  }, []);

  const handleApplyEverywhere = async () => {
    setRunningAutopilot(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/applications/auto-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minMatchScore: 70, forceAll: true })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Auto-apply failed');
      setActionMessage(`⚡ ${data.message}`);
      await fetchApplications();
    } catch (err: any) {
      setActionMessage(`Auto-apply error: ${err.message}`);
    } finally {
      setRunningAutopilot(false);
    }
  };

  const fetchApplications = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/crm/status');
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const pendingApprovals = applications.filter(a => a.status === 'Approval Pending');
  const readyToSubmit = applications.filter(a => a.status === 'Ready to Apply');

  const handleApprove = async (appId: string) => {
    setProcessingId(appId);
    setActionMessage(null);
    try {
      const res = await fetch('/api/applications/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: appId, consent: true }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to approve package.');
      }

      setActionMessage('Application package approved! Moved to "Ready to Apply".');
      await fetchApplications();
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleConfirmSubmission = async (appId: string) => {
    setProcessingId(appId);
    setActionMessage(null);
    try {
      const res = await fetch('/api/applications/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: appId, notes: 'Submitted via direct official portal link with verified tailored package.' }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to record submission.');
      }

      setActionMessage('Submission confirmed and recorded! Application moved to "Applied" in CRM.');
      await fetchApplications();
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="Human-in-the-Loop Approval Center"
        subtitle="Mandatory security gate: Zero applications or personal data disclosures occur without explicit human approval"
      />

      <div className="p-4 sm:p-6 md:p-8 max-w-7xl space-y-6 sm:space-y-8 w-full overflow-hidden">
        {actionMessage && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center space-x-2 shadow-sm">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{actionMessage}</span>
          </div>
        )}

        {/* Autonomous Autopilot Banner */}
        <div className="bg-gradient-to-r from-blue-950/40 via-emerald-950/30 to-slate-900 border border-emerald-500/30 rounded-xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <h3 className="text-sm font-bold text-white">Autonomous Autopilot: Apply Everywhere on My Behalf</h3>
            </div>
            <p className="text-xs text-slate-300">
              Grant delegated autonomous authority to automatically approve, tailor, and submit applications across LinkedIn, RemoteOK, Bayt, Indeed, Wuzzuf, GulfTalent, and direct company careers portals.
            </p>
          </div>
          <button
            type="button"
            onClick={handleApplyEverywhere}
            disabled={runningAutopilot}
            className="w-full md:w-auto px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center space-x-2 flex-shrink-0 transition-colors shadow-md"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${runningAutopilot ? 'animate-spin' : ''}`} />
            <span>{runningAutopilot ? 'Applying Everywhere...' : '⚡ Apply Everywhere Autonomously'}</span>
          </button>
        </div>

        {/* Section 1: Pending Human Approvals */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
              <h3 className="text-base font-bold text-white">
                Pending Approval Packages ({pendingApprovals.length})
              </h3>
            </div>
            <span className="text-xs text-amber-400/90 font-medium">Explicit consent required</span>
          </div>

          {pendingApprovals.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-slate-900 border border-slate-800 rounded-xl text-xs">
              No applications currently awaiting approval. Prepare a package from Job Discovery or Top 10 Opportunities.
            </div>
          ) : (
            <div className="space-y-4">
              {pendingApprovals.map((app) => (
                <div
                  key={app.id}
                  className="bg-slate-900 border border-amber-500/30 rounded-xl p-6 space-y-4 shadow-sm"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                          Match: {app.match_score}%
                        </span>
                        <h4 className="text-base font-bold text-white">{app.job?.title}</h4>
                        {app.is_outdated === 1 && (
                          <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40 text-[10px] font-bold">
                            ⚠️ Outdated Version
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-300 mt-1">
                        <strong>{app.job?.employer}</strong> • {app.job?.location} • {app.job?.salary_raw || 'Salary Unlisted'}
                      </p>
                      <div className="flex items-center space-x-2 text-[10px] text-slate-400 font-mono mt-1">
                        <span>Source Resume: {app.source_resume_id || 'v1'}</span>
                        <span>•</span>
                        <span>Doc Version: v{app.resume_version || 1}</span>
                        {app.is_outdated === 1 && (
                          <>
                            <span>•</span>
                            <span className="text-red-400 font-bold">Approval Blocked</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      {app.is_outdated === 1 ? (
                        <div className="text-right">
                          <span className="text-xs text-red-400 block mb-1">Generated from older resume version</span>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const res = await fetch('/api/applications/prepare', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ job_id: app.job_id })
                                });
                                if (res.ok) {
                                  setActionMessage('✓ Package regenerated with current active CV!');
                                  await fetchApplications();
                                }
                              } catch (e: any) {
                                setActionMessage('Error regenerating package: ' + e.message);
                              }
                            }}
                            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition-colors shadow-sm"
                          >
                            Regenerate with Active CV
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleApprove(app.id)}
                          disabled={processingId === app.id}
                          className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-xs flex items-center space-x-1.5 transition-colors shadow-sm"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{processingId === app.id ? 'Authorizing...' : 'Approve Application Package'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Summary of Package Contents */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-3 border-t border-slate-800">
                    <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block font-semibold">1. Tailored CV</span>
                      <p className="text-slate-300 mt-1 truncate">ID: {app.tailored_cv_id}</p>
                    </div>

                    <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block font-semibold">2. Cover Letter</span>
                      <p className="text-slate-300 mt-1 truncate">
                        {app.cover_letter ? `${app.cover_letter.substring(0, 60)}...` : 'N/A'}
                      </p>
                    </div>

                    <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block font-semibold">3. Personal Data Disclosure</span>
                      <p className="text-emerald-400 mt-1">Name, Email, City, Nationality, Experience</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 2: Ready to Submit Applications */}
        <div className="space-y-4 pt-4 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <h3 className="text-base font-bold text-white">
                Human-Approved & Ready to Apply ({readyToSubmit.length})
              </h3>
            </div>
            <span className="text-xs text-slate-400">Ready for verified dispatch</span>
          </div>

          {readyToSubmit.length === 0 ? (
            <div className="p-6 text-center text-slate-400 bg-slate-900 border border-slate-800 rounded-xl text-xs">
              No applications currently staged in 'Ready to Apply'.
            </div>
          ) : (
            <div className="space-y-3">
              {readyToSubmit.map((app) => (
                <div
                  key={app.id}
                  className="bg-slate-900 border border-emerald-500/20 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div>
                    <h4 className="text-sm font-bold text-white">{app.job?.title}</h4>
                    <p className="text-xs text-slate-300 mt-0.5">
                      {app.job?.employer} • {app.job?.location}
                    </p>
                    <p className="text-[11px] text-emerald-400 mt-1">
                      Approved at: {app.approved_at || 'Recently'} • Human Authorization Verified
                    </p>
                  </div>

                  <div className="flex items-center space-x-3">
                    {app.job?.source_url && (
                      <a
                        href={app.job.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center space-x-1 border border-slate-700"
                      >
                        <span>Open Careers Portal</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => handleConfirmSubmission(app.id)}
                      disabled={processingId === app.id}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs flex items-center space-x-1.5 transition-colors shadow-sm"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Confirm & Record Submission</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
