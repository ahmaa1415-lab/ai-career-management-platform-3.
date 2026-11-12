'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import Card from './Card';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  maxWidth = 'lg',
  children,
  footer,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
  }[maxWidth];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog Card */}
      <div className={`relative w-full ${maxWidthStyles} my-8 z-10 transition-all transform`}>
        <Card className="border border-slate-700/80 shadow-2xl bg-slate-900 overflow-hidden">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-800 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight">{title}</h3>
              {description && <p className="text-xs sm:text-sm text-slate-400 mt-0.5">{description}</p>}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 sm:p-6 max-h-[calc(80vh-140px)] overflow-y-auto">{children}</div>

          {/* Optional Footer */}
          {footer && (
            <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/40 flex items-center justify-end gap-3">
              {footer}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Modal;
