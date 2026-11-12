import React from 'react';
import Card from './Card';
import Badge from './Badge';

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: {
    label: string;
    positive?: boolean;
    neutral?: boolean;
  };
  onClick?: () => void;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend,
  onClick,
  className = '',
}) => {
  return (
    <Card
      hover={!!onClick}
      onClick={onClick}
      className={`p-4 sm:p-5 relative overflow-hidden ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{title}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100">{value}</span>
            {trend && (
              <Badge
                variant={trend.neutral ? 'default' : trend.positive ? 'success' : 'warning'}
                size="xs"
              >
                {trend.label}
              </Badge>
            )}
          </div>
          {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
        </div>

        <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-300 flex-shrink-0 shadow-inner">
          {icon}
        </div>
      </div>
    </Card>
  );
};

export default StatCard;
