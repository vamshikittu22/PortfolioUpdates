'use client';

import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '@/utils/cn';

interface KPICardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  trend?: {
    value: string;
    isPositive: boolean;
    label?: string;
  };
  subtitle?: string | React.ReactNode;
  className?: string;
  trendIsNeutral?: boolean;
}

export function KPICard({ title, value, icon, trend, subtitle, className, trendIsNeutral }: KPICardProps) {
  return (
    <div className={cn('glass-card rounded-2xl p-5 space-y-4 relative overflow-hidden', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          {icon}
        </div>
      </div>
      
      <div>
        <div className="text-2xl font-bold font-tabular tracking-tight text-foreground flex items-baseline gap-2">
          {value}
          
          {trend && (
            <span 
              className={cn(
                'inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-semibold transition-colors',
                trendIsNeutral 
                  ? 'bg-muted/50 text-muted-foreground'
                  : trend.isPositive 
                    ? 'bg-success/15 text-success' 
                    : 'bg-danger/15 text-danger'
              )}
            >
              {!trendIsNeutral && (
                trend.isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />
              )}
              {trend.value}
            </span>
          )}
        </div>
        
        {(subtitle || (trend && trend.label)) && (
          <p className="text-xs text-muted-foreground mt-1.5">
            {subtitle || trend?.label}
          </p>
        )}
      </div>
    </div>
  );
}
