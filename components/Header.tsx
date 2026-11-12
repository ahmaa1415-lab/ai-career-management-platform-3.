'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useNav } from './NavContext';
import {
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Menu,
  Bot,
  Bell,
  Search,
  Sparkles,
  LogOut,
  User,
  Settings,
  ChevronDown,
  Globe,
  Share2
} from 'lucide-react';
import Badge from './ui/Badge';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  onboardingStatus?: boolean;
}

export default function Header({
  title = 'Autonomous Career Platform',
  subtitle,
  onboardingStatus = true
}: HeaderProps) {
  const [cairoTime, setCairoTime] = useState<string>('');
  const [unreadNotifications, setUnreadNotifications] = useState<number>(3);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { toggleSidebar, toggleChatGuide, user, loadingUser } = useNav();
  const userName = user?.full_name || (loadingUser ? 'Loading Profile...' : 'Candidate');
  const userEmail = user?.email || (loadingUser ? '...' : '');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateTime = () => {
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Africa/Cairo',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
        setCairoTime(formatter.format(new Date()));
      } catch (e) {
        setCairoTime('20:30');
      }
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);

    // Close menu on click outside
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      clearInterval(interval);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout error:', e);
    }
    window.location.href = '/login';
  };

  return (
    <header className="bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 sticky top-0 z-30 px-4 sm:px-6 md:px-8 py-3 sm:py-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4 max-w-full">
      {/* Left side: Hamburger on mobile + Title & Subtitle */}
      <div className="flex items-center space-x-3 min-w-0">
        <button
          onClick={toggleSidebar}
          className="md:hidden p-2 -ml-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex-shrink-0"
          aria-label="Toggle navigation menu"
        >
          <Menu className="w-5 h-5 text-indigo-400" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-base sm:text-lg md:text-xl font-bold text-slate-100 tracking-tight truncate">
              {title}
            </h1>
            <Badge variant="indigo" size="xs">
              {userName}
            </Badge>
          </div>
          {subtitle && (
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Right side: Action Tools, Badges & Profile Dropdown */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 text-xs">
        {/* Quick Search Shortcut */}
        <Link
          href="/discovery"
          className="hidden lg:flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs text-slate-400 bg-slate-900 border border-slate-800 hover:border-slate-700 hover:text-slate-200 transition-colors"
        >
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <span>Search opportunities...</span>
          <kbd className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 border border-slate-700 font-mono">
            ⌘K
          </kbd>
        </Link>

        {/* Cairo Time Clock */}
        <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-mono text-slate-300 bg-slate-900 border border-slate-800 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
          <span>{cairoTime || 'Loading...'} Cairo</span>
        </div>

        {/* Security Shield */}
        <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-medium bg-slate-900 text-slate-300 border border-slate-800 whitespace-nowrap">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          <span className="hidden sm:inline">Human-in-Loop</span>
          <span className="sm:hidden">Safe</span>
        </div>

        {/* Notifications Icon Button */}
        <Link
          href="/notifications"
          className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 transition-colors"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadNotifications > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-indigo-500" />
          )}
        </Link>

        {/* AI Guide Chatbot Trigger */}
        <button
          onClick={toggleChatGuide}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30 transition-colors whitespace-nowrap"
          title="Open AI Career Guide"
        >
          <Bot className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden sm:inline">Ask AI</span>
        </button>

        {/* User Profile Dropdown & Logout */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center space-x-2 p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500 to-emerald-500 flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
              {userName.charAt(0)}
            </div>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl py-2 z-50 text-xs">
              <div className="px-4 py-2 border-b border-slate-800">
                <p className="font-semibold text-white truncate">{userName}</p>
                <p className="text-[11px] text-slate-400 truncate">{userEmail}</p>
                <span className="inline-block mt-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  Authenticated Session
                </span>
              </div>

              <div className="py-1">
                <Link
                  href="/profile"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center space-x-2.5 px-4 py-2 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  <User className="w-4 h-4 text-slate-400" />
                  <span>Career Profile</span>
                </Link>

                <Link
                  href="/settings"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center space-x-2.5 px-4 py-2 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  <Settings className="w-4 h-4 text-slate-400" />
                  <span>Account & Security</span>
                </Link>

                <Link
                  href="/integrations"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center space-x-2.5 px-4 py-2 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  <Globe className="w-4 h-4 text-indigo-400" />
                  <span>Connected Accounts</span>
                </Link>
              </div>

              <div className="pt-1 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center space-x-2.5 px-4 py-2 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors text-left"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out / Log Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
