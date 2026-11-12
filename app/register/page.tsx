'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import {
  UserPlus,
  Mail,
  Lock,
  User,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  KeyRound,
  ShieldAlert
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import Button from '@/components/ui/Button';

interface FieldErrors {
  fullName?: string;
  email?: string;
  stagingCode?: string;
  password?: string;
  confirmPassword?: string;
  agreeTerms?: string;
}

export default function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [stagingCode, setStagingCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Password and code visibility states - strictly masked by default
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showStagingCode, setShowStagingCode] = useState(false);

  const [agreeTerms, setAgreeTerms] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);

  // Staging mode detection
  const [isStaging, setIsStaging] = useState(false);

  // Error states
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Detect runtime staging environment on mount without leaking secrets
  useEffect(() => {
    let isMounted = true;
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.environment === 'staging') {
          setIsStaging(true);
        }
      })
      .catch(() => {
        // Silent fallback - fail-safe ensures no blocking if offline
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const validateForm = (): boolean => {
    const errors: FieldErrors = {};

    if (!fullName || fullName.trim().length < 2) {
      errors.fullName = 'Please enter your full legal or professional name.';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email.trim())) {
      errors.email = 'Please enter a valid professional email address.';
    }

    if (isStaging && (!stagingCode || !stagingCode.trim())) {
      errors.stagingCode = 'A valid staging access code is required to register in staging mode.';
    }

    if (!password) {
      errors.password = 'Master password is required.';
    } else if (password.length < 8 || !/(?=.*[a-zA-Z])(?=.*[0-9])/.test(password)) {
      errors.password = 'Password must be at least 8 characters long and contain both letters and numbers.';
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your master password.';
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match. Please ensure both passwords match.';
    }

    if (!agreeTerms) {
      errors.agreeTerms = 'You must accept the terms of service and privacy policy to register.';
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      const firstError = Object.values(errors)[0];
      setErrorMessage(firstError || 'Please correct the highlighted fields before submitting.');
      return false;
    }

    return true;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, any> = {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        confirmPassword,
        agreeTerms
      };

      // Include staging access code whenever provided or required
      if (stagingCode.trim() || isStaging) {
        payload.stagingCode = stagingCode.trim();
      }

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        const errorText = data.error || 'Failed to create candidate account.';

        // Handle specific server-side rejection reasons
        if (res.status === 403 && errorText.toLowerCase().includes('staging')) {
          setIsStaging(true);
          setFieldErrors((prev) => ({
            ...prev,
            stagingCode: errorText
          }));
        } else if (res.status === 409 || errorText.toLowerCase().includes('email')) {
          setFieldErrors((prev) => ({
            ...prev,
            email: errorText
          }));
        } else if (errorText.toLowerCase().includes('password')) {
          setFieldErrors((prev) => ({
            ...prev,
            password: errorText
          }));
        }

        throw new Error(errorText);
      }

      setRegistered(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header title="Candidate Registration" subtitle="Create your autonomous career management account" />

      {/* Main container with mobile bottom padding (pb-32) to prevent overlap with floating AIChatGuide controls */}
      <main className="flex-1 flex items-center justify-center p-3.5 sm:p-6 lg:p-8 pb-32 sm:pb-12">
        <div className="w-full max-w-md mx-auto">
          <Card className="border border-slate-800 shadow-2xl bg-slate-900/90 backdrop-blur-xl relative z-10">
            <CardHeader className="text-center pb-2 pt-6">
              <div className="mx-auto inline-flex p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-3 shadow-inner">
                <UserPlus className="w-8 h-8" />
              </div>
              <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                Create Executive Account
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm text-slate-400">
                Join Antigravity Autonomous Career Platform
              </CardDescription>

              {/* Staging Mode Indicator Banner */}
              {isStaging && (
                <div className="mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs text-left flex items-start space-x-2">
                  <ShieldAlert className="w-4 h-4 flex-shrink-0 text-amber-400 mt-0.5" />
                  <div className="leading-snug">
                    <span className="font-semibold text-amber-200">Staging Environment Restricted:</span>{' '}
                    An authorized staging access code is required to register an account in this environment.
                  </div>
                </div>
              )}
            </CardHeader>

            <CardContent className="space-y-4 pt-3">
              {registered ? (
                <div className="text-center py-6 space-y-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Account Created Successfully!</h3>
                  <p className="text-xs text-slate-300 max-w-xs mx-auto leading-relaxed">
                    Welcome, <strong className="text-white">{fullName}</strong>. Your secure profile vault has been initialized and an authenticated session is active.
                  </p>
                  <div className="pt-2">
                    <Link href="/onboarding">
                      <Button variant="emerald" size="md" className="w-full">
                        Proceed to 6-Step Onboarding <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleRegister} className="space-y-3.5" noValidate>
                  {/* Top-level summary error alert */}
                  {errorMessage && (
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center space-x-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span className="leading-tight">{errorMessage}</span>
                    </div>
                  )}

                  {/* Full Name Field */}
                  <div>
                    <label htmlFor="reg-fullName" className="block text-xs font-medium text-slate-300 mb-1">
                      Full Legal / Professional Name
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                      <input
                        id="reg-fullName"
                        name="fullName"
                        type="text"
                        value={fullName}
                        onChange={(e) => {
                          setFullName(e.target.value);
                          if (fieldErrors.fullName) setFieldErrors((p) => ({ ...p, fullName: undefined }));
                        }}
                        required
                        autoComplete="name"
                        placeholder="e.g. Sarah Jenkins"
                        className={`w-full bg-slate-950 border ${
                          fieldErrors.fullName ? 'border-rose-500 focus:border-rose-500' : 'border-slate-800 focus:border-indigo-500'
                        } rounded-lg pl-9 pr-3 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-colors`}
                      />
                    </div>
                    {fieldErrors.fullName && (
                      <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                        {fieldErrors.fullName}
                      </p>
                    )}
                  </div>

                  {/* Email Field */}
                  <div>
                    <label htmlFor="reg-email" className="block text-xs font-medium text-slate-300 mb-1">
                      Professional Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                      <input
                        id="reg-email"
                        name="email"
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
                        }}
                        required
                        autoComplete="email"
                        placeholder="candidate@domain.com"
                        className={`w-full bg-slate-950 border ${
                          fieldErrors.email ? 'border-rose-500 focus:border-rose-500' : 'border-slate-800 focus:border-indigo-500'
                        } rounded-lg pl-9 pr-3 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-colors`}
                      />
                    </div>
                    {fieldErrors.email && (
                      <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                        {fieldErrors.email}
                      </p>
                    )}
                  </div>

                  {/* Staging Access Code Field - Rendered when staging mode is active */}
                  {isStaging && (
                    <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor="reg-stagingCode" className="block text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                          <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                          Staging Access Code
                        </label>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300">
                          Required in Staging
                        </span>
                      </div>
                      <div className="relative">
                        <KeyRound className="w-4 h-4 text-amber-400/60 absolute left-3 top-3 pointer-events-none" />
                        <input
                          id="reg-stagingCode"
                          name="stagingCode"
                          type={showStagingCode ? 'text' : 'password'}
                          value={stagingCode}
                          onChange={(e) => {
                            setStagingCode(e.target.value);
                            if (fieldErrors.stagingCode) setFieldErrors((p) => ({ ...p, stagingCode: undefined }));
                          }}
                          required={isStaging}
                          autoComplete="off"
                          spellCheck={false}
                          placeholder="Enter authorized staging access code"
                          className={`w-full bg-slate-950 border ${
                            fieldErrors.stagingCode ? 'border-rose-500 focus:border-rose-500' : 'border-amber-500/40 focus:border-amber-400'
                          } rounded-lg pl-9 pr-10 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-colors shadow-inner`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowStagingCode(!showStagingCode)}
                          className="absolute right-2.5 top-2.5 p-1 text-slate-400 hover:text-slate-200 transition-colors focus:outline-none"
                          aria-label={showStagingCode ? 'Hide staging access code' : 'Show staging access code'}
                          tabIndex={-1}
                        >
                          {showStagingCode ? <EyeOff className="w-4 h-4 text-amber-400" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {fieldErrors.stagingCode ? (
                        <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                          {fieldErrors.stagingCode}
                        </p>
                      ) : (
                        <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                          This environment is restricted to authorized testing. Enter the access code assigned to your staging testing group.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Master Password Field - Strictly masked by default */}
                  <div>
                    <label htmlFor="reg-password" className="block text-xs font-medium text-slate-300 mb-1">
                      Master Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                      <input
                        id="reg-password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
                        }}
                        required
                        autoComplete="new-password"
                        placeholder="At least 8 characters (letters & numbers)"
                        className={`w-full bg-slate-950 border ${
                          fieldErrors.password ? 'border-rose-500 focus:border-rose-500' : 'border-slate-800 focus:border-indigo-500'
                        } rounded-lg pl-9 pr-10 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-colors`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-2.5 p-1 text-slate-400 hover:text-slate-200 transition-colors focus:outline-none"
                        aria-label={showPassword ? 'Hide master password' : 'Show master password'}
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4 text-emerald-400" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {fieldErrors.password && (
                      <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                        {fieldErrors.password}
                      </p>
                    )}
                  </div>

                  {/* Confirm Master Password Field - Independent toggle and strictly masked by default */}
                  <div>
                    <label htmlFor="reg-confirmPassword" className="block text-xs font-medium text-slate-300 mb-1">
                      Confirm Master Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                      <input
                        id="reg-confirmPassword"
                        name="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          if (fieldErrors.confirmPassword) setFieldErrors((p) => ({ ...p, confirmPassword: undefined }));
                        }}
                        required
                        autoComplete="new-password"
                        placeholder="Re-enter master password"
                        className={`w-full bg-slate-950 border ${
                          fieldErrors.confirmPassword ? 'border-rose-500 focus:border-rose-500' : 'border-slate-800 focus:border-indigo-500'
                        } rounded-lg pl-9 pr-10 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-colors`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-2.5 top-2.5 p-1 text-slate-400 hover:text-slate-200 transition-colors focus:outline-none"
                        aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                        tabIndex={-1}
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4 text-emerald-400" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {fieldErrors.confirmPassword && (
                      <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                        {fieldErrors.confirmPassword}
                      </p>
                    )}
                  </div>

                  {/* Terms & Conditions Checkbox */}
                  <div className="pt-1">
                    <label className="flex items-start space-x-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={agreeTerms}
                        onChange={(e) => {
                          setAgreeTerms(e.target.checked);
                          if (fieldErrors.agreeTerms) setFieldErrors((p) => ({ ...p, agreeTerms: undefined }));
                        }}
                        className="rounded border-slate-700 bg-slate-950 text-emerald-600 focus:ring-0 w-3.5 h-3.5 mt-0.5 flex-shrink-0"
                      />
                      <span className="text-[11px] text-slate-400 leading-snug">
                        I agree to the Terms of Service and Privacy Policy. I authorize local storage of my CV data under strict human-in-the-loop control.
                      </span>
                    </label>
                    {fieldErrors.agreeTerms && (
                      <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                        {fieldErrors.agreeTerms}
                      </p>
                    )}
                  </div>

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    variant="emerald"
                    size="md"
                    loading={submitting}
                    className="w-full mt-3 py-2.5 text-xs sm:text-sm font-semibold shadow-lg"
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Create Executive Account
                  </Button>
                </form>
              )}

              <div className="pt-3 border-t border-slate-800 text-center text-xs text-slate-400">
                Already have an account?{' '}
                <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-medium">
                  Sign in here
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
