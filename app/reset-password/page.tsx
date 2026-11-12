'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import {
  KeyRound,
  Lock,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  ShieldCheck
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import Button from '@/components/ui/Button';

export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [validatingToken, setValidatingToken] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const t = params.get('token');
      setToken(t);

      if (!t) {
        setTokenError('No password reset authorization token provided.');
        setValidatingToken(false);
        return;
      }

      fetch(`/api/auth/reset-password?token=${encodeURIComponent(t)}`)
        .then((res) => res.json())
        .then((data) => {
          if (!data.valid) {
            setTokenError(data.error || 'Invalid or expired password reset token.');
          }
        })
        .catch(() => {
          setTokenError('Failed to validate reset token. Please request a new recovery link.');
        })
        .finally(() => {
          setValidatingToken(false);
        });
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setFormError('Password must be at least 8 characters long.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset password.');
      }

      setSuccess(true);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header title="Password Recovery" subtitle="Set your new secure access credentials" />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md">
          <Card className="border border-slate-800 shadow-2xl bg-slate-900/90 backdrop-blur-xl">
            <CardHeader className="text-center pb-2 pt-6">
              <div className="mx-auto inline-flex p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mb-3 shadow-inner">
                <KeyRound className="w-8 h-8" />
              </div>
              <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                Set New Password
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm text-slate-400">
                Configure a strong, private password for your candidate vault
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 pt-3">
              {validatingToken ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Verifying reset token authorization...
                </div>
              ) : tokenError ? (
                <div className="py-6 text-center space-y-4">
                  <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-white">Invalid or Expired Link</h3>
                  <p className="text-xs text-rose-300 leading-relaxed px-4">
                    {tokenError}
                  </p>
                  <div className="pt-2">
                    <Link href="/forgot-password">
                      <Button variant="primary" size="md" className="w-full">
                        Request New Reset Link
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : success ? (
                <div className="py-6 text-center space-y-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-white">Password Reset Complete!</h3>
                  <p className="text-xs text-slate-300 leading-relaxed px-4">
                    Your password has been securely updated. All previous sessions have been invalidated.
                  </p>
                  <div className="pt-2">
                    <Link href="/login">
                      <Button variant="emerald" size="md" className="w-full">
                        Sign In with New Password <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {formError && (
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span>{formError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      New Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        placeholder="At least 8 characters (letters & numbers)"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-9 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
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

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        placeholder="Re-type new password"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-[11px] text-slate-400 space-y-1">
                    <div className="font-semibold text-slate-300">Password Requirements:</div>
                    <div className="flex items-center gap-1.5">
                      <span className={password.length >= 8 ? 'text-emerald-400' : 'text-slate-500'}>
                        {password.length >= 8 ? '✓' : '•'} At least 8 characters
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={/[a-zA-Z]/.test(password) && /[0-9]/.test(password) ? 'text-emerald-400' : 'text-slate-500'}>
                        {/[a-zA-Z]/.test(password) && /[0-9]/.test(password) ? '✓' : '•'} Contains both letters and numbers
                      </span>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    loading={submitting}
                    className="w-full"
                  >
                    Reset & Secure Account
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
