'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import { useRouter } from 'next/navigation';
import CountryMultiSelect from '@/components/CountryMultiSelect';
import {
  ClipboardList,
  CheckCircle2,
  Globe2,
  ShieldCheck,
  FileText,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Sparkles,
  Briefcase,
  DollarSign,
  UserCheck,
  Lock,
  Layers,
  Building2,
  MapPin
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [summaryMarkdown, setSummaryMarkdown] = useState('');

  // Step 1: Professional Identity
  const [fullName, setFullName] = useState('');
  const [headline, setHeadline] = useState('');
  const [seniority, setSeniority] = useState('Mid-Senior');
  const [experienceYears, setExperienceYears] = useState(5);

  // Step 2: Career Background & Competencies
  const [skills, setSkills] = useState(
    'Category Management, Trade Marketing, FMCG, Assortment Optimization, Power BI, SAP, Salesforce Commerce Cloud, Demand Planning'
  );
  const [targetRoles, setTargetRoles] = useState(
    'Category Manager, Trade Marketing Manager, Commercial Manager, Head of Category Management'
  );
  const [targetIndustries, setTargetIndustries] = useState('FMCG, Personal Care, Pharmaceuticals, Retail, E-commerce');

  // Step 3: Geographic Preferences (User-Controlled & Optional)
  const [targetCountries, setTargetCountries] = useState<string[]>([]);
  const [targetCities, setTargetCities] = useState('');
  const [workModePreference, setWorkModePreference] = useState<'Remote' | 'Hybrid' | 'Onsite' | 'Any'>('Hybrid');
  const [remoteEligibility, setRemoteEligibility] = useState('Hybrid / Relocation');

  // Step 4: Compensation & Relocation
  const [minSalary, setMinSalary] = useState(75000);
  const [currency, setCurrency] = useState('USD');
  const [availability, setAvailability] = useState('Within 1 month');
  const [relocationWilling, setRelocationWilling] = useState(true);
  const [relocationTimeline, setRelocationTimeline] = useState('Within 1 month');
  const [visaSponsorshipRequired, setVisaSponsorshipRequired] = useState(true);
  const [workAuthorizations, setWorkAuthorizations] = useState('Egypt');

  // Step 5: Master CV & Raw Text
  const [cvText, setCvText] = useState('');

  // Step 6: Security Governance & Authorizations
  const [permJobResearch, setPermJobResearch] = useState(true);
  const [permCvAnalysis, setPermCvAnalysis] = useState(true);
  const [permGmailConnect, setPermGmailConnect] = useState(false);
  const [permReadEmails, setPermReadEmails] = useState(true);
  const [permDraftEmails, setPermDraftEmails] = useState(true);
  const [permSendEmails, setPermSendEmails] = useState(false); // human approval gate
  const [permSubmitApps, setPermSubmitApps] = useState(false); // human approval gate
  const [permDiscloseData, setPermDiscloseData] = useState(true);
  const [permAutomation, setPermAutomation] = useState(true);

  useEffect(() => {
    async function loadCandidateProfile() {
      try {
        const profRes = await fetch('/api/profile');
        if (profRes.ok) {
          const pData = await profRes.json();
          if (pData?.candidate?.profile?.full_name) setFullName(pData.candidate.profile.full_name);
          if (pData?.candidate?.profile?.headline) setHeadline(pData.candidate.profile.headline);
          if (pData?.candidate?.profile?.experience_years) setExperienceYears(pData.candidate.profile.experience_years);
          if (pData?.candidate?.profile?.skills) {
            setSkills(
              Array.isArray(pData.candidate.profile.skills)
                ? pData.candidate.profile.skills.join(', ')
                : pData.candidate.profile.skills
            );
          }
          if (pData?.candidate?.profile?.target_roles) {
            setTargetRoles(
              Array.isArray(pData.candidate.profile.target_roles)
                ? pData.candidate.profile.target_roles.join(', ')
                : pData.candidate.profile.target_roles
            );
          }
          if (pData?.candidate?.location?.target_countries) {
            setTargetCountries(
              Array.isArray(pData.candidate.location.target_countries)
                ? pData.candidate.location.target_countries
                : [pData.candidate.location.target_countries]
            );
          }
          if (pData?.candidate?.location?.target_cities) {
            setTargetCities(
              Array.isArray(pData.candidate.location.target_cities)
                ? pData.candidate.location.target_cities.join(', ')
                : pData.candidate.location.target_cities
            );
          }
        }
        const resRes = await fetch('/api/resumes');
        if (resRes.ok) {
          const rData = await resRes.json();
          const activeId = rData.active_resume_id;
          const orig = (activeId ? rData.resumes?.find((r: any) => r.id === activeId) : null) || rData.resumes?.find((r: any) => r.type === 'Master') || rData.resumes?.[0];
          if (orig && orig.raw_text) setCvText(orig.raw_text);
        }
      } catch (e) {
        console.error('Failed to prefetch profile in onboarding:', e);
      }
    }
    loadCandidateProfile();
  }, []);

  const handleNext = () => {
    setError(null);
    setStep(prev => Math.min(prev + 1, 6));
  };

  const handleBack = () => {
    setError(null);
    setStep(prev => Math.max(prev - 1, 1));
  };

  const handleFinishOnboarding = async () => {
    setSubmitting(true);
    setError(null);

    try {

      const payload = {
        profile: {
          headline,
          target_seniority: seniority,
          experience_years: experienceYears,
          skills: skills.split(',').map(s => s.trim()).filter(Boolean),
          target_roles: targetRoles.split(',').map(s => s.trim()).filter(Boolean),
          min_salary: minSalary,
          preferred_currency: currency,
          availability,
        },
        location: {
          target_countries: targetCountries,
          target_cities: targetCities.split(',').map(s => s.trim()).filter(Boolean),
          relocation_willing: relocationWilling ? 1 : 0,
          relocation_timeline: relocationWilling ? relocationTimeline : 'No relocation',
          visa_sponsorship_required: visaSponsorshipRequired ? 1 : 0,
          work_authorizations: workAuthorizations.split(',').map(s => s.trim()).filter(Boolean),
          remote_eligibility: remoteEligibility,
          work_mode_preference: workModePreference,
        },
        permissions: {
          job_research_authorized: permJobResearch ? 1 : 0,
          cv_analysis_authorized: permCvAnalysis ? 1 : 0,
          gmail_connected: permGmailConnect ? 1 : 0,
          read_emails_authorized: permReadEmails ? 1 : 0,
          draft_emails_authorized: permDraftEmails ? 1 : 0,
          send_emails_authorized: permSendEmails ? 1 : 0,
          submit_applications_authorized: permSubmitApps ? 1 : 0,
          disclose_data_authorized: permDiscloseData ? 1 : 0,
          scheduled_automation_desired: permAutomation ? 1 : 0,
        },
        cvText,
      };

      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to save onboarding.');
      }

      const summaryText = `
### Onboarding Confirmation Summary
- **Candidate Name**: ${fullName}
- **Professional Title**: ${headline} (${seniority})
- **Years of Experience**: ${experienceYears} years
- **Target Countries**: ${targetCountries.join(', ')} (Explicitly confirmed)
- **Work Mode**: ${workModePreference} (${remoteEligibility})
- **Relocation**: ${relocationWilling ? `Yes (${relocationTimeline})` : 'No'} | Visa Sponsorship: ${visaSponsorshipRequired ? 'Required' : 'Not required'}
- **Expected Compensation**: ${minSalary.toLocaleString()} ${currency}+
- **Permission Matrix**:
  - Job Research & CV Analysis: ${permJobResearch && permCvAnalysis ? 'Authorized ✓' : 'Restricted ✗'}
  - Recruitment Inbox (Read/Draft): ${permReadEmails && permDraftEmails ? 'Authorized ✓' : 'Restricted ✗'}
  - Live Sending & Submission: ${permSendEmails && permSubmitApps ? 'Autonomous' : 'Strict Human-in-the-Loop Safe Gate ✓'}
  - Scheduled Automation (11:00 PM Cairo): ${permAutomation ? 'Active ✓' : 'Inactive'}
      `.trim();

      setSummaryMarkdown(summaryText);
      setCompleted(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const stepLabels = [
    { num: 1, title: 'Identity', icon: UserCheck },
    { num: 2, title: 'Skills & Roles', icon: Briefcase },
    { num: 3, title: 'Locations', icon: Globe2 },
    { num: 4, title: 'Comp & Relocation', icon: DollarSign },
    { num: 5, title: 'Master CV', icon: FileText },
    { num: 6, title: 'Governance', icon: ShieldCheck },
  ];

  return (
    <div className="flex-1 flex flex-col font-sans">
      <Header
        title="Candidate Onboarding & Career Authorization"
        subtitle="Mandatory 6-step initialization protocol: Preferences and security gates are strictly verified"
        onboardingStatus={completed}
      />

      <div className="p-4 sm:p-6 md:p-8 max-w-4xl w-full mx-auto overflow-hidden">
        {/* 6-Step Horizontal Progress Tracker */}
        <div className="mb-8">
          <div className="grid grid-cols-6 gap-2 sm:gap-3">
            {stepLabels.map((s) => {
              const Icon = s.icon;
              const isPast = step > s.num;
              const isCurrent = step === s.num;

              return (
                <button
                  key={s.num}
                  type="button"
                  onClick={() => !completed && setStep(s.num)}
                  disabled={completed}
                  className={`flex flex-col items-center text-center p-2 rounded-xl border transition-all ${
                    isCurrent
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-sm'
                      : isPast
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-slate-900 border-slate-800 text-slate-500 opacity-60'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold mb-1 ${
                      isCurrent
                        ? 'bg-indigo-600 text-white'
                        : isPast
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {isPast ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-3.5 h-3.5" />}
                  </div>
                  <span className="text-[10px] sm:text-xs font-semibold truncate w-full">{s.title}</span>
                  <span className="text-[9px] text-slate-400 hidden sm:inline">Step {s.num}</span>
                </button>
              );
            })}
          </div>

          <div className="w-full bg-slate-900 h-1.5 rounded-full mt-4 overflow-hidden border border-slate-800">
            <div
              className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-full transition-all duration-300"
              style={{ width: `${(step / 6) * 100}%` }}
            />
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center space-x-3 text-rose-400 text-xs sm:text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Confirmation Screen */}
        {completed ? (
          <Card className="border border-emerald-500/30 bg-slate-900/90 shadow-2xl">
            <CardHeader className="text-center pb-2 pt-6">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto mb-3 shadow-sm">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <CardTitle className="text-xl sm:text-2xl font-bold text-white">
                Onboarding Verified & Activated!
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm text-slate-400">
                Candidate profile vault and job intelligence channels are fully synchronized.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                {summaryMarkdown}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <Link href="/control-center">
                  <Button variant="emerald" size="md" className="w-full">
                    Launch Career Control Center <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
                <Link href="/top-opportunities">
                  <Button variant="primary" size="md" className="w-full">
                    View Best Job Matches <Sparkles className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border border-slate-800 bg-slate-900/90 shadow-xl">
            {/* Step 1: Professional Identity */}
            {step === 1 && (
              <>
                <CardHeader>
                  <div>
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <UserCheck className="w-5 h-5 text-indigo-400" />
                      Step 1: Professional Identity & Seniority
                    </CardTitle>
                    <CardDescription>
                      Confirm candidate legal identity, primary market headline, and experience baseline.
                    </CardDescription>
                  </div>
                  <Badge variant="indigo" size="xs">
                    Step 1 of 6
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Candidate Full Name
                      </label>
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Primary Professional Title / Headline
                      </label>
                      <input
                        type="text"
                        value={headline}
                        onChange={(e) => setHeadline(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Target Seniority Level
                      </label>
                      <select
                        value={seniority}
                        onChange={(e) => setSeniority(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="Senior">Senior Specialist</option>
                        <option value="Lead">Lead / Manager</option>
                        <option value="Head">Head of Department / Director</option>
                        <option value="Executive">VP / C-Level</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Years of Professional Experience
                      </label>
                      <input
                        type="number"
                        value={experienceYears}
                        onChange={(e) => setExperienceYears(parseInt(e.target.value) || 0)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>
                  </div>
                </CardContent>
              </>
            )}

            {/* Step 2: Career Background & Competencies */}
            {step === 2 && (
              <>
                <CardHeader>
                  <div>
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <Briefcase className="w-5 h-5 text-indigo-400" />
                      Step 2: Core Competencies & Target Roles
                    </CardTitle>
                    <CardDescription>
                      Specify targeted commercial roles, technical skills, and industry domains.
                    </CardDescription>
                  </div>
                  <Badge variant="indigo" size="xs">
                    Step 2 of 6
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Target Job Roles (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={targetRoles}
                      onChange={(e) => setTargetRoles(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Core Functional & Technical Skills (comma-separated)
                    </label>
                    <textarea
                      rows={3}
                      value={skills}
                      onChange={(e) => setSkills(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 leading-relaxed"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Target Industry Verticals
                    </label>
                    <input
                      type="text"
                      value={targetIndustries}
                      onChange={(e) => setTargetIndustries(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </CardContent>
              </>
            )}

            {/* Step 3: Geographic Preferences */}
            {step === 3 && (
              <>
                <CardHeader>
                  <div>
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <Globe2 className="w-5 h-5 text-indigo-400" />
                      Step 3: Geographic Preferences & Work Mode
                    </CardTitle>
                    <CardDescription>
                      Explicitly define target countries and cities. Never assumed by AI algorithms.
                    </CardDescription>
                  </div>
                  <Badge variant="warning" size="xs">
                    Mandatory Gating
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Target Countries (Select at least one)
                    </label>
                    <CountryMultiSelect
                      selected={targetCountries}
                      onChange={setTargetCountries}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Target Cities (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={targetCities}
                        onChange={(e) => setTargetCities(e.target.value)}
                        placeholder="Dubai, Riyadh, Cairo"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Work Mode Preference
                      </label>
                      <select
                        value={workModePreference}
                        onChange={(e) => setWorkModePreference(e.target.value as any)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="Hybrid">Hybrid</option>
                        <option value="Remote">Remote</option>
                        <option value="Onsite">Onsite</option>
                        <option value="Any">Flexible / Any</option>
                      </select>
                    </div>
                  </div>
                </CardContent>
              </>
            )}

            {/* Step 4: Compensation & Relocation */}
            {step === 4 && (
              <>
                <CardHeader>
                  <div>
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <DollarSign className="w-5 h-5 text-indigo-400" />
                      Step 4: Compensation & Relocation Readiness
                    </CardTitle>
                    <CardDescription>
                      Compensation expectations and international relocation readiness.
                    </CardDescription>
                  </div>
                  <Badge variant="indigo" size="xs">
                    Step 4 of 6
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Minimum Base Annual Salary
                      </label>
                      <input
                        type="number"
                        value={minSalary}
                        onChange={(e) => setMinSalary(parseInt(e.target.value) || 0)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Preferred Currency
                      </label>
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="USD">USD ($)</option>
                        <option value="AED">AED (د.إ)</option>
                        <option value="SAR">SAR (﷼)</option>
                        <option value="EGP">EGP (ج.م)</option>
                        <option value="EUR">EUR (€)</option>
                      </select>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                    <label className="flex items-center space-x-2 text-xs text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={relocationWilling}
                        onChange={(e) => setRelocationWilling(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0 w-4 h-4"
                      />
                      <span className="font-medium">Willing to Relocate for Opportunities</span>
                    </label>

                    {relocationWilling && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Relocation Timeline</label>
                          <select
                            value={relocationTimeline}
                            onChange={(e) => setRelocationTimeline(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                          >
                            <option value="Immediately">Immediately (Within 2 weeks)</option>
                            <option value="Within 1 month">Within 1 month</option>
                            <option value="1 to 3 months">1 to 3 months</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Visa Sponsorship</label>
                          <select
                            value={visaSponsorshipRequired ? 'yes' : 'no'}
                            onChange={(e) => setVisaSponsorshipRequired(e.target.value === 'yes')}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                          >
                            <option value="yes">Visa Sponsorship Required</option>
                            <option value="no">Independent Work Authorization Held</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </>
            )}

            {/* Step 5: Master CV & Raw Text */}
            {step === 5 && (
              <>
                <CardHeader>
                  <div>
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <FileText className="w-5 h-5 text-indigo-400" />
                      Step 5: Master CV Text & Experience Review
                    </CardTitle>
                    <CardDescription>
                      Review the parsed Master CV text. This forms the baseline for ATS keyword alignment.
                    </CardDescription>
                  </div>
                  <Badge variant="indigo" size="xs">
                    Step 5 of 6
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Master CV Content (Extracted Text)
                    </label>
                    <textarea
                      rows={12}
                      value={cvText}
                      onChange={(e) => setCvText(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 font-mono leading-relaxed focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Your original CV remains securely archived. Bespoke tailored CVs are derived without overwriting this master copy.
                  </p>
                </CardContent>
              </>
            )}

            {/* Step 6: Security Governance & Authorizations */}
            {step === 6 && (
              <>
                <CardHeader>
                  <div>
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-emerald-400" />
                      Step 6: Security Governance & Autonomous Permissions
                    </CardTitle>
                    <CardDescription>
                      Review and configure permissions. Human-in-the-loop safety gates protect external actions.
                    </CardDescription>
                  </div>
                  <Badge variant="success" size="xs">
                    Final Step
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-200">Autonomous Job Discovery & Aggregation</p>
                      <p className="text-[11px] text-slate-400">Scan LinkedIn, Wuzzuf, Bayt, Naukrigulf daily</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={permJobResearch}
                      onChange={(e) => setPermJobResearch(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0 w-4 h-4"
                    />
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-200">ATS CV Tailoring & Version B Generation</p>
                      <p className="text-[11px] text-slate-400">Generate tailored PDF/DOCX for matched opportunities</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={permCvAnalysis}
                      onChange={(e) => setPermCvAnalysis(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0 w-4 h-4"
                    />
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950 border border-amber-500/20 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-amber-300">Human Approval Gate for Application Submission</p>
                      <p className="text-[11px] text-slate-400">Mandates manual review in Approval Center before sending</p>
                    </div>
                    <Badge variant="warning" size="xs">
                      Enforced Gate
                    </Badge>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-200">Daily Intelligence Briefing at 11:00 PM Cairo</p>
                      <p className="text-[11px] text-slate-400">Generate summary reports of new verified roles and outreach</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={permAutomation}
                      onChange={(e) => setPermAutomation(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0 w-4 h-4"
                    />
                  </div>
                </CardContent>
              </>
            )}

            {/* Navigation Buttons Footer */}
            <CardFooter>
              <div>
                {step > 1 && (
                  <Button variant="secondary" size="sm" onClick={handleBack}>
                    <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
                  </Button>
                )}
              </div>

              <div>
                {step < 6 ? (
                  <Button variant="primary" size="sm" onClick={handleNext}>
                    Next: {stepLabels[step]?.title} <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                ) : (
                  <Button
                    variant="emerald"
                    size="sm"
                    loading={submitting}
                    onClick={handleFinishOnboarding}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1.5" /> Complete & Activate Onboarding
                  </Button>
                )}
              </div>
            </CardFooter>
          </Card>
        )}
      </div>
    </div>
  );
}
