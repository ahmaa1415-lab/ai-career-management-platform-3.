'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import {
  Bell,
  CheckCircle2,
  Mail,
  ShieldAlert,
  Briefcase,
  Clock,
  Filter,
  Check,
  RefreshCw,
  ExternalLink
} from 'lucide-react';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all' | 'application' | 'email' | 'system'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/notifications');
      const json = await res.json();
      if (res.ok && json.notifications) {
        setNotifications(json.notifications);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = notifications.filter((n) => {
    if (filter === 'all') return true;
    return n.type === filter;
  });

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="Notifications & Activity Stream"
        subtitle="Real-time alerts for application confirmations, recruiter communications, and security audits"
      />

      <div className="p-4 sm:p-6 md:p-8 max-w-7xl space-y-6 w-full">
        {/* Filter & Controls Toolbar */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center space-x-2 overflow-x-auto">
            {[
              { id: 'all', label: 'All Alerts' },
              { id: 'application', label: 'Applications' },
              { id: 'email', label: 'Recruiter Mailbox' },
              { id: 'system', label: 'Security & Audit' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  filter === tab.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={fetchNotifications}
            disabled={loading}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors cursor-pointer self-end sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Notifications Feed */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-xs">
              No notifications found for this filter.
            </div>
          ) : (
            filtered.map((n) => {
              const isApp = n.type === 'application';
              const isEmail = n.type === 'email';
              const isSystem = n.type === 'system';

              return (
                <div
                  key={n.id}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all flex items-start justify-between gap-4"
                >
                  <div className="flex items-start space-x-3.5">
                    <div
                      className={`p-2.5 rounded-xl border flex-shrink-0 ${
                        isApp
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                          : isEmail
                          ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                          : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                      }`}
                    >
                      {isApp && <Briefcase className="w-4 h-4" />}
                      {isEmail && <Mail className="w-4 h-4" />}
                      {isSystem && <ShieldAlert className="w-4 h-4" />}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <h4 className="text-xs font-bold text-white">{n.title}</h4>
                        {n.ref && (
                          <span className="text-[10px] font-mono bg-emerald-500/15 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30">
                            {n.ref}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{n.description}</p>
                    </div>
                  </div>

                  <span className="text-[10px] text-slate-400 font-mono flex-shrink-0">
                    {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
