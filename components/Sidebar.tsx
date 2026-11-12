'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useNav } from './NavContext';
import {
  LayoutDashboard,
  UserCheck,
  FileText,
  Target,
  Share2,
  Compass,
  Sparkles,
  Briefcase,
  ShieldAlert,
  Inbox,
  Kanban,
  BarChart3,
  ShieldCheck,
  Award,
  Bell,
  X,
  Bot,
  Layers,
  Building2,
  Bookmark,
  Users2,
  Mail,
  ChevronDown,
  ChevronRight,
  Calendar,
  FileSpreadsheet
} from 'lucide-react';

export interface NavSection {
  title: string;
  items: {
    name: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
    badgeVariant?: 'success' | 'warning' | 'indigo' | 'default';
  }[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Workspace',
    items: [
      { name: 'Overview & Control Center', href: '/', icon: LayoutDashboard },
      { name: 'Career Profile', href: '/profile', icon: UserCheck },
      { name: 'My CVs & Versions', href: '/resumes', icon: FileText },
      { name: 'ATS Analysis & Optimization', href: '/ats-analyzer', icon: Target },
    ],
  },
  {
    title: 'Job Intelligence',
    items: [
      { name: 'Discover Jobs', href: '/discovery', icon: Compass, badge: 'Live', badgeVariant: 'success' },
      { name: 'Best Matches', href: '/top-opportunities', icon: Sparkles, badge: '90%+', badgeVariant: 'indigo' },
      { name: 'LinkedIn Intelligence', href: '/job-intelligence', icon: Share2 },
      { name: 'Recruiter Activity', href: '/job-intelligence?tab=recruiters', icon: Users2 },
      { name: 'Company Insights', href: '/job-intelligence?tab=companies', icon: Building2 },
      { name: 'Saved Opportunities', href: '/job-intelligence?tab=saved', icon: Bookmark },
    ],
  },
  {
    title: 'Application Management',
    items: [
      { name: 'Applications Workspace', href: '/applications', icon: Briefcase },
      { name: 'Application CRM', href: '/crm', icon: Kanban },
      { name: 'Interview Preparation', href: '/interview-prep', icon: Award },
      { name: 'Cover Letter Studio', href: '/cover-letter', icon: FileSpreadsheet },
      { name: 'Recruitment Email Center', href: '/inbox', icon: Mail },
      { name: 'Approval Center Gate', href: '/approvals', icon: ShieldAlert, badge: 'Gate', badgeVariant: 'warning' },
    ],
  },
  {
    title: 'Reports & Analytics',
    items: [
      { name: 'Career Analytics', href: '/reports', icon: BarChart3 },
      { name: 'Daily Intelligence Brief', href: '/reports?tab=daily', icon: Calendar },
    ],
  },
  {
    title: 'System & Platform',
    items: [
      { name: 'Portal Integrations', href: '/integrations', icon: Layers },
      { name: 'Notifications Stream', href: '/notifications', icon: Bell },
      { name: 'Account & Security', href: '/settings', icon: ShieldCheck },
      { name: 'Audit Trail Log', href: '/audit-log', icon: FileText },
    ],
  },
];

export const NAV_ITEMS = NAV_SECTIONS.flatMap(section => section.items);

export default function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, setSidebarOpen, setChatGuideOpen, user, loadingUser } = useNav();
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (title: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [title]: !prev[title]
    }));
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300"
          aria-hidden="true"
        />
      )}

      {/* Sidebar Drawer */}
      <aside
        className={`w-72 bg-slate-950 border-r border-slate-800/80 flex flex-col h-screen fixed left-0 top-0 z-50 select-none shadow-2xl md:shadow-none transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/50">
          <Link
            href="/"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center space-x-3 group"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/20 via-emerald-500/20 to-indigo-500/10 text-emerald-400 flex items-center justify-center font-bold text-base border border-emerald-500/30 group-hover:border-emerald-500/50 transition-colors shadow-sm">
              AG
            </div>
            <div>
              <span className="font-bold text-sm text-slate-100 tracking-tight block">Antigravity AI</span>
              <p className="text-[11px] text-slate-400 tracking-normal font-medium">Autonomous Career Platform</p>
            </div>
          </Link>

          {/* Close Button on Mobile */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Sections */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4 scrollbar-thin">
          {NAV_SECTIONS.map((section) => {
            const isCollapsed = collapsedSections[section.title];

            return (
              <div key={section.title} className="space-y-1">
                {/* Section Header */}
                <button
                  type="button"
                  onClick={() => toggleSection(section.title)}
                  className="w-full flex items-center justify-between px-3 py-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase hover:text-slate-200 transition-colors"
                >
                  <span>{section.title}</span>
                  {isCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </button>

                {/* Section Items */}
                {!isCollapsed && (
                  <div className="space-y-0.5 pt-0.5">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const isActive =
                        pathname === item.href ||
                        (item.href !== '/' && !item.href.includes('?') && pathname.startsWith(item.href));

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setSidebarOpen(false)}
                          className={`flex items-center justify-between px-3 py-2 text-xs rounded-lg transition-all min-h-[38px] ${
                            isActive
                              ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30 font-semibold shadow-sm'
                              : 'text-slate-300 hover:bg-slate-900 hover:text-white border border-transparent'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5 truncate">
                            <Icon
                              className={`w-4 h-4 flex-shrink-0 ${
                                isActive ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-300'
                              }`}
                            />
                            <span className="truncate">{item.name}</span>
                          </div>

                          {item.badge && (
                            <span
                              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                                item.badgeVariant === 'success'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : item.badgeVariant === 'indigo'
                                  ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                                  : item.badgeVariant === 'warning'
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                  : 'bg-slate-800 text-slate-300 border-slate-700'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* AI Guide Launcher Callout */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/60">
          <button
            type="button"
            onClick={() => {
              setSidebarOpen(false);
              setChatGuideOpen(true);
            }}
            className="w-full flex items-center justify-between p-2.5 rounded-xl bg-gradient-to-r from-indigo-500/15 via-emerald-500/15 to-indigo-500/10 hover:from-indigo-500/25 hover:to-emerald-500/20 border border-indigo-500/30 text-xs font-semibold text-indigo-200 transition-all group shadow-sm"
          >
            <div className="flex items-center space-x-2.5">
              <Bot className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
              <span>AI Career Assistant</span>
            </div>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-mono border border-emerald-500/30">
              Ask AI
            </span>
          </button>
        </div>

        {/* Candidate Profile Footer */}
        <div className="p-3.5 border-t border-slate-800/80 bg-slate-900/40">
          <div className="flex items-center justify-between">
            <Link
              href="/profile"
              onClick={() => setSidebarOpen(false)}
              className="flex items-center space-x-3 group min-w-0"
            >
              <div className="relative">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-emerald-600 text-white font-bold text-xs flex items-center justify-center border border-indigo-400/30 shadow-sm">
                  {loadingUser ? '••' : (user?.initials || '—')}
                </div>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-950" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-200 group-hover:text-white truncate">
                  {loadingUser ? 'Loading Profile...' : (user?.full_name || 'Candidate')}
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  {loadingUser ? '...' : (user?.headline || 'Candidate')}
                </p>
              </div>
            </Link>

            <Link
              href="/settings"
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Settings"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
