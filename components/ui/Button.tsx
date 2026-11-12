import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'emerald';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  className = '',
  children,
  ...props
}) => {
  const variantStyles = {
    primary:
      'bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-sm border border-indigo-500/30 font-medium',
    emerald:
      'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white shadow-sm border border-emerald-500/30 font-medium',
    secondary:
      'bg-slate-800 hover:bg-slate-700 active:bg-slate-850 text-slate-100 border border-slate-700 shadow-sm font-medium',
    outline:
      'bg-transparent hover:bg-slate-800/80 active:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 font-medium',
    ghost:
      'bg-transparent hover:bg-slate-800/60 active:bg-slate-800 text-slate-400 hover:text-slate-100 border border-transparent font-medium',
    danger:
      'bg-rose-600/90 hover:bg-rose-600 active:bg-rose-700 text-white border border-rose-500/40 shadow-sm font-medium',
  }[variant];

  const sizeStyles = {
    xs: 'text-xs px-2.5 py-1 gap-1.5 rounded-md min-h-[30px]',
    sm: 'text-xs px-3 py-1.5 gap-2 rounded-lg min-h-[36px]',
    md: 'text-sm px-4 py-2 gap-2 rounded-lg min-h-[40px]',
    lg: 'text-base px-5 py-2.5 gap-2.5 rounded-xl min-h-[46px]',
  }[size];

  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center transition-all duration-150 select-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none ${variantStyles} ${sizeStyles} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin text-current" />
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      <span>{children}</span>
    </button>
  );
};

export default Button;
