import type { Metadata, Viewport } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import { NavProvider } from '@/components/NavContext';
import AIChatGuide from '@/components/AIChatGuide';

export const metadata: Metadata = {
  title: 'Antigravity AI Career Management & Job Search Application',
  description: 'Autonomous AI Career Management, Job Discovery, Recruiter CRM, and Daily Intelligence Platform',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#020617',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 flex min-h-screen antialiased overflow-x-hidden selection:bg-emerald-500 selection:text-slate-950">
        <NavProvider>
          <Sidebar />
          <main className="flex-1 md:ml-72 min-h-screen flex flex-col bg-slate-950 w-full max-w-full overflow-x-hidden transition-all duration-200">
            {children}
          </main>
          <AIChatGuide />
        </NavProvider>
      </body>
    </html>
  );
}
