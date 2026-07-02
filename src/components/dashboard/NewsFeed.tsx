'use client';

import React, { useState } from 'react';
import { Newspaper, Clock, ExternalLink, Briefcase, Eye, Globe } from 'lucide-react';
import type { NewsItem } from '@/lib/mock-portfolio';
import { cn } from '@/utils/cn';

interface NewsFeedProps {
  news: NewsItem[];
}

type FilterType = 'All' | 'Holdings' | 'Watchlist' | 'Macro';

const FILTERS: FilterType[] = ['All', 'Holdings', 'Watchlist', 'Macro'];

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ComponentType<any>; className: string }> = {
  Holdings: { label: 'Holding', icon: Briefcase, className: 'text-primary bg-primary/15 border-primary/30' },
  Watchlist: { label: 'Watch', icon: Eye, className: 'text-warning bg-warning/15 border-warning/30' },
  Macro: { label: 'Macro', icon: Globe, className: 'text-muted-foreground bg-muted/60 border-border' },
};

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `${days}d ago`;
  if (hrs > 0) return `${hrs}h ago`;
  return `${mins}m ago`;
}

export function NewsFeed({ news }: NewsFeedProps) {
  const [filter, setFilter] = useState<FilterType>('All');
  
  const filteredNews = filter === 'All' ? news : news.filter(n => n.category === filter);

  const filterCounts: Record<FilterType, number> = {
    All: news.length,
    Holdings: news.filter(n => n.category === 'Holdings').length,
    Watchlist: news.filter(n => n.category === 'Watchlist').length,
    Macro: news.filter(n => n.category === 'Macro').length,
  };

  return (
    <div className="glass-card rounded-2xl border border-border/50 flex flex-col h-full">
      <div className="p-5 border-b border-border/50 shrink-0 space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Newspaper className="h-5 w-5 text-primary" />
          Actionable Intelligence
        </h2>
        
        {/* Filter Chips — high-contrast segmented control */}
        <div className="flex gap-2 flex-wrap" role="tablist" aria-label="News filters">
          {FILTERS.map((f) => {
            const isActive = filter === f;
            const count = filterCounts[f];
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                role="tab"
                aria-selected={isActive}
                className={cn(
                  'inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap',
                  isActive
                    ? 'bg-primary text-primary-foreground border-2 border-primary shadow-lg shadow-primary/30'
                    : 'bg-card text-muted-foreground border-2 border-border hover:bg-muted hover:text-foreground hover:border-foreground/20'
                )}
              >
                {f}
                <span className={cn(
                  'text-[10px] font-black rounded-full min-w-[20px] h-[20px] inline-flex items-center justify-center leading-none',
                  isActive
                    ? 'bg-primary-foreground/25 text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {filteredNews.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
            <Newspaper className="h-8 w-8 mb-3 opacity-30" />
            <p className="text-sm font-semibold">No news found for this filter.</p>
          </div>
        ) : (
          filteredNews.map((item) => {
            const catCfg = CATEGORY_CONFIG[item.category];
            const CatIcon = catCfg?.icon;
            
            return (
              <a 
                key={item.id} 
                href={item.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="block p-4 rounded-xl border border-border/40 hover:border-border hover:bg-muted/30 transition-all group"
              >
                {/* Meta row: category + time + sentiment */}
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="flex items-center gap-2">
                    {catCfg && (
                      <span className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border',
                        catCfg.className
                      )}>
                        <CatIcon className="h-2.5 w-2.5" />
                        {catCfg.label}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {timeAgo(item.publishedAt)}
                    </span>
                  </div>
                  <span className={cn(
                    'shrink-0 px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border',
                    item.sentiment === 'Bullish' ? 'bg-success/15 text-success border-success/30' :
                    item.sentiment === 'Bearish' ? 'bg-danger/15 text-danger border-danger/30' :
                    item.sentiment === 'Mixed' ? 'bg-warning/15 text-warning border-warning/30' :
                    'bg-muted/50 text-muted-foreground border-border'
                  )}>
                    {item.sentiment}
                  </span>
                </div>

                {/* Title */}
                <h3 className="text-sm font-bold leading-snug group-hover:text-primary transition-colors line-clamp-2 mb-1.5">
                  {item.title}
                </h3>
                
                {/* Summary */}
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
                  {item.summary}
                </p>
                
                {/* Footer */}
                <div className="flex items-center justify-between pt-2.5 border-t border-border/30">
                  <span className="text-[10px] font-semibold text-foreground/70">{item.source}</span>
                  <div className="flex items-center gap-1.5">
                    {item.tickers.map(t => (
                      <span key={t} className="text-[9px] font-mono font-bold bg-card border border-border px-1.5 py-0.5 rounded text-foreground/80">
                        {t}
                      </span>
                    ))}
                    <ExternalLink className="h-3 w-3 text-muted-foreground ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </a>
            );
          })
        )}
      </div>
    </div>
  );
}
