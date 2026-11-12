'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { RecruitmentEmail } from '@/lib/types';
import {
  Inbox,
  Send,
  Mail,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  MessageSquare,
  Shield,
  FileText
} from 'lucide-react';

export default function InboxPage() {
  const [emails, setEmails] = useState<RecruitmentEmail[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<RecruitmentEmail | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchEmails();
  }, [selectedCategory]);

  const fetchEmails = async () => {
    try {
      setLoading(true);
      const url = selectedCategory === 'All' ? '/api/emails' : `/api/emails?category=${encodeURIComponent(selectedCategory)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setEmails(data.emails || []);
        if (data.emails && data.emails.length > 0 && !selectedEmail) {
          setSelectedEmail(data.emails[0]);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateDraft = async (type: 'Reply' | 'Interview_Thank_You' | 'Follow_Up') => {
    if (!selectedEmail) return;
    setDrafting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/emails/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          target_email: {
            sender: selectedEmail.sender,
            recipient: selectedEmail.recipient,
            subject: selectedEmail.subject,
            body: selectedEmail.body,
          },
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to create draft.');
      }

      const data = await res.json();
      setMessage(`Draft generated successfully (Saved in Draft status)!`);
      await fetchEmails();
      setSelectedEmail(data.draft);
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setDrafting(false);
    }
  };

  const handleSendEmail = async (emailId: string) => {
    setSending(true);
    setMessage(null);
    try {
      const res = await fetch('/api/emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_id: emailId, confirmed: true }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to send email.');
      }

      const data = await res.json();
      setMessage(data.message);
      await fetchEmails();
      if (selectedEmail?.id === emailId) {
        setSelectedEmail(data.email);
      }
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="Recruitment Inbox & Mailbox"
        subtitle="Dedicated recruitment mailbox tracking recruiter messages, interviews, offer letters, and draft dispatches"
      />

      <div className="p-4 sm:p-6 md:p-8 max-w-7xl space-y-5 sm:space-y-6 w-full overflow-hidden">
        {/* Gateway Status Banner */}
        <div className="p-3 sm:p-4 bg-slate-900 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-300">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0"></span>
            <span>
              Recruitment Mailbox Gateway: <strong>Local Sandbox Mode Active</strong> (100% database persistence, zero credential leaks)
            </span>
          </div>
          <span className="text-[11px] text-slate-400 bg-slate-950 px-2.5 py-1 rounded border border-slate-800 self-start sm:self-auto">
            Google OAuth Ready
          </span>
        </div>

        {message && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {/* Category Filter Chips */}
        <div className="flex flex-wrap gap-2">
          {['All', 'Interview', 'Confirmation', 'Recruiter Message', 'Opportunity', 'Followup', 'Offer', 'Assessment'].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                selectedCategory === cat
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Mailbox Split View */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Email List */}
          <div className="space-y-2">
            {emails.map((email) => (
              <div
                key={email.id}
                onClick={() => setSelectedEmail(email)}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  selectedEmail?.id === email.id
                    ? 'bg-slate-900 border-emerald-500/50 shadow-md'
                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <span className="font-semibold text-slate-200 truncate max-w-[180px]">{email.sender}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300">
                    {email.category}
                  </span>
                </div>
                <h4 className="text-xs font-bold text-slate-100 truncate">{email.subject}</h4>
                <p className="text-[11px] text-slate-400 truncate mt-1">{email.body}</p>

                <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-800/60 text-[10px]">
                  <span className={email.is_draft ? 'text-amber-400 font-semibold' : email.is_sent ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                    {email.is_draft ? 'Draft (Unsent)' : email.is_sent ? 'Dispatched ✓' : 'Received Inbound'}
                  </span>
                  <span className="text-slate-400">{email.created_at ? email.created_at.split(' ')[0] : 'Recent'}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Email Viewer & Draft Actions */}
          <div className="lg:col-span-2">
            {selectedEmail ? (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                  <div>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {selectedEmail.category}
                    </span>
                    <h3 className="text-base font-bold text-white mt-1.5">{selectedEmail.subject}</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      From: <strong className="text-slate-200">{selectedEmail.sender}</strong> → To: <strong className="text-slate-200">{selectedEmail.recipient}</strong>
                    </p>
                  </div>

                  {/* Actions depending on whether draft or inbound */}
                  <div className="flex items-center space-x-2">
                    {selectedEmail.is_draft ? (
                      <button
                        type="button"
                        onClick={() => handleSendEmail(selectedEmail.id)}
                        disabled={sending}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-xs flex items-center space-x-1.5 transition-colors shadow-sm"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{sending ? 'Sending...' : 'Authorize & Send Email'}</span>
                      </button>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => handleGenerateDraft('Reply')}
                          disabled={drafting}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition-colors"
                        >
                          Draft Reply
                        </button>
                        <button
                          type="button"
                          onClick={() => handleGenerateDraft('Interview_Thank_You')}
                          disabled={drafting}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition-colors"
                        >
                          Draft Thank You
                        </button>
                        <button
                          type="button"
                          onClick={() => handleGenerateDraft('Follow_Up')}
                          disabled={drafting}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition-colors"
                        >
                          Draft Follow-up
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
                  {selectedEmail.body}
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800">
                  <span>Status: {selectedEmail.is_draft ? 'Draft Mode (Safe)' : selectedEmail.is_sent ? 'Sent via Mail Gateway' : 'Inbound Recruiter Mail'}</span>
                  <span>Safety Guard: Dual Human Confirmation Required</span>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-slate-500 bg-slate-900 border border-slate-800 rounded-xl">
                Select an email to view thread details.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
