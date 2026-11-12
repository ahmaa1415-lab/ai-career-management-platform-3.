'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import {
  ShieldCheck,
  Download,
  Trash2,
  Lock,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Key,
  Database,
  Share2,
  ExternalLink,
  RefreshCw,
  Eye,
  EyeOff,
  Save,
  Check,
  Sparkles,
  Building2,
  Copy,
  Globe,
  User,
  Bell,
  Sliders,
  Laptop,
  LogOut,
  Mail,
  ShieldAlert,
  Unlink
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { ExternalIntegrationDefinition } from '@/lib/integrations-center';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'personal' | 'security' | 'connected' | 'privacy' | 'notifications'>('personal');
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Tab 1: Personal Profile
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [timezone, setTimezone] = useState('Africa/Cairo');
  const [language, setLanguage] = useState('en');
  const [savingProfile, setSavingProfile] = useState(false);

  // Tab 2: Security
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Tab 3: Connected Accounts
  const [integrations, setIntegrations] = useState<ExternalIntegrationDefinition[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);
  const [portalAccounts, setPortalAccounts] = useState<any[]>([]);
  const [copiedAccRef, setCopiedAccRef] = useState<string | null>(null);

  // Tab 4: Privacy & GDPR
  const [wipeConfirm, setWipeConfirm] = useState('');
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [wiping, setWiping] = useState(false);

  // Tab 5: Notifications & UI Preferences
  const [notifications, setNotifications] = useState({
    job_alerts_enabled: true,
    match_alerts_enabled: true,
    application_status_alerts: true,
    recruiter_activity_alerts: true,
    interview_reminders: true,
    daily_reports_enabled: true,
    rtl_enabled: false
  });
  const [savingNotifications, setSavingNotifications] = useState(false);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchProfile(),
        fetchSessions(),
        fetchIntegrations(),
        fetchPortalAccounts(),
        fetchNotifications()
      ]);
    } catch (e) {
      console.error('Error loading settings:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfile = async () => {
    const res = await fetch('/api/settings/profile');
    if (res.ok) {
      const data = await res.json();
      if (data.user) {
        setFullName(data.user.full_name || '');
        setEmail(data.user.email || '');
        setTimezone(data.user.timezone || 'Africa/Cairo');
        setLanguage(data.user.language || 'en');
      }
    }
  };

  const fetchSessions = async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch('/api/auth/active-sessions');
      if (res.ok) {
        const data = await res.json();
        setActiveSessions(data.sessions || []);
      }
    } finally {
      setLoadingSessions(false);
    }
  };

  const fetchIntegrations = async () => {
    setLoadingIntegrations(true);
    try {
      const res = await fetch('/api/integrations/accounts');
      if (res.ok) {
        const data = await res.json();
        setIntegrations(data.integrations || []);
      }
    } finally {
      setLoadingIntegrations(false);
    }
  };

  const fetchPortalAccounts = async () => {
    try {
      const res = await fetch('/api/portal-accounts');
      if (res.ok) {
        const data = await res.json();
        setPortalAccounts(data.accounts || []);
      }
    } catch {}
  };

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/settings/notifications');
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          setNotifications({
            job_alerts_enabled: Boolean(data.settings.job_alerts_enabled),
            match_alerts_enabled: Boolean(data.settings.match_alerts_enabled),
            application_status_alerts: Boolean(data.settings.application_status_alerts),
            recruiter_activity_alerts: Boolean(data.settings.recruiter_activity_alerts),
            interview_reminders: Boolean(data.settings.interview_reminders),
            daily_reports_enabled: Boolean(data.settings.daily_reports_enabled),
            rtl_enabled: Boolean(data.settings.rtl_enabled)
          });
        }
      }
    } catch {}
  };

  // Handlers
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/settings/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, timezone, language })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update personal settings.');
      setStatusMessage('Personal profile settings saved & updated in vault.');
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangingPassword(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword: confirmNewPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update password.');
      setStatusMessage('Password updated successfully. All other sessions terminated for security.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      fetchSessions();
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setChangingPassword(false);
    }
  };

  const handleRevokeSession = async (sessionId?: string, revokeAll?: boolean) => {
    try {
      const url = revokeAll
        ? '/api/auth/active-sessions?all=true'
        : `/api/auth/active-sessions?id=${sessionId}`;
      const res = await fetch(url, { method: 'DELETE' });
      if (res.ok) {
        if (revokeAll) {
          window.location.href = '/login';
          return;
        }
        fetchSessions();
        setStatusMessage('Session terminated successfully.');
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch (e: any) {
      setErrorMessage(e.message);
    }
  };

  const handleSaveNotifications = async () => {
    setSavingNotifications(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/settings/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notifications)
      });
      if (res.ok) {
        setStatusMessage('Notification and UI preferences saved successfully.');
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } finally {
      setSavingNotifications(false);
    }
  };

  const handleExportData = () => {
    window.open('/api/security/export', '_blank');
  };

  const handleWipeData = async () => {
    if (wipeConfirm !== 'DELETE MY DATA') return;
    setWiping(true);
    try {
      const res = await fetch('/api/security/wipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'DELETE MY DATA' })
      });
      if (res.ok) {
        window.location.href = '/login';
      }
    } catch (err) {
      console.error(err);
    } finally {
      setWiping(false);
    }
  };

  return (
    <div className={`flex-1 flex flex-col font-sans ${notifications.rtl_enabled ? 'rtl' : ''}`}>
      <Header
        title="Settings, Security & Account Center"
        subtitle="Configure personal credentials, active sessions, external integrations, privacy, and notifications"
      />

      <main className="p-4 sm:p-6 md:p-8 max-w-6xl mx-auto w-full space-y-6">
        {/* Status Alerts */}
        {statusMessage && (
          <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs sm:text-sm flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs sm:text-sm flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* 5-Tab Navigation Bar */}
        <div className="border-b border-slate-800 flex overflow-x-auto gap-2 pb-px scrollbar-none">
          {[
            { id: 'personal', label: '1. Personal Account', icon: User },
            { id: 'security', label: '2. Security & Sessions', icon: Lock },
            { id: 'connected', label: '3. Connected Accounts', icon: Globe },
            { id: 'privacy', label: '4. Privacy & Data Governance', icon: ShieldCheck },
            { id: 'notifications', label: '5. Notifications & Interface', icon: Bell }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'border-emerald-500 text-emerald-400 bg-slate-900/60'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* TAB 1: Personal Account */}
        {activeTab === 'personal' && (
          <div className="space-y-6">
            <Card className="border-slate-800 bg-slate-900/90 shadow-xl">
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-emerald-500 flex items-center justify-center text-white font-bold text-sm shadow-md">
                    {fullName.charAt(0)}
                  </div>
                  <div>
                    <CardTitle className="text-base text-white">Personal Account Information</CardTitle>
                    <CardDescription className="text-xs">
                      Update your candidate legal identity, primary email, and regional preferences
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-medium text-slate-300 mb-1.5">
                        Full Legal / Professional Name
                      </label>
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-slate-300 mb-1.5">
                        Primary Account Email
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-slate-300 mb-1.5">
                        Primary Timezone
                      </label>
                      <select
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="Africa/Cairo">Africa/Cairo (EET, UTC+2)</option>
                        <option value="Asia/Dubai">Asia/Dubai (GST, UTC+4)</option>
                        <option value="Asia/Riyadh">Asia/Riyadh (AST, UTC+3)</option>
                        <option value="Europe/Berlin">Europe/Berlin (CET, UTC+1)</option>
                        <option value="Europe/London">Europe/London (GMT, UTC+0)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-medium text-slate-300 mb-1.5">
                        System Interface Language
                      </label>
                      <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="en">English (Default)</option>
                        <option value="ar">العربية (Arabic)</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      loading={savingProfile}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white"
                    >
                      <Save className="w-3.5 h-3.5 mr-1.5" />
                      Save Personal Information
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {/* TAB 2: Security & Sessions */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            {/* Change Password Card */}
            <Card className="border-slate-800 bg-slate-900/90 shadow-xl">
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Lock className="w-5 h-5 text-indigo-400" />
                  <CardTitle className="text-base text-white">Change Master Password</CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Passwords must be at least 8 characters long and contain both letters and numbers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleChangePassword} className="space-y-4 text-xs max-w-xl">
                  <div>
                    <label className="block font-medium text-slate-300 mb-1">Current Password</label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      placeholder="Enter current password"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium text-slate-300 mb-1">New Password</label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        placeholder="At least 8 chars"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-slate-300 mb-1">Confirm New Password</label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        required
                        placeholder="Re-enter new password"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center space-x-2 text-slate-400 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={showPassword}
                        onChange={(e) => setShowPassword(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span>Show passwords</span>
                    </label>

                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      loading={changingPassword}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white"
                    >
                      Update Password
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Active Sessions Card */}
            <Card className="border-slate-800 bg-slate-900/90 shadow-xl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Laptop className="w-5 h-5 text-emerald-400" />
                    <div>
                      <CardTitle className="text-base text-white">Active Sessions & Device Activity</CardTitle>
                      <CardDescription className="text-xs">
                        View authorized sessions currently logged in to your career management vault
                      </CardDescription>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => handleRevokeSession(undefined, true)}
                    className="text-rose-400 border-rose-900/40 hover:bg-rose-950/20 text-xs"
                  >
                    <LogOut className="w-3.5 h-3.5 mr-1" />
                    Logout from All Sessions
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {activeSessions.length === 0 ? (
                  <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-400 text-center">
                    Current active browser session (HTTP-only cookie authenticated).
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeSessions.map((sess) => (
                      <div
                        key={sess.id}
                        className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-200">
                              {sess.user_agent?.includes('Mozilla') ? 'Web Browser' : 'Client Device'}
                            </span>
                            <Badge variant="success" size="xs" dot>
                              Active
                            </Badge>
                          </div>
                          <p className="text-[11px] text-slate-400 font-mono">
                            IP: {sess.ip_address} • Logged in: {new Date(sess.created_at).toLocaleString()}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRevokeSession(sess.id)}
                          className="px-2.5 py-1 rounded bg-slate-900 hover:bg-rose-950/30 text-rose-400 border border-slate-800 hover:border-rose-900/40 text-[11px] transition-colors"
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* TAB 3: Connected Accounts */}
        {activeTab === 'connected' && (
          <div className="space-y-6">
            <Card className="border-slate-800 bg-slate-900/90 shadow-xl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base text-white">External Account Integrations</CardTitle>
                    <CardDescription className="text-xs">
                      Review connections across Google, LinkedIn, Naukrigulf, Bayt, and WUZZUF
                    </CardDescription>
                  </div>
                  <Link href="/integrations">
                    <Button variant="outline" size="xs">
                      Open Integration Center →
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {integrations.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{item.name}</span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            item.status === 'Connected'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : item.status === 'Manual Access'
                              ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/30'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11px]">{item.description}</p>
                      {item.profile_url && (
                        <a
                          href={item.profile_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-400 text-[11px] hover:underline inline-flex items-center gap-1 font-mono"
                        >
                          {item.profile_url} <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <a
                        href={item.external_url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs border border-slate-800 flex items-center gap-1"
                      >
                        Visit <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Portal Accounts Vault */}
            {portalAccounts.length > 0 && (
              <Card className="border-slate-800 bg-slate-900/90 shadow-xl">
                <CardHeader>
                  <CardTitle className="text-base text-white">Company Portal Accounts Vault ({portalAccounts.length})</CardTitle>
                  <CardDescription className="text-xs">
                    Credentials and confirmation references for applicant portals
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {portalAccounts.map((acc) => (
                      <div key={acc.id} className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-white">{acc.employer}</span>
                          <Badge variant="indigo" size="xs">{acc.portal_platform}</Badge>
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono">User: {acc.account_email}</p>
                        {acc.confirmation_reference && (
                          <div className="text-[10px] text-emerald-400 font-mono">
                            Ref: {acc.confirmation_reference}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* TAB 4: Privacy & Data Governance */}
        {activeTab === 'privacy' && (
          <div className="space-y-6">
            <Card className="border-slate-800 bg-slate-900/90 shadow-xl">
              <CardHeader>
                <CardTitle className="text-base text-white">GDPR & Data Portability</CardTitle>
                <CardDescription className="text-xs">
                  Export complete candidate dossier, audit trails, and application history as machine-readable JSON
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                <p className="text-slate-300 leading-relaxed">
                  Under GDPR Article 20, you retain full rights to your career data. Export your candidate profile, master CV, tailored versions, job evaluations, CRM pipeline, and audit logs.
                </p>

                <div className="pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportData}
                    className="text-xs text-indigo-400 border-indigo-900/40 hover:bg-indigo-950/20"
                  >
                    <Download className="w-4 h-4 mr-1.5" />
                    Download Complete GDPR Data Archive (.JSON)
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Account Deletion / Data Wipe */}
            <Card className="border-rose-950/60 bg-rose-950/10 shadow-xl">
              <CardHeader>
                <div className="flex items-center space-x-2 text-rose-400">
                  <Trash2 className="w-5 h-5" />
                  <CardTitle className="text-base text-rose-300">Danger Zone: Right to Be Forgotten</CardTitle>
                </div>
                <CardDescription className="text-xs text-rose-400/80">
                  Permanently delete all candidate records, uploaded CVs, evaluations, and CRM pipelines
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <p className="text-slate-300 leading-relaxed">
                  This action is irreversible. All profile data, CVs, evaluation scores, portal accounts, and application records will be purged immediately from the SQLite database.
                </p>

                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowWipeModal(true)}
                    className="border-rose-800 text-rose-400 hover:bg-rose-900/30 text-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    Initiate Account Deletion & Data Wipe
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Wipe Modal */}
            {showWipeModal && (
              <Modal
                isOpen={showWipeModal}
                onClose={() => setShowWipeModal(false)}
                title="Confirm Complete Data Erasure"
              >
                <div className="space-y-4 text-xs">
                  <p className="text-rose-300">
                    To confirm permanent deletion of all data associated with <strong>{email}</strong>, type <strong>DELETE MY DATA</strong> below:
                  </p>
                  <input
                    type="text"
                    value={wipeConfirm}
                    onChange={(e) => setWipeConfirm(e.target.value)}
                    placeholder="DELETE MY DATA"
                    className="w-full bg-slate-950 border border-rose-900 rounded-lg p-2 text-xs text-rose-200"
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="xs" onClick={() => setShowWipeModal(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="xs"
                      onClick={handleWipeData}
                      loading={wiping}
                      disabled={wipeConfirm !== 'DELETE MY DATA'}
                      className="bg-rose-600 hover:bg-rose-500 text-white"
                    >
                      Permanently Wipe Everything
                    </Button>
                  </div>
                </div>
              </Modal>
            )}
          </div>
        )}

        {/* TAB 5: Notifications & Interface */}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <Card className="border-slate-800 bg-slate-900/90 shadow-xl">
              <CardHeader>
                <CardTitle className="text-base text-white">Notification Stream Preferences</CardTitle>
                <CardDescription className="text-xs">
                  Select which career milestones and recruiter signals trigger alerts
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                <div className="space-y-3">
                  {[
                    { key: 'job_alerts_enabled', label: 'Fresh Verified Job Alerts', desc: 'Notify when high-relevance vacancies (<48h) are discovered in UAE, KSA, or Egypt.' },
                    { key: 'match_alerts_enabled', label: '85%+ High-Fit Match Alerts', desc: 'Immediate notification when an opportunity surpasses 85% on 9-dimension career fit.' },
                    { key: 'application_status_alerts', label: 'Application Status Updates', desc: 'Alerts when applications advance from Shortlist to Applied or Interviewing.' },
                    { key: 'recruiter_activity_alerts', label: 'LinkedIn Recruiter Signals', desc: 'Alerts when verified recruiters post new hiring announcements in FMCG & Commercial.' },
                    { key: 'interview_reminders', label: 'Interview Preparation Reminders', desc: 'STAR model questions and company background briefings scheduled before interviews.' },
                    { key: 'daily_reports_enabled', label: 'Daily Executive Briefings', desc: 'Automated 20:30 Cairo briefing summarizing daily application submissions and pipeline health.' }
                  ].map((item) => (
                    <label
                      key={item.key}
                      className="flex items-start space-x-3 p-3 bg-slate-950 rounded-xl border border-slate-800/80 cursor-pointer hover:border-slate-700 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={(notifications as any)[item.key]}
                        onChange={(e) =>
                          setNotifications({
                            ...notifications,
                            [item.key]: e.target.checked
                          })
                        }
                        className="rounded border-slate-700 bg-slate-900 text-emerald-600 focus:ring-0 w-4 h-4 mt-0.5"
                      />
                      <div>
                        <span className="font-semibold text-slate-200 block text-xs">{item.label}</span>
                        <span className="text-[11px] text-slate-400">{item.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Interface RTL Toggle */}
                <div className="pt-4 border-t border-slate-800">
                  <span className="text-xs font-semibold text-white block mb-2">Display & Layout Preferences</span>
                  <label className="flex items-start space-x-3 p-3 bg-slate-950 rounded-xl border border-slate-800/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifications.rtl_enabled}
                      onChange={(e) =>
                        setNotifications({
                          ...notifications,
                          rtl_enabled: e.target.checked
                        })
                      }
                      className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0 w-4 h-4 mt-0.5"
                    />
                    <div>
                      <span className="font-semibold text-slate-200 block text-xs">Enable RTL Layout (Arabic Orientation)</span>
                      <span className="text-[11px] text-slate-400">Switches directional text flow for Arabic language reading.</span>
                    </div>
                  </label>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSaveNotifications}
                    loading={savingNotifications}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    Save Preferences
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
