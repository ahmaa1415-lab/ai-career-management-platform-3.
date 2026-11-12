'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { ShieldCheck, Search, Filter, Download, RefreshCw, AlertTriangle, CheckCircle2, Lock, ArrowRight, Clock, FileText } from 'lucide-react';
import Link from 'next/link';

export default function AuditLogPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = () => {
    setLoading(true);
    fetch('/api/security/export')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.auditLogs) {
          // Sort newest first
          const sorted = [...data.auditLogs].reverse();
          setLogs(sorted);
          setFilteredLogs(sorted);
        }
      })
      .catch(err => console.error('Error fetching audit logs:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let result = [...logs];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(l => 
        l.action?.toLowerCase().includes(q) ||
        l.details?.toLowerCase().includes(q) ||
        l.id?.toLowerCase().includes(q)
      );
    }
    if (filterType !== 'ALL') {
      result = result.filter(l => l.action?.toLowerCase().includes(filterType.toLowerCase()));
    }
    setFilteredLogs(result);
  }, [search, filterType, logs]);

  const handleExportJSON = () => {
    setExporting(true);
    fetch('/api/security/export')
      .then(r => r.json())
      .then(data => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Audit_Trail_Export_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      })
      .catch(e => console.error('Export failed:', e))
      .finally(() => setExporting(false));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto w-full p-6 space-y-6">
        
        {/* Title & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center space-x-2 text-indigo-400 text-sm font-semibold tracking-wide uppercase mb-1">
              <ShieldCheck className="w-4 h-4" />
              <span>Immutable System Auditing</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Security & Activity Audit Log</h1>
            <p className="text-slate-400 text-sm mt-1">
              Complete verifiable event log recording all AI agent executions, human approvals, security firewall events, and API calls.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={fetchLogs}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition flex items-center"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Refresh
            </button>
            <button
              onClick={handleExportJSON}
              disabled={exporting}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-xl shadow-lg shadow-indigo-600/20 transition flex items-center disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              {exporting ? 'Exporting...' : 'Export Audit Trail (JSON)'}
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-400">Total Indexed Events</div>
            <div className="text-2xl font-bold text-white mt-1">{logs.length}</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-400">Storage Engine</div>
            <div className="text-sm font-semibold text-emerald-400 mt-2 flex items-center">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> SQLite (WAL Mode)
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-400">Human Approval Gate</div>
            <div className="text-sm font-semibold text-indigo-400 mt-2 flex items-center">
              <Lock className="w-3.5 h-3.5 mr-1" /> Active & Enforced
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-400">Prompt Injection Firewall</div>
            <div className="text-sm font-semibold text-purple-400 mt-2 flex items-center">
              <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Intercepting & Logging
            </div>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search by action name, job title, or metadata details..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-400 flex items-center">
              <Filter className="w-3.5 h-3.5 mr-1" /> Filter:
            </span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 px-3 py-2 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Categories</option>
              <option value="AGENT_">AI Agent Runs</option>
              <option value="APPLICATION_">Applications & Auto-Apply</option>
              <option value="SECURITY_">Security & Firewall</option>
              <option value="ORCHESTRATOR_">Orchestrator Pipelines</option>
            </select>
          </div>
        </div>

        {/* Log Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          {loading ? (
            <div className="flex items-center justify-center p-12 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mr-2" /> Loading audit trail records...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center p-12 text-slate-400 text-sm">
              No audit log records match the current filter criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-800/60 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Action / Event</th>
                    <th className="py-3 px-4">User Scope</th>
                    <th className="py-3 px-4">Payload Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredLogs.slice(0, 100).map((log, idx) => (
                    <tr key={log.id || idx} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                        <div className="flex items-center">
                          <Clock className="w-3 h-3 mr-1 text-slate-500" />
                          {log.created_at || 'Just now'}
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          log.action?.includes('SECURITY') || log.action?.includes('FIREWALL')
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : log.action?.includes('ORCHESTRATOR')
                            ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                            : log.action?.includes('AGENT')
                            ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-300 font-mono text-[11px] whitespace-nowrap">
                        {log.user_id || 'System'}
                      </td>
                      <td className="py-3 px-4 text-slate-300 font-mono text-[11px] max-w-md truncate">
                        {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-between items-center text-xs text-slate-400">
            <span>Showing top {Math.min(100, filteredLogs.length)} of {filteredLogs.length} events</span>
            <Link href="/control-center" className="text-indigo-400 hover:underline flex items-center">
              Return to Control Center <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Link>
          </div>
        </div>

      </main>
    </div>
  );
}
