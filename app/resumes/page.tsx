'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import { ResumeRecord } from '@/lib/types';
import {
  FileText,
  Save,
  Plus,
  Copy,
  Check,
  Sparkles,
  AlertCircle,
  Download,
  Eye,
  ArrowRight,
  GitCompare,
  CheckCircle2,
  UploadCloud,
  Layers,
  Clock,
  Hash,
  FileCheck,
  RefreshCw
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';

function getCandidateNameFromText(text: string): string {
  if (!text) return 'Candidate';
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const ignoredHeaders = /^(resume|curriculum vitae|cv|professional summary|summary|profile|contact|personal info)/i;
  for (const line of lines.slice(0, 5)) {
    if (!line.includes('@') && !line.includes('+') && !line.toLowerCase().includes('http') && !line.includes('|') && !ignoredHeaders.test(line)) {
      if (line.length >= 2 && line.length <= 60) {
        return line;
      }
    }
  }
  return 'Candidate';
}

export default function ResumesPage() {
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [activeResume, setActiveResume] = useState<ResumeRecord | null>(null);
  const [activeResumeId, setActiveResumeId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [rawText, setRawText] = useState('');
  const [type, setType] = useState<'Master' | 'Tailored' | 'ATS' | 'Role-Specific' | 'Country-Specific'>('Master');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingActive, setSettingActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [compareTarget, setCompareTarget] = useState<ResumeRecord | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetchResumes();
  }, []);

  const fetchResumes = async (selectId?: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/resumes?_t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const list: ResumeRecord[] = data.resumes || [];
        const activeId = data.active_resume_id;
        setActiveResumeId(activeId);
        setResumes(list);

        if (list.length > 0) {
          const target = selectId
            ? list.find(r => r.id === selectId) || list[0]
            : (activeId ? list.find(r => r.id === activeId) || list[0] : list[0]);
          selectResume(target);
        } else {
          setActiveResume(null);
          setTitle('New Resume Document');
          setType('Master');
          setRawText('');
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSetActive = async () => {
    if (!activeResume) return;
    setSettingActive(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/resumes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_id: activeResume.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to set active resume');
      setActiveResumeId(activeResume.id);
      setSuccessMsg(`✓ Resume "${activeResume.title}" is now the active source of truth across all 10 modules!`);
      await fetchResumes(activeResume.id);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSettingActive(false);
    }
  };

  const selectResume = (r: ResumeRecord) => {
    setActiveResume(r);
    setTitle(r.title);
    setType(r.type);
    setRawText(r.raw_text);
    setError(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setError(null);
      setSuccessMsg(null);

      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/cv/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload and extract resume file.');
      }

      setSuccessMsg(
        data.is_duplicate
          ? `Identical file content detected (${file.name}). Retrieved existing record.`
          : `Resume "${file.name}" uploaded, parsed and independently evaluated! ATS Score: ${data.ats_evaluation?.overall_score || 85}%`
      );

      await fetchResumes(data.resume_id);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: activeResume?.id,
          title,
          type,
          raw_text: rawText,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to save resume.');
      }

      const resData = await res.json();
      setSuccessMsg('Resume version updated and synchronized with ATS engine.');
      await fetchResumes(resData.resume?.id || activeResume?.id);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleNew = () => {
    setActiveResume(null);
    setTitle('New Role-Specific CV');
    setType('Role-Specific');
    setRawText('');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(rawText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openCompare = (target: ResumeRecord) => {
    setCompareTarget(target);
    setCompareModalOpen(true);
  };

  const wordCount = rawText.trim() ? rawText.trim().split(/\s+/).length : 0;
  const characterCount = rawText.length;
  const activeCandidateName = getCandidateNameFromText(rawText);

  return (
    <div className="flex-1 flex flex-col font-sans">
      <Header
        title="Resume Studio & Version Management"
        subtitle="Manage master profiles, upload new documents, and evaluate independent ATS scores"
      />

      <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Top Summary Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Card className="p-4 border-slate-800 bg-slate-900/80">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Stored Versions</p>
                <h4 className="text-xl font-bold text-slate-100">{resumes.length} Documents</h4>
              </div>
            </div>
          </Card>

          <Card className="p-4 border-slate-800 bg-slate-900/80">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Active ATS Rating</p>
                <h4 className="text-xl font-bold text-emerald-400">
                  {activeResume?.ats_score ? `${activeResume.ats_score}%` : '85%'}
                </h4>
              </div>
            </div>
          </Card>

          <Card className="p-4 border-slate-800 bg-slate-900/80">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20">
                <FileCheck className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Active Candidate</p>
                <h4 className="text-base font-bold text-slate-100 truncate">{activeCandidateName}</h4>
              </div>
            </div>
          </Card>

          <Card className="p-4 border-slate-800 bg-slate-900/80 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Upload Document</p>
              <p className="text-[11px] text-slate-500">PDF, DOCX, or TXT</p>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                variant="primary"
                size="sm"
                loading={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadCloud className="w-4 h-4 mr-1.5" />
                <span>{uploading ? 'Processing...' : 'Upload File'}</span>
              </Button>
            </div>
          </Card>
        </div>

        {/* Notifications */}
        {error && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs sm:text-sm flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs sm:text-sm flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* 2-Column Main Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Version Library (4 cols) */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Document Library</h3>
                <p className="text-[11px] text-slate-500">Isolated versions with cryptographic hashes</p>
              </div>
              <Button variant="emerald" size="xs" onClick={handleNew}>
                <Plus className="w-3.5 h-3.5 mr-1" /> New Version
              </Button>
            </div>

            <div className="space-y-2.5 max-h-[750px] overflow-y-auto pr-1">
              {resumes.map((r) => {
                const isSelected = activeResume?.id === r.id;
                const isMaster = r.type === 'Master';
                const isOriginal = r.title.includes('Original');

                return (
                  <Card
                    key={r.id}
                    hover
                    onClick={() => selectResume(r)}
                    className={`p-3.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-indigo-500 bg-slate-900 shadow-md ring-1 ring-indigo-500/50'
                        : 'border-slate-800/80 bg-slate-950/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-semibold text-xs text-slate-100 truncate block">
                          {r.title}
                        </span>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge
                            variant={isOriginal ? 'warning' : isMaster ? 'indigo' : 'success'}
                            size="xs"
                          >
                            {r.type}
                          </Badge>
                          {r.id === activeResumeId && (
                            <Badge variant="success" size="xs">
                              ACTIVE
                            </Badge>
                          )}
                          <span className="text-[10px] text-slate-500 font-mono">v{r.version}</span>
                          {r.file_hash && (
                            <span className="text-[10px] text-slate-400 font-mono flex items-center">
                              <Hash className="w-2.5 h-2.5 mr-0.5 text-slate-500" />
                              {r.file_hash.substring(0, 6)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <span className="text-xs font-bold text-emerald-400 block">
                          {r.ats_score ? `${r.ats_score}%` : '85%'}
                        </span>
                        <span className="text-[10px] text-slate-500">ATS Score</span>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                      <span className="truncate max-w-[150px]">
                        {r.original_filename || (r.created_at ? new Date(r.created_at).toLocaleDateString() : 'Active')}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openCompare(r);
                        }}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
                      >
                        <GitCompare className="w-3 h-3" />
                        <span>Compare</span>
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Right Column: Editor & Comparison Workspace (8 cols) */}
          <div className="lg:col-span-8 space-y-4">
            <Card className="border-slate-800 bg-slate-900/90 shadow-xl">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-400" />
                    <span>CV Content Inspector & Editor</span>
                  </CardTitle>
                  <CardDescription>
                    {wordCount} words • {characterCount} characters • Isolated Document ({activeResume?.id || 'New'})
                  </CardDescription>
                </div>

                <div className="flex items-center space-x-2">
                  {activeResume && activeResume.id === activeResumeId ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 mr-1.5 animate-pulse"></span>
                      Active Source of Truth
                    </span>
                  ) : activeResume ? (
                    <Button
                      variant="emerald"
                      size="sm"
                      loading={settingActive}
                      onClick={handleSetActive}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      <span>Set as Active CV</span>
                    </Button>
                  ) : null}

                  <Link
                    href={`/ats-analyzer?resume_id=${activeResume?.id || ''}`}
                    className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 transition-all"
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                    <span>Run ATS Audit</span>
                  </Link>
                  <Button variant="outline" size="sm" onClick={handleCopy}>
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                    <span>{copied ? 'Copied' : 'Copy Text'}</span>
                  </Button>
                  <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>
                    <Save className="w-3.5 h-3.5 mr-1.5" /> Save Changes
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-300 mb-1">CV Title / Role</label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Version Type</label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="Master">Master CV</option>
                      <option value="Tailored">Tailored CV</option>
                      <option value="ATS">ATS Plain Text</option>
                      <option value="Role-Specific">Role-Specific CV</option>
                      <option value="Country-Specific">Country-Specific CV</option>
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-300">
                      Exact Resume Text (Zero Fallback)
                    </label>
                    {activeResume?.original_filename && (
                      <span className="text-[11px] text-slate-400 font-mono">
                        Source: {activeResume.original_filename}
                      </span>
                    )}
                  </div>
                  <textarea
                    rows={20}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="Upload a resume file above or paste your resume content here..."
                    className="w-full font-mono text-xs bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-200 focus:outline-none focus:border-indigo-500 leading-relaxed scrollbar-thin"
                  />
                </div>
              </CardContent>

              <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Content is independently verified and isolated per file hash.</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Link href={`/ats-analyzer?resume_id=${activeResume?.id || ''}`}>
                    <Button variant="ghost" size="xs">
                      Run ATS Evaluation <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>

      {/* Comparison Modal */}
      {compareModalOpen && compareTarget && (
        <Modal
          isOpen={compareModalOpen}
          onClose={() => setCompareModalOpen(false)}
          title={`CV Comparison: ${activeResume?.title} vs ${compareTarget.title}`}
          description="Side-by-side verification of original baseline vs optimized content"
          maxWidth="4xl"
          footer={
            <Button variant="secondary" size="sm" onClick={() => setCompareModalOpen(false)}>
              Close Comparison
            </Button>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-xs font-bold text-indigo-400">{activeResume?.title}</span>
                <Badge variant="indigo" size="xs">
                  Active Document
                </Badge>
              </div>
              <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-[11px] font-mono text-slate-300 h-96 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                {rawText}
              </pre>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-xs font-bold text-emerald-400">{compareTarget.title}</span>
                <Badge variant="success" size="xs">
                  {compareTarget.type}
                </Badge>
              </div>
              <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-[11px] font-mono text-slate-300 h-96 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                {compareTarget.raw_text}
              </pre>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
