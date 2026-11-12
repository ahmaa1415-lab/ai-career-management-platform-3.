'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useNav } from './NavContext';
import {
  Bot,
  Send,
  X,
  Sparkles,
  RotateCcw,
  ExternalLink,
  ChevronRight,
  MessageSquare,
  HelpCircle,
  Minimize2,
  Maximize2
} from 'lucide-react';
export interface QuickLink {
  label: string;
  path: string;
}

export const DEFAULT_SUGGESTED_QUESTIONS = [
  '🚀 How do I get started?',
  '📄 Where do I upload my CV?',
  '🎯 How does job matching score work?',
  '🛡️ What is the Approval Center?',
  '🌍 How do target countries & relocation work?',
  '📊 How does the Application CRM work?'
];

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  quickLinks?: QuickLink[];
  suggestedQuestions?: string[];
  timestamp: string;
}

export default function AIChatGuide() {
  const pathname = usePathname();
  const router = useRouter();
  const { chatGuideOpen, setChatGuideOpen, toggleChatGuide } = useNav();

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'msg_welcome',
      role: 'assistant',
      text: `👋 **Welcome to Antigravity AI!** I am your **Autonomous Career Co-Pilot**.\n\nI can guide you step-by-step through optimizing your CV, finding verified job opportunities across Remote and EMEA boards, explaining match scores, and managing applications.\n\nWhat would you like to explore first?`,
      quickLinks: [
        { label: '🚀 Start on Dashboard (CV-First)', path: '/' },
        { label: '★ Career Control Center', path: '/control-center' },
        { label: '🎯 Top 10 Opportunities', path: '/top-opportunities' }
      ],
      suggestedQuestions: DEFAULT_SUGGESTED_QUESTIONS.slice(0, 4),
      timestamp: 'Just now'
    }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (chatGuideOpen) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [chatGuideOpen, messages]);

  const handleSend = async (queryText?: string) => {
    const textToSend = queryText || input.trim();
    if (!textToSend || loading) return;

    setInput('');

    const userMsg: Message = {
      id: `usr_${Date.now()}`,
      role: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch('/api/guide/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          currentPath: pathname,
          history: messages.slice(-6).map((m) => ({ role: m.role, content: m.text }))
        })
      });

      if (!res.ok) {
        throw new Error('Failed to get answer from AI guide.');
      }

      const data = await res.json();
      const botMsg: Message = {
        id: `bot_${Date.now()}`,
        role: 'assistant',
        text: data.response || 'I am here to guide your career path.',
        quickLinks: data.quickLinks || [],
        suggestedQuestions: data.suggestedQuestions || DEFAULT_SUGGESTED_QUESTIONS.slice(0, 3),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      const errorMsg: Message = {
        id: `bot_err_${Date.now()}`,
        role: 'assistant',
        text: `⚠️ *Notice*: ${err.message || 'Unable to connect to guide service. Please try again.'}`,
        suggestedQuestions: ['🚀 How do I get started?', '🛡️ What is the Approval Center?'],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleResetChat = () => {
    setMessages([
      {
        id: `msg_welcome_${Date.now()}`,
        role: 'assistant',
        text: `👋 **Chat reset!** How can I guide you next in your career search?\n\nFeel free to ask about CV optimization, 8-criterion match formulas, relocation options, or human approval gating!`,
        quickLinks: [
          { label: '🚀 Start on Dashboard', path: '/' },
          { label: '★ Career Control Center', path: '/control-center' }
        ],
        suggestedQuestions: DEFAULT_SUGGESTED_QUESTIONS.slice(0, 4),
        timestamp: 'Just now'
      }
    ]);
  };

  const handleLinkClick = (path: string) => {
    router.push(path);
    // On mobile, minimize chat after clicking link so user sees page
    if (window.innerWidth < 640) {
      setChatGuideOpen(false);
    }
  };

  // Format bold and basic markdown formatting safely
  const formatText = (content: string) => {
    return content.split('\n').map((paragraph, pIdx) => {
      // Split on bold syntax **text**
      const parts = paragraph.split(/(\*\*.*?\*\*|\`.*?\`)/g);

      return (
        <p key={pIdx} className="mb-1.5 last:mb-0 leading-relaxed">
          {parts.map((part, idx) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={idx} className="font-bold text-white">{part.slice(2, -2)}</strong>;
            }
            if (part.startsWith('`') && part.endsWith('`')) {
              return (
                <code key={idx} className="px-1 py-0.5 rounded bg-slate-800 text-emerald-300 font-mono text-[11px]">
                  {part.slice(1, -1)}
                </code>
              );
            }
            return part;
          })}
        </p>
      );
    });
  };

  return (
    <>
      {/* Floating Launcher Button (visible when chat is closed) */}
      {!chatGuideOpen && (
        <button
          onClick={toggleChatGuide}
          className="fixed bottom-5 right-5 z-40 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 p-3.5 sm:px-4 sm:py-3 rounded-full shadow-2xl flex items-center space-x-2 transition-all transform hover:scale-105 group border border-emerald-400/40"
          aria-label="Open AI Career Guide Chatbot"
        >
          <div className="relative">
            <Bot className="w-5 h-5 text-slate-950 flex-shrink-0 animate-bounce duration-1000" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-300 rounded-full ring-2 ring-slate-950 animate-pulse" />
          </div>
          <span className="hidden sm:inline font-bold text-xs tracking-wide">
            AI Career Guide
          </span>
          <span className="text-[10px] bg-slate-950/20 px-1.5 py-0.5 rounded-full font-semibold hidden md:inline">
            Help
          </span>
        </button>
      )}

      {/* Floating Chat Modal / Drawer */}
      {chatGuideOpen && (
        <div
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[410px] h-[580px] max-h-[85vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200"
          role="dialog"
          aria-label="AI Career Guide Chatbot"
        >
          {/* Header */}
          <div className="p-3.5 sm:p-4 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="relative w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0">
                <Bot className="w-4 h-4" />
                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full ring-2 ring-slate-900" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-1.5">
                  <h3 className="font-bold text-xs text-white truncate">Antigravity AI Guide</h3>
                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                    Online
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 truncate">
                  Autonomous career co-pilot & onboarding assistant
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-1 flex-shrink-0 text-slate-400">
              <button
                type="button"
                onClick={handleResetChat}
                title="Reset conversation"
                className="p-1.5 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
                aria-label="Reset conversation"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setChatGuideOpen(false)}
                title="Close chat"
                className="p-1.5 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
                aria-label="Close chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3.5 text-xs scrollbar-thin scrollbar-thumb-slate-800">
            {messages.map((msg) => {
              const isAssistant = msg.role === 'assistant';

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isAssistant ? 'items-start' : 'items-end'} space-y-1`}
                >
                  <div className="flex items-center space-x-1.5 text-[10px] text-slate-500 px-1">
                    <span>{isAssistant ? 'Antigravity AI' : 'You'}</span>
                    <span>•</span>
                    <span>{msg.timestamp}</span>
                  </div>

                  <div
                    className={`p-3 rounded-2xl max-w-[90%] text-xs leading-relaxed shadow-sm ${
                      isAssistant
                        ? 'bg-slate-950 border border-slate-800 text-slate-200 rounded-tl-sm'
                        : 'bg-emerald-600 text-white rounded-tr-sm'
                    }`}
                  >
                    {formatText(msg.text)}

                    {/* Quick Link Buttons (Assistant Only) */}
                    {isAssistant && msg.quickLinks && msg.quickLinks.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex flex-wrap gap-1.5">
                        {msg.quickLinks.map((link, lIdx) => (
                          <button
                            key={lIdx}
                            type="button"
                            onClick={() => handleLinkClick(link.path)}
                            className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1 transition-colors"
                          >
                            <span>{link.label}</span>
                            <ChevronRight className="w-3 h-3 text-emerald-400" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Follow-up Suggested Questions */}
                  {isAssistant && msg.suggestedQuestions && msg.suggestedQuestions.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1 max-w-[95%]">
                      {msg.suggestedQuestions.map((q, qIdx) => (
                        <button
                          key={qIdx}
                          type="button"
                          onClick={() => handleSend(q)}
                          disabled={loading}
                          className="text-[10px] bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-emerald-300 border border-slate-700/60 px-2.5 py-1 rounded-full transition-colors flex items-center space-x-1"
                        >
                          <span>{q}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Typing Indicator */}
            {loading && (
              <div className="flex items-center space-x-2 text-slate-400 p-2 text-xs">
                <Bot className="w-4 h-4 text-emerald-400 animate-pulse" />
                <span className="flex space-x-1 items-center">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" />
                </span>
                <span className="text-[11px]">Consulting knowledge base...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggestions Strip at bottom */}
          <div className="px-3 py-1.5 bg-slate-950/70 border-t border-slate-800/80 flex items-center space-x-1.5 overflow-x-auto scrollbar-none text-[10px] text-slate-400 flex-shrink-0">
            <span className="text-[10px] text-emerald-400 font-semibold flex items-center space-x-1 flex-shrink-0">
              <Sparkles className="w-3 h-3" />
              <span>Suggested:</span>
            </span>
            <button
              type="button"
              onClick={() => handleSend('🚀 How do I get started?')}
              className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 whitespace-nowrap transition-colors border border-slate-800"
            >
              Get Started
            </button>
            <button
              type="button"
              onClick={() => handleSend('📄 Where do I upload my CV?')}
              className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 whitespace-nowrap transition-colors border border-slate-800"
            >
              CV Upload
            </button>
            <button
              type="button"
              onClick={() => handleSend('🎯 How does job matching score work?')}
              className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 whitespace-nowrap transition-colors border border-slate-800"
            >
              Match Formula
            </button>
            <button
              type="button"
              onClick={() => handleSend('🛡️ What is the Approval Center?')}
              className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 whitespace-nowrap transition-colors border border-slate-800"
            >
              Approval Gate
            </button>
          </div>

          {/* Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="p-2.5 sm:p-3 bg-slate-900 border-t border-slate-800 flex items-center space-x-2 flex-shrink-0"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything (e.g. how matching works)..."
              disabled={loading}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="p-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold rounded-xl transition-colors shadow-xs flex-shrink-0"
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
