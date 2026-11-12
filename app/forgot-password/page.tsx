'use client';

import React, { useState } from 'react';
import Header from '@/components/Header';
import {
  KeyRound,
  Mail,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ExternalLink
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import Button from '@/components/ui/Button';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to dispatch recovery instructions.');
      }

      setSubmitted(true);
      if (data.reset_url) setResetUrl(data.reset_url);
      if (data.email_delivery_status) setEmailStatus(data.email_delivery_status);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header title="Password Recovery" subtitle="Reset your access credentials securely" />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md">
          <Card className="border border-slate-800 shadow-2xl bg-slate-900/90 backdrop-blur-xl">
            <CardHeader className="text-center pb-2 pt-6">
              <div className="mx-auto inline-flex p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mb-3 shadow-inner">
                <KeyRound className="w-8 h-8" />
              </div>
              <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                Account Recovery
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm text-slate-400">
                Enter your registered candidate email address
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 pt-3">
              {submitted ? (
                <div className="text-center py-6 space-y-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Recovery Instructions Dispatched</h3>
                  <p className="text-xs text-slate-300 max-w-xs mx-auto leading-relaxed">
                    If an account is registered with <strong className="text-white">{email}</strong>, a secure password reset token has been issued.
                  </p>

                  {emailStatus && (
                    <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-400">
                      Delivery Channel: <span className="text-indigo-400">{emailStatus}</span>
                    </div>
                  )}

                  {resetUrl && (
                    <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-xs space-y-2 text-left">
                      <span className="font-semibold text-indigo-300 block">
                        Development / Testing Recovery Link:
                      </span>
                      <p className="text-[11px] text-slate-300">
                        Since external cloud SMTP is operating in local sandbox mode, you can access your reset authorization link directly:
                      </p>
                      <Link
                        href={resetUrl}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 underline"
                      >
                        Open Password Reset Form <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  )}

                  <div className="pt-2">
                    <Link href="/login">
                      <Button variant="secondary" size="md" className="w-full">
                        <ArrowLeft className="w-4 h-4 mr-2" /> Return to Sign In
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {errorMessage && (
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center space-x-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Registered Email Address
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

                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    loading={loading}
                    className="w-full"
                  >
                    Send Recovery Token
                  </Button>

                  <div className="pt-2 text-center text-xs text-slate-400">
                    <Link href="/login" className="inline-flex items-center text-slate-400 hover:text-slate-200">
                      <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back to Login
                    </Link>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
