'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { DailyReportRecord } from '@/lib/types';
import {
  BarChart3,
  Calendar,
  Clock,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  FileText
} from 'lucide-react';

export default function ReportsPage() {
  const [reports, setReports] = useState<DailyReportRecord[]>([]);
  const [selectedReport, setSelectedReport] = useState<DailyReportRecord | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/reports/daily');
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
        if (data.reports && data.reports.length > 0 && !selectedReport) {
          setSelectedReport(data.reports[0]);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateNow = async () => {
    setGenerating(true);
    setMessage(null);
    try {
      const res = await fetch('/api/reports/daily', { method: 'POST' });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to generate report.');
      }
      const data = await res.json();
      setMessage('New Daily Executive Report generated & archived successfully!');
      await fetchReports();
      setSelectedReport(data.report);
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="Analytics & Daily Executive Reporting"
        subtitle="Automated daily career intelligence summary scheduled for 11:00 PM Africa/Cairo time"
      />

      <div className="p-4 sm:p-6 md:p-8 max-w-7xl space-y-6 w-full overflow-hidden">
        {/* Schedule & Trigger Banner */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center space-x-3.5">
            <div className="p-2.5 sm:p-3 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20 flex-shrink-0">
              <Clock className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Daily Automation Engine: Africa/Cairo (UTC+2)</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Target Schedule: <strong>Every day at 11:00 PM Cairo time</strong>. Aggregates vacancies, top matches, pipeline changes, and next-day priorities.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGenerateNow}
            disabled={generating}
            className="w-full sm:w-auto px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center space-x-2 transition-colors flex-shrink-0 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
            <span>{generating ? 'Compiling Report...' : 'Trigger Daily Report Now'}</span>
          </button>
        </div>

        {message && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {/* Report View Split */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Archived Reports Selector */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider pb-1">
              Archived Reports ({reports.length})
            </h3>

            <div className="space-y-2">
              {reports.map((r) => (
                <div
                  key={r.id}
                  onClick={() => setSelectedReport(r)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    selectedReport?.id === r.id
                      ? 'bg-slate-900 border-emerald-500/50 shadow-md'
                      : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                    <span>{r.report_date}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-emerald-400 font-mono">
                      {r.timezone.split('/')[1]}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Generated: {r.generated_at?.split(' ')[1] || 'Archived'}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Full Markdown Report Reader */}
          <div className="lg:col-span-3">
            {selectedReport ? (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 space-y-6 shadow-sm">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div>
                    <span className="text-xs font-bold text-emerald-400">Archived Executive Summary</span>
                    <h3 className="text-lg font-bold text-white mt-1">Daily Briefing — {selectedReport.report_date}</h3>
                  </div>
                  <span className="text-xs font-mono text-slate-400 bg-slate-950 px-3 py-1 rounded border border-slate-800">
                    Timezone: {selectedReport.timezone}
                  </span>
                </div>

                <div className="prose prose-invert max-w-none text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed bg-slate-950 p-6 rounded-xl border border-slate-800">
                  {selectedReport.content_markdown}
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-slate-500 bg-slate-900 border border-slate-800 rounded-xl">
                Select an archived report to view full summary.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
