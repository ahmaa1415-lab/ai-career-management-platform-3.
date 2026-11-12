'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { ApplicationRecord, PIPELINE_STAGES, PipelineStage } from '@/lib/types';
import {
  Kanban,
  Table as TableIcon,
  Download,
  Search,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Building2,
  Calendar,
  MessageSquare,
  Clock,
  Layers,
  MapPin,
  ChevronDown,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import StatCard from '@/components/ui/StatCard';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';

export default function CRMPage() {
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<ApplicationRecord | null>(null);

  useEffect(() => {
    fetchCRM();
  }, []);

  const fetchCRM = async () => {
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

  const handleStatusChange = async (appId: string, newStatus: PipelineStage) => {
    setUpdatingId(appId);
    setStatusFeedback(null);
    try {
      const res = await fetch('/api/crm/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: appId, new_status: newStatus }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to update status.');
      }

      setStatusFeedback(`Status updated to "${newStatus}"! Persisted in database.`);
      await fetchCRM();
    } catch (err: any) {
      setStatusFeedback(`Error: ${err.message}`);
    } finally {
      setUpdatingId(null);
      setTimeout(() => setStatusFeedback(null), 4000);
    }
  };

  const filteredApps = applications.filter(a => {
    const term = search.toLowerCase();
    return (
      (a.job?.employer || '').toLowerCase().includes(term) ||
      (a.job?.title || '').toLowerCase().includes(term) ||
      (a.notes || '').toLowerCase().includes(term)
    );
  });

  const kanbanColumns: Array<{ title: string; stage: PipelineStage; color: string }> = [
    { title: 'Pending Approval', stage: 'Approval Pending', color: 'border-amber-500/40 text-amber-400' },
    { title: 'Ready to Apply', stage: 'Ready to Apply', color: 'border-indigo-500/40 text-indigo-400' },
    { title: 'Applied / In Review', stage: 'Applied', color: 'border-blue-500/40 text-blue-400' },
    { title: 'Interviewing', stage: 'Interview', color: 'border-purple-500/40 text-purple-400' },
    { title: 'Offer & Hired', stage: 'Offer', color: 'border-emerald-500/40 text-emerald-400' },
  ];

  const totalApplied = applications.filter(a => a.status === 'Applied').length;
  const totalInterview = applications.filter(a => a.status === 'Interview').length;
  const totalPending = applications.filter(a => a.status === 'Approval Pending').length;

  return (
    <div className="flex-1 flex flex-col font-sans">
      <Header
        title="Application CRM & Pipeline Tracking"
        subtitle="Track application lifecycles from generation and human approval to interview schedules"
      />

      <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Metric Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Applications"
            value={applications.length}
            subtitle="In active pipeline"
            icon={<Layers className="w-5 h-5 text-indigo-400" />}
          />
          <StatCard
            title="Awaiting Approval"
            value={totalPending}
            subtitle="Human approval gate"
            icon={<Clock className="w-5 h-5 text-amber-400" />}
            trend={{ label: 'Gate Active', positive: false }}
          />
          <StatCard
            title="Applied & Dispatched"
            value={totalApplied}
            subtitle="Across portals & email"
            icon={<CheckCircle2 className="w-5 h-5 text-blue-400" />}
            trend={{ label: 'Verified', positive: true }}
          />
          <StatCard
            title="Interviews Active"
            value={totalInterview}
            subtitle="Screening & technical"
            icon={<Sparkles className="w-5 h-5 text-emerald-400" />}
            trend={{ label: 'Active', positive: true }}
          />
        </div>

        {/* Feedback Alert */}
        {statusFeedback && (
          <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{statusFeedback}</span>
          </div>
        )}

        {/* Control Toolbar */}
        <Card className="border-slate-800 bg-slate-900/90 p-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by company, position, or notes..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center space-x-2 self-end sm:self-auto">
              <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('kanban')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1.5 transition-colors ${
                    viewMode === 'kanban'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Kanban className="w-3.5 h-3.5" />
                  <span>Kanban</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1.5 transition-colors ${
                    viewMode === 'table'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <TableIcon className="w-3.5 h-3.5" />
                  <span>Data Table</span>
                </button>
              </div>

              <a
                href="/api/crm/status?format=csv"
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 flex items-center space-x-1.5 transition-colors"
                download="applications_crm.csv"
              >
                <Download className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">Export CSV</span>
              </a>
            </div>
          </div>
        </Card>

        {/* Kanban Board View */}
        {viewMode === 'kanban' && (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 items-start">
            {kanbanColumns.map(col => {
              const colApps = filteredApps.filter(a => a.status === col.stage);

              return (
                <div
                  key={col.stage}
                  className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex flex-col space-y-3 min-h-[500px]"
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                    <span className="text-xs font-bold text-slate-200 truncate">{col.title}</span>
                    <Badge variant="default" size="xs">
                      {colApps.length}
                    </Badge>
                  </div>

                  {/* Cards */}
                  <div className="space-y-2.5 flex-1 overflow-y-auto">
                    {colApps.map(app => (
                      <Card
                        key={app.id}
                        hover
                        onClick={() => setSelectedApp(app)}
                        className="p-3 bg-slate-900 border-slate-800 cursor-pointer transition-all hover:border-slate-700"
                      >
                        <div className="flex items-start justify-between gap-1 mb-1.5">
                          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider truncate">
                            {app.job?.employer || 'Direct Employer'}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {app.created_at?.slice(5, 10)}
                          </span>
                        </div>

                        <h4 className="text-xs font-bold text-white line-clamp-2 leading-snug">
                          {app.job?.title || 'Commercial Role'}
                        </h4>

                        <div className="flex items-center text-[10px] text-slate-400 mt-2 space-x-2">
                          <span className="flex items-center truncate">
                            <MapPin className="w-3 h-3 mr-1 text-slate-500 flex-shrink-0" />
                            {app.job?.location || 'Remote'}
                          </span>
                        </div>

                        {app.confirmation_reference && (
                          <div className="mt-2 text-[10px] font-mono text-emerald-400 truncate bg-slate-950 px-2 py-0.5 rounded border border-slate-800/60">
                            Ref: {app.confirmation_reference}
                          </div>
                        )}

                        {/* Status Switcher Selector */}
                        <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between">
                          <select
                            value={app.status}
                            disabled={updatingId === app.id}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handleStatusChange(app.id, e.target.value as PipelineStage)}
                            className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer w-full"
                          >
                            {PIPELINE_STAGES.map(st => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </div>
                      </Card>
                    ))}

                    {colApps.length === 0 && (
                      <div className="h-32 flex items-center justify-center border border-dashed border-slate-800/80 rounded-lg text-[11px] text-slate-500">
                        No applications
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Data Table View */}
        {viewMode === 'table' && (
          <Card className="border-slate-800 bg-slate-900/90 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider font-semibold">
                  <tr>
                    <th className="p-3">Employer & Role</th>
                    <th className="p-3">Location</th>
                    <th className="p-3">Submission Type</th>
                    <th className="p-3">Current Stage</th>
                    <th className="p-3">Reference / Notes</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredApps.map(app => (
                    <tr key={app.id} className="hover:bg-slate-850/50 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-white text-xs">{app.job?.title}</div>
                        <div className="text-[11px] text-indigo-400 font-medium">{app.job?.employer}</div>
                      </td>
                      <td className="p-3 text-slate-300 text-[11px] whitespace-nowrap">
                        {app.job?.location || 'Remote'}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <Badge variant="indigo" size="xs">
                          {app.submission_type || 'Automated'}
                        </Badge>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <select
                          value={app.status}
                          disabled={updatingId === app.id}
                          onChange={(e) => handleStatusChange(app.id, e.target.value as PipelineStage)}
                          className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                        >
                          {PIPELINE_STAGES.map(st => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3 text-[11px] text-slate-400 max-w-xs truncate">
                        {app.confirmation_reference || app.notes || '—'}
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setSelectedApp(app)}
                        >
                          View Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* Application Details Modal */}
      {selectedApp && (
        <Modal
          isOpen={!!selectedApp}
          onClose={() => setSelectedApp(null)}
          title={selectedApp.job?.title || 'Application Details'}
          description={`${selectedApp.job?.employer} • Submitted Application`}
          maxWidth="2xl"
          footer={
            <Button variant="secondary" size="sm" onClick={() => setSelectedApp(null)}>
              Close Details
            </Button>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Employer</span>
                <span className="font-semibold text-white text-sm">{selectedApp.job?.employer}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Location</span>
                <span className="font-semibold text-white">{selectedApp.job?.location}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Submission Type</span>
                <Badge variant="indigo" size="xs">
                  {selectedApp.submission_type || 'Automated'}
                </Badge>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Current Lifecycle Stage</span>
                <Badge variant="success" size="xs">
                  {selectedApp.status}
                </Badge>
              </div>
            </div>

            {selectedApp.confirmation_reference && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-1">
                <span className="text-[10px] uppercase text-emerald-400 font-bold">Confirmation Reference</span>
                <p className="font-mono text-emerald-300 font-semibold">{selectedApp.confirmation_reference}</p>
              </div>
            )}

            <div>
              <span className="text-slate-400 block text-xs font-semibold mb-1">Application Notes & Audit</span>
              <p className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-slate-300 font-mono text-[11px] leading-relaxed">
                {selectedApp.notes || 'Application prepared and verified under human approval gate.'}
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
