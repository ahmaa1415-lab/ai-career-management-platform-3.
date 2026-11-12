'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { UserProfile, ProfileLocation, ProfilePermissions } from '@/lib/types';
import { UserCheck, Save, CheckCircle2, AlertCircle, Building2, Globe2, Shield } from 'lucide-react';
import CountryMultiSelect from '@/components/CountryMultiSelect';

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState<Partial<UserProfile>>({
    headline: '',
    summary: '',
    current_status: 'Employed',
    experience_years: 5,
    skills: [],
    languages: [],
    target_roles: [],
    target_industries: [],
    target_seniority: 'Senior',
    min_salary: 60000,
    preferred_currency: 'USD',
    preferred_companies: [],
    excluded_companies: [],
    availability: '1 Month'
  });

  const [location, setLocation] = useState<Partial<ProfileLocation>>({
    target_countries: [],
    target_cities: [],
    relocation_willing: 1,
    relocation_timeline: 'Relocation immediately',
    visa_sponsorship_required: 1,
    work_mode_preference: 'Remote',
    remote_eligibility: 'Global / EMEA'
  });

  const [skillsInput, setSkillsInput] = useState('');
  const [rolesInput, setRolesInput] = useState('');
  const [currentPhysicalLocation, setCurrentPhysicalLocation] = useState<string>('');
  const [resumeDerivedLocations, setResumeDerivedLocations] = useState<string[]>([]);
  const [targetCountries, setTargetCountries] = useState<string[]>([]);
  const [citiesInput, setCitiesInput] = useState('');
  const [preferredCompInput, setPreferredCompInput] = useState('');
  const [excludedCompInput, setExcludedCompInput] = useState('');
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [locFeedback, setLocFeedback] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/profile');
      if (res.ok) {
        const data = await res.json();
        if (data.profile) {
          setProfile(data.profile);
          setSkillsInput(data.profile.skills?.join(', ') || '');
          setRolesInput(data.profile.target_roles?.join(', ') || '');
          setPreferredCompInput(data.profile.preferred_companies?.join(', ') || '');
          setExcludedCompInput(data.profile.excluded_companies?.join(', ') || '');
        }
        if (data.location) {
          setLocation({
            ...data.location,
            relocation_timeline: data.location.relocation_timeline || 'Relocation immediately'
          });
          setCurrentPhysicalLocation(data.location.current_physical_location || '');
          setResumeDerivedLocations(data.location.resume_derived_locations || []);
          setTargetCountries(data.location.target_countries || []);
          setCitiesInput(data.location.target_cities?.join(', ') || '');
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    setError(null);

    try {
      const updatedProfile = {
        ...profile,
        skills: skillsInput.split(',').map(s => s.trim()).filter(Boolean),
        target_roles: rolesInput.split(',').map(s => s.trim()).filter(Boolean),
        preferred_companies: preferredCompInput.split(',').map(s => s.trim()).filter(Boolean),
        excluded_companies: excludedCompInput.split(',').map(s => s.trim()).filter(Boolean),
      };

      const updatedLocation = {
        ...location,
        current_physical_location: currentPhysicalLocation.trim() || null,
        resume_derived_locations: resumeDerivedLocations,
        target_countries: targetCountries,
        target_cities: citiesInput.split(',').map(s => s.trim()).filter(Boolean),
        relocation_timeline: location.relocation_willing ? (location.relocation_timeline || 'Relocation immediately') : 'No relocation',
      };

      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: updatedProfile,
          location: updatedLocation,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to update profile.');
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDetectLocation = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setLocFeedback('Geolocation is not supported by your browser.');
      return;
    }
    setDetectingLocation(true);
    setLocFeedback(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
          if (res.ok) {
            const data = await res.json();
            const city = data.address?.city || data.address?.town || data.address?.state || '';
            const country = data.address?.country || '';
            const formatted = [city, country].filter(Boolean).join(', ');
            setCurrentPhysicalLocation(formatted || `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`);
            setLocFeedback(`✓ Current physical location detected with user consent: ${formatted || `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`}`);
          } else {
            setCurrentPhysicalLocation(`${latitude.toFixed(3)}, ${longitude.toFixed(3)}`);
            setLocFeedback(`✓ Device coordinates recorded with explicit user permission.`);
          }
        } catch {
          setLocFeedback('Could not reverse geocode coordinates.');
        } finally {
          setDetectingLocation(false);
        }
      },
      (err) => {
        setDetectingLocation(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLocFeedback('Location permission denied by user. Physical location remains unchanged.');
        } else {
          setLocFeedback(`Location error: ${err.message}`);
        }
      },
      { timeout: 8000 }
    );
  };

  const handleClearCurrentLocation = () => {
    setCurrentPhysicalLocation('');
    setLocFeedback('Current physical location cleared (set to empty).');
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col">
        <Header title="Career Profile" subtitle="Managing your candidate profile" />
        <div className="p-8 text-center text-slate-400">Loading profile data...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="Candidate Career Profile"
        subtitle="Maintain your verified career profile, target parameters, and compensation expectations"
        onboardingStatus={Boolean(profile.onboarding_completed)}
      />

      <div className="p-4 sm:p-6 md:p-8 max-w-5xl space-y-6 sm:space-y-8 w-full overflow-hidden">
        {saveSuccess && (
          <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center space-x-3 text-emerald-400 text-sm">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>Profile and career preferences saved and persisted successfully!</span>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center space-x-3 text-rose-400 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-8">
          {/* Section 1: Professional Identity */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
              <UserCheck className="w-5 h-5 text-emerald-400" />
              <h3 className="text-base font-bold text-white">Professional Identity & Roles</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Professional Headline</label>
                <input
                  type="text"
                  value={profile.headline || ''}
                  onChange={(e) => setProfile({ ...profile, headline: e.target.value })}
                  placeholder="e.g. Lead Full Stack & AI Systems Engineer"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Target Seniority Tier</label>
                <select
                  value={profile.target_seniority || 'Senior'}
                  onChange={(e) => setProfile({ ...profile, target_seniority: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="Junior">Junior</option>
                  <option value="Mid">Mid-Level</option>
                  <option value="Senior">Senior</option>
                  <option value="Lead">Lead / Staff</option>
                  <option value="Principal">Principal Architect</option>
                  <option value="Director">Engineering Director / VP</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1">Executive Summary</label>
                <textarea
                  rows={3}
                  value={profile.summary || ''}
                  onChange={(e) => setProfile({ ...profile, summary: e.target.value })}
                  placeholder="Summary of experience, technical architecture strengths, and leadership."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Years of Experience</label>
                <input
                  type="number"
                  step="0.5"
                  value={profile.experience_years ?? 5}
                  onChange={(e) => setProfile({ ...profile, experience_years: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Current Status</label>
                <select
                  value={profile.current_status || 'Employed'}
                  onChange={(e) => setProfile({ ...profile, current_status: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="Employed">Employed (Discreet search)</option>
                  <option value="Serving Notice">Serving Notice Period</option>
                  <option value="Immediately Available">Immediately Available</option>
                  <option value="Freelancer">Independent Contractor</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1">Core Technical Skills (comma separated)</label>
                <input
                  type="text"
                  value={skillsInput}
                  onChange={(e) => setSkillsInput(e.target.value)}
                  placeholder="TypeScript, React, Next.js, Node.js, Python, PostgreSQL, Docker, AWS"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1">Target Positions (comma separated)</label>
                <input
                  type="text"
                  value={rolesInput}
                  onChange={(e) => setRolesInput(e.target.value)}
                  placeholder="Staff Software Engineer, Lead Full Stack Engineer, AI Solutions Architect"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>
            </div>
          </div>

          {/* Section 2: Five Independent Location Concepts */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Globe2 className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Location & Mobility Architecture</h3>
              </div>
              <span className="text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-mono">
                5 Independent Concepts
              </span>
            </div>

            {/* Concept A: Current Physical Location */}
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <span>Concept A: Current Physical Location</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Optional. Empty by default. Never inferred from your CV, employer address, or IP.
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleDetectLocation}
                    disabled={detectingLocation}
                    className="px-2.5 py-1 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 rounded-md transition-colors disabled:opacity-50"
                  >
                    {detectingLocation ? 'Requesting Permission...' : 'Detect Device Location'}
                  </button>
                  {currentPhysicalLocation && (
                    <button
                      type="button"
                      onClick={handleClearCurrentLocation}
                      className="px-2 py-1 text-[11px] font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-md transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <input
                type="text"
                value={currentPhysicalLocation}
                onChange={(e) => setCurrentPhysicalLocation(e.target.value)}
                placeholder="Optional — enter your current city/country (e.g. Cairo, Egypt or leave blank)"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />

              {locFeedback && (
                <p className="text-[11px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 rounded px-2.5 py-1">
                  {locFeedback}
                </p>
              )}
            </div>

            {/* Concept B: Preferred Job Search Locations */}
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-4 space-y-3">
              <h4 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                <span>Concept B: Preferred Job Search Locations</span>
              </h4>
              <p className="text-[11px] text-slate-400">
                Selected explicitly by you. Independent from physical location. If blank, job discovery searches globally.
              </p>

              <div className="space-y-3">
                <CountryMultiSelect
                  label="Target Countries & Jurisdictions (Multi-Selection)"
                  selected={targetCountries}
                  onChange={setTargetCountries}
                  required={false}
                  placeholder="Select target countries (e.g. United Arab Emirates, Saudi Arabia, Germany)..."
                />

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Target Cities (Comma Separated)</label>
                  <input
                    type="text"
                    value={citiesInput}
                    onChange={(e) => setCitiesInput(e.target.value)}
                    placeholder="Dubai, Riyadh, Berlin, London (Optional)"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Concept C: Resume-Derived Locations */}
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  <span>Concept C: Resume-Derived Historical Facts (Read-Only)</span>
                </h4>
                <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  Historical Records Only
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Locations extracted from past employment or education in your uploaded CV. These are strictly historical facts and are NEVER used as your current location or job search criteria without your explicit confirmation.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {resumeDerivedLocations.length > 0 ? (
                  resumeDerivedLocations.map((loc, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 text-xs bg-slate-800 border border-slate-700 text-amber-300 rounded-md flex items-center space-x-1"
                    >
                      <span>📍</span>
                      <span>{loc}</span>
                      <span className="text-[10px] text-slate-400">(Extracted Fact)</span>
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-500 italic">
                    No historical locations extracted from active resume yet.
                  </span>
                )}
              </div>
            </div>

            {/* Concepts D & E: Relocation & Remote Preferences */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Concept D: Relocation Preferences */}
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-4 space-y-3">
                <h4 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                  <span>Concept D: Relocation Preferences</span>
                </h4>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Relocation Willingness</label>
                  <select
                    value={location.relocation_willing ? '1' : '0'}
                    onChange={(e) => setLocation({ ...location, relocation_willing: e.target.value === '1' ? 1 : 0 })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="1">Yes, willing to relocate</option>
                    <option value="0">No, remote or local only</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Relocation Timeline</label>
                  <select
                    value={location.relocation_timeline || 'Relocation immediately'}
                    onChange={(e) => setLocation({ ...location, relocation_timeline: e.target.value })}
                    disabled={!location.relocation_willing}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                  >
                    <option value="Relocation immediately">Relocation immediately</option>
                    <option value="Less than 1 month">Less than 1 month</option>
                    <option value="1: 3 months">1: 3 months</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Visa Sponsorship Requirement</label>
                  <select
                    value={location.visa_sponsorship_required ? '1' : '0'}
                    onChange={(e) => setLocation({ ...location, visa_sponsorship_required: e.target.value === '1' ? 1 : 0 })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="1">Yes, sponsorship required for relocation</option>
                    <option value="0">No sponsorship required</option>
                  </select>
                </div>
              </div>

              {/* Concept E: Remote Work Preferences */}
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-4 space-y-3">
                <h4 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-teal-400"></span>
                  <span>Concept E: Remote Work Preference</span>
                </h4>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Work Mode Arrangement</label>
                  <select
                    value={location.work_mode_preference || 'Remote'}
                    onChange={(e) => setLocation({ ...location, work_mode_preference: e.target.value as any })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Remote">Remote Only</option>
                    <option value="Hybrid">Hybrid</option>
                    <option value="Onsite">On-Site</option>
                    <option value="Any">Any Mode</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Remote Geographic Scope</label>
                  <input
                    type="text"
                    value={location.remote_eligibility || ''}
                    onChange={(e) => setLocation({ ...location, remote_eligibility: e.target.value })}
                    placeholder="e.g. Worldwide, EMEA, Americas, or specific timezones"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Defines time-zone and regional bounds for remote job matching.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Compensation & Companies */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
              <Building2 className="w-5 h-5 text-emerald-400" />
              <h3 className="text-base font-bold text-white">Compensation & Company Preferences</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Minimum Annual Salary Expectation</label>
                <input
                  type="number"
                  step="5000"
                  value={profile.min_salary || 50000}
                  onChange={(e) => setProfile({ ...profile, min_salary: parseInt(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Currency</label>
                <select
                  value={profile.preferred_currency || 'USD'}
                  onChange={(e) => setProfile({ ...profile, preferred_currency: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="AED">AED (د.إ)</option>
                  <option value="SAR">SAR (ر.س)</option>
                  <option value="EGP">EGP (E£)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Preferred Companies (boosts score +5%)</label>
                <input
                  type="text"
                  value={preferredCompInput}
                  onChange={(e) => setPreferredCompInput(e.target.value)}
                  placeholder="Stripe, Supabase, GitLab, Automattic, Delivery Hero"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Excluded Companies (drops score to 0%)</label>
                <input
                  type="text"
                  value={excludedCompInput}
                  onChange={(e) => setExcludedCompInput(e.target.value)}
                  placeholder="Companies you refuse to apply to"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Submit Action */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-4">
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto px-6 py-3 sm:py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center space-x-2 transition-colors shadow-sm"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Persisting Changes...' : 'Save & Persist Profile'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
