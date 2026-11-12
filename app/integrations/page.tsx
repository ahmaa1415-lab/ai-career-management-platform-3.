'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import {
  Globe,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
  Mail,
  Share2,
  Building2,
  ExternalLink,
  ArrowRight,
  Zap,
  AlertCircle,
  Link as LinkIcon,
  Unlink,
  Check,
  AlertTriangle,
  Plus,
  Compass,
  FileCheck,
  Info,
  Layers,
  Search,
  Lock
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { ExternalIntegrationDefinition, IntegrationStatus } from '@/lib/integrations-center';

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<ExternalIntegrationDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'All' | 'Identity' | 'Professional Network' | 'Regional GCC' | 'Egypt'>('All');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Link Profile Modal State
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<ExternalIntegrationDefinition | null>(null);
  const [profileUrlInput, setProfileUrlInput] = useState('');

  // Import Job URL Modal State
  const [importJobModalOpen, setImportJobModalOpen] = useState(false);
  const [jobUrlInput, setJobUrlInput] = useState('');
  const [jobTitleInput, setJobTitleInput] = useState('');
  const [jobEmployerInput, setJobEmployerInput] = useState('');

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const fetchIntegrations = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/integrations/accounts');
      const data = await res.json();
      if (data.success && data.integrations) {
        setIntegrations(data.integrations);
      }
    } catch (err: any) {
      console.error('Failed to load integrations:', err);
      setFeedback({ type: 'error', message: 'Failed to fetch integrations status from database.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async (serviceId: string) => {
    setActionLoading(serviceId);
    setFeedback(null);
    try {
      const res = await fetch('/api/integrations/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect', service: serviceId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to disconnect service');
      setFeedback({ type: 'success', message: data.message || `${serviceId} disconnected securely.` });
      fetchIntegrations();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleConnectOAuth = async (service: ExternalIntegrationDefinition) => {
    setActionLoading(service.id);
    setFeedback(null);

    if (service.service === 'google') {
      // Check if real Google credentials are configured
      try {
        const res = await fetch('/api/integrations/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'connect', service: 'google' })
        });
        const data = await res.json();
        if (!res.ok) {
          setFeedback({
            type: 'info',
            message: data.message || 'Google OAuth requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. Account is staged in Setup Required mode.'
          });
        } else {
          setFeedback({ type: 'success', message: data.message || 'Google account connected.' });
        }
        fetchIntegrations();
      } catch (err: any) {
        setFeedback({ type: 'error', message: err.message });
      } finally {
        setActionLoading(null);
      }
      return;
    }

    if (service.service === 'linkedin') {
      try {
        const res = await fetch('/api/integrations/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'connect', service: 'linkedin', profileUrl: 'https://linkedin.com/in/aya-h-mahmoud14' })
        });
        const data = await res.json();
        setFeedback({ type: 'success', message: data.message || 'LinkedIn account linked & recruiter SEO synchronized.' });
        fetchIntegrations();
      } catch (err: any) {
        setFeedback({ type: 'error', message: err.message });
      } finally {
        setActionLoading(null);
      }
      return;
    }

    setActionLoading(null);
  };

  const handleSaveProfileUrl = async () => {
    if (!selectedService || !profileUrlInput.trim()) return;
    setActionLoading('save_profile');
    try {
      const res = await fetch('/api/integrations/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'link_profile',
          service: selectedService.service,
          profileUrl: profileUrlInput.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to link profile URL');
      setFeedback({ type: 'success', message: data.message });
      setLinkModalOpen(false);
      fetchIntegrations();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleImportJobUrl = async () => {
    if (!selectedService || !jobUrlInput.trim()) return;
    setActionLoading('import_job');
    try {
      const res = await fetch('/api/integrations/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'import_job_url',
          service: selectedService.service,
          jobUrl: jobUrlInput.trim(),
          jobTitle: jobTitleInput.trim() || undefined,
          employer: jobEmployerInput.trim() || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to import vacancy');
      setFeedback({ type: 'success', message: data.message });
      setImportJobModalOpen(false);
      setJobUrlInput('');
      setJobTitleInput('');
      setJobEmployerInput('');
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const filteredIntegrations = integrations.filter((item) => {
    if (activeFilter === 'Identity') return item.category === 'Identity & Communication';
    if (activeFilter === 'Professional Network') return item.category === 'Professional Network';
    if (activeFilter === 'Regional GCC') return item.category === 'Regional GCC & MENA';
    if (activeFilter === 'Egypt') return item.category === 'Egypt & North Africa';
    return true;
  });

  const getStatusBadge = (status: IntegrationStatus) => {
    switch (status) {
      case 'Connected':
        return <Badge variant="success" size="xs" dot>Connected</Badge>;
      case 'Manual Access':
        return <Badge variant="indigo" size="xs" dot>Manual Access & Linking</Badge>;
      case 'Setup Required':
        return <Badge variant="warning" size="xs">Setup Required</Badge>;
      case 'External Link Only':
        return <Badge variant="default" size="xs">External Link Only</Badge>;
      case 'Not Connected':
        return <Badge variant="default" size="xs">Not Connected</Badge>;
      default:
        return <Badge variant="default" size="xs">{status}</Badge>;
    }
  };

  return (
    <div className="flex-1 flex flex-col font-sans">
      <Header
        title="Connected Accounts & Portal Integrations"
        subtitle="Manage official identity authorizations, regional recruitment portal integrations & verified manual workflows"
      />

      <main className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Top Concept Guidance Banner */}
        <Card className="border-slate-800 bg-gradient-to-r from-slate-900 via-indigo-950/20 to-slate-900 shadow-xl">
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center space-x-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Integration Architecture & Operation Standard</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  Transparent External Account Management
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed">
                  The application distinguishes between <strong>Identity Sign-In</strong>, <strong>External Account Linking</strong>, <strong>Authorized Data Access</strong>, and <strong>External Website Navigation</strong>. No passwords for third-party platforms are ever requested or stored.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchIntegrations}
                  disabled={loading}
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                  Refresh All
                </Button>
                <Link href="/settings">
                  <Button variant="secondary" size="sm">
                    Account Settings →
                  </Button>
                </Link>
              </div>
            </div>

            {/* Architectural Distinctions Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-slate-800/80 text-xs">
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                <span className="text-emerald-400 font-semibold block text-[11px] mb-0.5">1. Sign-In (OAuth)</span>
                <p className="text-slate-400 text-[10px]">Google & LinkedIn identity verification to access this platform.</p>
              </div>
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                <span className="text-blue-400 font-semibold block text-[11px] mb-0.5">2. Manual Linking</span>
                <p className="text-slate-400 text-[10px]">Candidate public URLs (Naukrigulf, Bayt, Wuzzuf) for verified tracking.</p>
              </div>
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                <span className="text-indigo-400 font-semibold block text-[11px] mb-0.5">3. Job Ingestion</span>
                <p className="text-slate-400 text-[10px]">Pasting public job URLs to disaggregate roles with direct source attribution.</p>
              </div>
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                <span className="text-purple-400 font-semibold block text-[11px] mb-0.5">4. Safe Navigation</span>
                <p className="text-slate-400 text-[10px]">Opening official employer and portal sites without password harvesting.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User Feedback Alert */}
        {feedback && (
          <div
            className={`p-4 rounded-xl border text-xs sm:text-sm flex items-start space-x-2.5 ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : feedback.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
            ) : feedback.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            ) : (
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <span>{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-white text-xs ml-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* Filter Bar */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 overflow-x-auto">
          <div className="flex items-center space-x-2 text-xs">
            {(['All', 'Identity', 'Professional Network', 'Regional GCC', 'Egypt'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveFilter(cat)}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                  activeFilter === cat
                    ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40'
                    : 'text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <span className="text-xs text-slate-500 hidden sm:inline">
            Showing {filteredIntegrations.length} verified channels
          </span>
        </div>

        {/* Integration Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredIntegrations.map((item) => (
            <Card
              key={item.id}
              className="border-slate-800 bg-slate-900/90 shadow-xl flex flex-col justify-between hover:border-slate-700 transition-colors"
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center p-2 flex-shrink-0">
                      {item.service === 'google' && <GoogleIcon className="w-6 h-6" />}
                      {item.service === 'linkedin' && <LinkedInIcon className="w-6 h-6 text-[#0A66C2]" />}
                      {item.service === 'naukrigulf' && <Building2 className="w-5 h-5 text-amber-400" />}
                      {item.service === 'bayt' && <Globe className="w-5 h-5 text-emerald-400" />}
                      {item.service === 'wuzzuf' && <Compass className="w-5 h-5 text-blue-400" />}
                    </div>
                    <div>
                      <CardTitle className="text-base text-white">{item.name}</CardTitle>
                      <CardDescription className="text-xs">{item.category}</CardDescription>
                    </div>
                  </div>

                  {getStatusBadge(item.status)}
                </div>
              </CardHeader>

              <CardContent className="space-y-4 text-xs">
                <p className="text-slate-300 leading-relaxed text-xs">
                  {item.description}
                </p>

                {/* Profile / Account Meta if available */}
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Integration Mode:</span>
                    <span className="text-slate-200 font-medium">{item.auth_type}</span>
                  </div>

                  {item.profile_url ? (
                    <div className="space-y-0.5">
                      <span className="text-slate-500 block">Linked Public Profile:</span>
                      <a
                        href={item.profile_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-400 hover:underline truncate block font-mono"
                      >
                        {item.profile_url}
                      </a>
                    </div>
                  ) : (
                    <div className="text-slate-500 italic">No public profile URL currently linked.</div>
                  )}

                  {item.last_synced_at && (
                    <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/80">
                      Last Activity: {new Date(item.last_synced_at).toLocaleString()}
                    </div>
                  )}
                </div>

                {/* Supported Capabilities */}
                <div>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Supported Capabilities
                  </span>
                  <ul className="space-y-1 text-slate-300 text-[11px]">
                    {item.supported_capabilities.map((cap, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                        <span>{cap}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Unsupported / Blockers Disclaimer */}
                {item.blockers_or_notes && (
                  <div className="p-2.5 bg-slate-950/80 rounded-lg border border-slate-800/80 text-[10px] text-slate-400 leading-relaxed">
                    <strong className="text-slate-300">Operational Note: </strong>
                    {item.blockers_or_notes}
                  </div>
                )}
              </CardContent>

              <CardFooter className="bg-slate-950/40 border-t border-slate-800/80 p-4 flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2 w-full">
                  {/* Action 1: External Link */}
                  <a
                    href={item.external_url}
                    target="_blank"
                    rel="noreferrer"
                    className="py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium border border-slate-800 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>Open Portal</span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                  </a>

                  {/* Action 2: Import Job Vacancy URL */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedService(item);
                      setImportJobModalOpen(true);
                    }}
                    className="py-2 px-3 rounded-lg bg-indigo-950/40 hover:bg-indigo-900/50 text-indigo-300 text-xs font-medium border border-indigo-800/40 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Import Job</span>
                  </button>
                </div>

                {/* Primary Connection Actions */}
                <div className="w-full flex items-center gap-2 pt-1">
                  {item.auth_type.includes('Manual') ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedService(item);
                        setProfileUrlInput(item.profile_url || '');
                        setLinkModalOpen(true);
                      }}
                      className="w-full text-xs"
                    >
                      <LinkIcon className="w-3.5 h-3.5 mr-1.5 text-indigo-400" />
                      {item.profile_url ? 'Update Profile Link' : 'Link Public Profile'}
                    </Button>
                  ) : (
                    <>
                      {item.status === 'Connected' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDisconnect(item.service)}
                          loading={actionLoading === item.service}
                          className="w-full text-xs text-rose-400 hover:text-rose-300 border-rose-900/40 hover:bg-rose-950/20"
                        >
                          <Unlink className="w-3.5 h-3.5 mr-1.5" />
                          Disconnect Account
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleConnectOAuth(item)}
                          loading={actionLoading === item.id}
                          className="w-full text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                          {item.status === 'Setup Required' ? 'Configure & Connect' : 'Authorize & Connect'}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>

        {/* Modal: Link Public Profile URL */}
        {linkModalOpen && selectedService && (
          <Modal
            isOpen={linkModalOpen}
            onClose={() => setLinkModalOpen(false)}
            title={`Link Public Profile: ${selectedService.name}`}
          >
            <div className="space-y-4 text-xs">
              <p className="text-slate-300 leading-relaxed">
                Provide your public candidate profile or vanity URL on <strong>{selectedService.name}</strong>. The system preserves source attribution for imported applications. We never ask for your account password.
              </p>

              <div>
                <label className="block text-slate-300 font-medium mb-1.5">
                  Public Profile URL
                </label>
                <div className="relative">
                  <LinkIcon className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="url"
                    value={profileUrlInput}
                    onChange={(e) => setProfileUrlInput(e.target.value)}
                    placeholder={`https://www.${selectedService.service}.com/candidate/...`}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span>
                  Zero Password Policy: The application never automates login through unauthorized scraping. Applications are recorded with explicit source links.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="xs" onClick={() => setLinkModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="xs"
                  onClick={handleSaveProfileUrl}
                  loading={actionLoading === 'save_profile'}
                >
                  Save Profile Link
                </Button>
              </div>
            </div>
          </Modal>
        )}

        {/* Modal: Import Job Vacancy URL */}
        {importJobModalOpen && selectedService && (
          <Modal
            isOpen={importJobModalOpen}
            onClose={() => setImportJobModalOpen(false)}
            title={`Import Vacancy from ${selectedService.name}`}
          >
            <div className="space-y-4 text-xs">
              <p className="text-slate-300 leading-relaxed">
                Paste any active job posting URL from <strong>{selectedService.name}</strong>. The platform will index the vacancy into your pipeline with verified source attribution.
              </p>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Vacancy Posting URL
                </label>
                <input
                  type="url"
                  value={jobUrlInput}
                  onChange={(e) => setJobUrlInput(e.target.value)}
                  placeholder={`https://www.${selectedService.service}.com/jobs/...`}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Job Title (Optional)
                  </label>
                  <input
                    type="text"
                    value={jobTitleInput}
                    onChange={(e) => setJobTitleInput(e.target.value)}
                    placeholder="e.g. Category Manager"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Employer Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={jobEmployerInput}
                    onChange={(e) => setJobEmployerInput(e.target.value)}
                    placeholder="e.g. Multinational FMCG"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="xs" onClick={() => setImportJobModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="xs"
                  onClick={handleImportJobUrl}
                  loading={actionLoading === 'import_job'}
                >
                  Import Vacancy
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </main>
    </div>
  );
}

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

function LinkedInIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
    </svg>
  );
}
