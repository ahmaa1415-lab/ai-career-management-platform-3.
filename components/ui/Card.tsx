import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  glow?: boolean;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  hover = false,
  glow = false,
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`bg-slate-900/90 border border-slate-800 rounded-xl shadow-sm text-slate-100 ${
        hover ? 'transition-all duration-200 hover:border-slate-700 hover:bg-slate-900/95 hover:shadow-md' : ''
      } ${glow ? 'border-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.08)]' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div className={`p-4 sm:p-5 border-b border-slate-800/80 flex items-center justify-between gap-3 ${className}`} {...props}>
      {children}
    </div>
  );
};

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <h3 className={`font-semibold text-slate-100 tracking-tight text-base sm:text-lg ${className}`} {...props}>
      {children}
    </h3>
  );
};

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <p className={`text-xs sm:text-sm text-slate-400 mt-0.5 leading-relaxed ${className}`} {...props}>
      {children}
    </p>
  );
};

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div className={`p-4 sm:p-5 ${className}`} {...props}>
      {children}
    </div>
  );
};

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div className={`p-4 sm:p-5 border-t border-slate-800/80 bg-slate-950/30 flex items-center justify-between rounded-b-xl gap-3 ${className}`} {...props}>
      {children}
    </div>
  );
};

export default Card;
