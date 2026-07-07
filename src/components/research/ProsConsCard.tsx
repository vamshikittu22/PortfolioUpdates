'use client';

import React from 'react';
import { TrendingUp, TrendingDown, Info } from 'lucide-react';
import type { ProConItem } from '@/lib/research/research-types';
import { cn } from '@/utils/cn';

interface ProsConsCardProps {
  items: ProConItem[];
  type: 'pro' | 'con';
  title?: string;
  className?: string;
}

export function ProsConsCard({ items, type, title, className }: ProsConsCardProps) {
  const isPro = type === 'pro';
  
  const defaultTitle = isPro 
    ? 'Reasons this stock may be attractive (Pros)' 
    : 'Reasons to be cautious / avoid (Cons)';

  return (
    <div className={cn('glass-card rounded-2xl border border-border/50 p-6 space-y-4', className)}>
      <h3 className={cn(
        'text-sm font-black uppercase tracking-wider flex items-center gap-2',
        isPro ? 'text-success' : 'text-danger'
      )}>
        {isPro ? (
          <TrendingUp className="h-4.5 w-4.5" />
        ) : (
          <TrendingDown className="h-4.5 w-4.5" />
        )}
        {title || defaultTitle}
      </h3>
      
      <div className="divide-y divide-border/30">
        {items.map((item, index) => (
          <div key={index} className="py-3 first:pt-0 last:pb-0 space-y-1">
            <div className="text-xs sm:text-sm font-semibold text-foreground/90 leading-relaxed">
              {item.point}
            </div>
            <div className={cn(
              'text-[10px] text-muted-foreground flex items-center gap-1.5 italic border px-2.5 py-1 rounded-md',
              isPro 
                ? 'bg-success/5 border-success/10 text-success/90' 
                : 'bg-danger/5 border-danger/10 text-danger/90'
            )}>
              <Info className="h-3 w-3 shrink-0" />
              <span>Evidence: {item.evidence}</span>
              {item.category && (
                <span className="ml-auto font-mono text-[8px] uppercase font-black opacity-60">
                  {item.category}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
