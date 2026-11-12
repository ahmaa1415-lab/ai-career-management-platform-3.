'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import {
  ShieldCheck,
  Lock,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Mail,
  Eye,
  EyeOff,
  UserCheck,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';

export default function LoginPage() {
  const [candidate, setCandidate] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [oauthNotice, setOauthNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/profile')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.candidate) {
          setCandidate(data.candidate);
          if (data.candidate.profile?.email) {
            setEmail(data.candidate.profile.email);
          }
        }
      })
      .catch(err => console.error('Error fetching profile:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigningIn(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setOauthNotice(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          rememberMe
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed. Please verify your credentials.');
      }

      setSuccessMessage('Authenticated successfully. Restoring candidate session...');
      setTimeout(() => {
        const redirectParam = typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('redirect')
          : null;
        window.location.href = redirectParam || '/control-center';
      }, 600);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSigningIn(false);
    }
  };

  const handleOAuthSignIn = (provider: 'google' | 'linkedin') => {
    setOauthNotice(
      provider === 'google'
        ? 'Google Sign-In: Directs to Google OAuth 2.0. If GOOGLE_CLIENT_ID is not configured in environment, please use standard candidate credentials.'
        : 'LinkedIn Sign-In: Connects via LinkedIn OpenID. Review settings in Connected Accounts.'
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header title="Candidate Authentication" subtitle="Secure Executive Login & Career Vault" />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md">
          <Card className="border border-slate-800 shadow-2xl bg-slate-900/90 backdrop-blur-xl">
            <CardHeader className="text-center pb-2 pt-6">
              <div className="mx-auto inline-flex p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mb-3 shadow-inner">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                Candidate Authentication
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm text-slate-400">
                Autonomous Career Platform Secure Vault
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 pt-3">
              {loading ? (
                <div className="flex items-center justify-center p-8 text-slate-400 text-sm">
                  <RefreshCw className="w-5 h-5 animate-spin mr-2 text-indigo-400" />
                  Verifying candidate session...
                </div>
              ) : (
                <>
                  {/* Verified Candidate Profile Badge */}
                  <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-emerald-500 flex items-center justify-center text-white font-bold text-sm shadow-md flex-shrink-0">
                      {candidate?.profile?.full_name?.charAt(0) || '👤'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-xs font-semibold text-white truncate">
                          {candidate?.profile?.full_name || 'Candidate Sign In'}
                        </h4>
                        <Badge variant="success" size="xs" dot>
                          Verified Profile
                        </Badge>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">
                        {candidate?.profile?.email || 'Enter credentials to sign in'}
                      </p>
                    </div>
                  </div>

                  {/* Feedback Banners */}
                  {errorMessage && (
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center space-x-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  {successMessage && (
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      <span>{successMessage}</span>
                    </div>
                  )}

                  {oauthNotice && (
                    <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs leading-relaxed">
                      {oauthNotice}
                    </div>
                  )}

                  {/* Login Form */}
                  <form onSubmit={handleSignIn} className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Candidate Email
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                          placeholder="candidate@domain.com"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-medium text-slate-300">
                          Password / Access Key
                        </label>
                        <Link
                          href="/forgot-password"
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                          Forgot password?
                        </Link>
                      </div>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-9 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                          placeholder="••••••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-0.5">
                      <label className="flex items-center space-x-2 text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-0 w-3.5 h-3.5"
                        />
                        <span>Remember session (30 days)</span>
                      </label>
                    </div>

                    <Button
                      type="submit"
                      variant="primary"
                      size="md"
                      loading={signingIn}
                      className="w-full mt-2"
                    >
                      <Lock className="w-4 h-4 mr-2" />
                      Sign In to Career Platform
                    </Button>
                  </form>

                  {/* Social / OAuth Options */}
                  <div className="pt-2">
                    <div className="relative flex items-center justify-center mb-3">
                      <div className="border-t border-slate-800 w-full" />
                      <span className="bg-slate-900 px-2 text-[10px] text-slate-500 uppercase tracking-wider relative">
                        Or Continue With
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleOAuthSignIn('google')}
                        className="py-2 px-3 rounded-lg bg-slate-950 hover:bg-slate-800/80 text-slate-300 text-xs font-medium border border-slate-800 flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <GoogleIcon className="w-3.5 h-3.5" />
                        <span>Google</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOAuthSignIn('linkedin')}
                        className="py-2 px-3 rounded-lg bg-slate-950 hover:bg-slate-800/80 text-slate-300 text-xs font-medium border border-slate-800 flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <LinkedInIcon className="w-3.5 h-3.5 text-[#0A66C2]" />
                        <span>LinkedIn</span>
                      </button>
                    </div>
                  </div>

                  {/* Register and Quick Links */}
                  <div className="pt-2 text-center text-xs text-slate-400 space-y-3">
                    <p>
                      Don&apos;t have an account?{' '}
                      <Link href="/register" className="text-indigo-400 hover:text-indigo-300 font-medium">
                        Create new candidate account
                      </Link>
                    </p>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
                      <Link
                        href="/control-center"
                        className="py-2 px-3 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-200 text-xs font-medium border border-slate-700 text-center transition-colors"
                      >
                        Control Center →
                      </Link>
                      <Link
                        href="/profile"
                        className="py-2 px-3 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-200 text-xs font-medium border border-slate-700 text-center transition-colors"
                      >
                        Profile Settings
                      </Link>
                    </div>
                  </div>

                  {/* Privacy & Encryption Note */}
                  <div className="pt-2 border-t border-slate-800/80 text-center">
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      Secured with HTTP-only cookies, scrypt salt hashing & human-in-the-loop security gates.
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
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
