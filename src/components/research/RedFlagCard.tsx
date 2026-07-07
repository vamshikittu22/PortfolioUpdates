'use client';

import React from 'react';
import { AlertTriangle, AlertOctagon, Info, ShieldAlert } from 'lucide-react';
import type { RedFlag } from '@/lib/research/research-types';
import { cn } from '@/utils/cn';

interface RedFlagCardProps {
  flag: RedFlag;
  className?: string;
}

export function RedFlagCard({ flag, className }: RedFlagCardProps) {
  const isHigh = flag.severity === 'High';
  const isMedium = flag.severity === 'Medium';

  return (
    <div
      className={cn(
        'p-5 rounded-xl border flex flex-col md:flex-row gap-5 items-start justify-between relative overflow-hidden transition-all duration-200 hover:bg-muted/10',
        isHigh ? 'bg-danger/5 border-danger/25' :
        isMedium ? 'bg-warning/5 border-warning/25' :
        'bg-muted/20 border-border/60',
        className
      )}
    >
      <div className="space-y-3 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-black uppercase tracking-widest bg-card border border-border px-2 py-0.5 rounded text-foreground/80">
            {flag.category}
          </span>
          <span className={cn(
            'text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border',
            isHigh ? 'bg-danger/15 text-danger border-danger/30' :
            isMedium ? 'bg-warning/15 text-warning border-warning/30' :
            'bg-muted/60 text-muted-foreground border-border'
          )}>
            {flag.severity} Severity
          </span>
          <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
            {isHigh ? (
              <AlertOctagon className="h-4 w-4 text-danger shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
            )}
            {flag.title}
          </h4>
        </div>
        
        <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed font-sans">
          {flag.explanation}
        </p>
        
        <div className="p-3 bg-card border border-border rounded-xl space-y-1">
          <span className="text-[10px] text-muted-foreground uppercase font-black tracking-wider block">
            Suggested Investor Caution
          </span>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {flag.investorCaution}
          </p>
        </div>
      </div>

      {/* Audit Evidence box */}
      <div className="w-full md:w-80 shrink-0 p-4 bg-card border border-border rounded-xl space-y-2 relative overflow-hidden self-stretch flex flex-col justify-center">
        <span className="text-[9px] text-muted-foreground uppercase font-black tracking-widest block border-b border-border/40 pb-1">
          Audit Verification Trail
        </span>
        <div className="text-xs font-semibold text-foreground leading-relaxed flex items-start gap-1.5">
          <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
          <span>{flag.evidence}</span>
        </div>
      </div>
    </div>
  );
}
