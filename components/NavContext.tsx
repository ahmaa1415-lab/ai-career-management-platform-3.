'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';

export interface UserIdentity {
  id?: string;
  full_name?: string;
  email?: string;
  headline?: string;
  initials?: string;
  role?: string;
}

interface NavContextType {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  chatGuideOpen: boolean;
  setChatGuideOpen: (open: boolean) => void;
  toggleChatGuide: () => void;
  user: UserIdentity | null;
  loadingUser: boolean;
  refreshUser: () => Promise<void>;
}

const NavContext = createContext<NavContextType>({
  sidebarOpen: false,
  setSidebarOpen: () => {},
  toggleSidebar: () => {},
  chatGuideOpen: false,
  setChatGuideOpen: () => {},
  toggleChatGuide: () => {},
  user: null,
  loadingUser: true,
  refreshUser: async () => {},
});

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatGuideOpen, setChatGuideOpen] = useState(false);
  const [user, setUser] = useState<UserIdentity | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const pathname = usePathname();

  const toggleSidebar = () => setSidebarOpen(prev => !prev);
  const toggleChatGuide = () => setChatGuideOpen(prev => !prev);

  const calculateInitials = (name?: string): string => {
    if (!name || !name.trim()) return '—';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  };

  const refreshUser = useCallback(async () => {
    try {
      setLoadingUser(true);
      // 1. Fetch current session
      const sessRes = await fetch('/api/auth/session', { cache: 'no-store' });
      let sessionUser: any = null;
      if (sessRes.ok) {
        const sData = await sessRes.json();
        if (sData.authenticated && sData.user) {
          sessionUser = sData.user;
        }
      }

      // 2. Fetch active profile for headline and seniority
      let headline = '';
      try {
        const profRes = await fetch('/api/profile', { cache: 'no-store' });
        if (profRes.ok) {
          const pData = await profRes.json();
          headline = pData.profile?.headline || pData.profile?.target_roles?.[0] || '';
          if (!sessionUser && pData.profile?.full_name) {
            sessionUser = {
              id: pData.profile.user_id,
              full_name: pData.profile.full_name,
              email: pData.profile.email
            };
          }
        }
      } catch {}

      if (sessionUser) {
        setUser({
          id: sessionUser.id,
          full_name: sessionUser.full_name || 'Candidate',
          email: sessionUser.email || '',
          headline: headline || 'Professional Candidate',
          initials: calculateInitials(sessionUser.full_name),
          role: sessionUser.role || 'candidate'
        });
      } else {
        setUser(null);
      }
    } catch (e) {
      console.warn('Failed to fetch authenticated identity:', e);
      setUser(null);
    } finally {
      setLoadingUser(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();

    const handleProfileUpdate = () => {
      refreshUser();
    };

    window.addEventListener('career_profile_updated', handleProfileUpdate);
    window.addEventListener('focus', handleProfileUpdate);

    return () => {
      window.removeEventListener('career_profile_updated', handleProfileUpdate);
      window.removeEventListener('focus', handleProfileUpdate);
    };
  }, [refreshUser]);

  // Auto-close sidebar on route change on mobile
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Prevent background scrolling when mobile drawer is open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  return (
    <NavContext.Provider
      value={{
        sidebarOpen,
        setSidebarOpen,
        toggleSidebar,
        chatGuideOpen,
        setChatGuideOpen,
        toggleChatGuide,
        user,
        loadingUser,
        refreshUser
      }}
    >
      {children}
    </NavContext.Provider>
  );
}

export const useNav = () => useContext(NavContext);
