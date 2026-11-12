import React from 'react';
import Button from './Button';

export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  actionVariant?: 'primary' | 'emerald' | 'secondary' | 'outline';
  secondaryAction?: {
    text: string;
    onClick: () => void;
  };
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionText,
  onAction,
  actionVariant = 'primary',
  secondaryAction,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 ${className}`}
    >
      <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-300 mb-4 shadow-sm">
        {icon}
      </div>

      <h3 className="text-base sm:text-lg font-semibold text-slate-100 tracking-tight">{title}</h3>
      <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-md leading-relaxed">{description}</p>

      {(actionText || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
          {actionText && onAction && (
            <Button variant={actionVariant} size="sm" onClick={onAction}>
              {actionText}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="ghost" size="sm" onClick={secondaryAction.onClick}>
              {secondaryAction.text}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default EmptyState;
