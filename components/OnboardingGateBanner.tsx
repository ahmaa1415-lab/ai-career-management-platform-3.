'use client';

import React from 'react';
import Link from 'next/link';
import { AlertOctagon, ArrowRight, ShieldCheck } from 'lucide-react';

interface GateBannerProps {
  moduleName: string;
}

export default function OnboardingGateBanner({ moduleName }: GateBannerProps) {
  return (
    <div className="bg-amber-950/30 border border-amber-600/40 rounded-xl p-6 text-amber-200 my-6 shadow-lg">
      <div className="flex items-start space-x-4">
        <div className="p-3 bg-amber-500/20 rounded-lg text-amber-400 border border-amber-500/30 flex-shrink-0">
          <AlertOctagon className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-bold text-amber-100">
            Mandatory Onboarding Gate Enforced
          </h3>
          <p className="text-xs text-amber-300/90 mt-1 leading-relaxed">
            Per Non-Negotiable Protocol Phase 2, personalized job discovery, matching calculations, CV tailoring, and application generation cannot proceed until your career preferences, target countries, and explicit permissions have been submitted and confirmed.
          </p>
          <div className="mt-4 flex items-center space-x-3">
            <Link
              href="/onboarding"
              className="inline-flex items-center space-x-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg text-xs transition-colors shadow-sm"
            >
              <span>Complete Mandatory Onboarding</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <div className="flex items-center space-x-1.5 text-xs text-amber-400/80">
              <ShieldCheck className="w-4 h-4" />
              <span>Zero-hallucination guarantee</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
