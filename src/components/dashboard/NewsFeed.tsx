'use client';

import React, { useState } from 'react';
import { Newspaper, Clock, ExternalLink } from 'lucide-react';
import type { NewsItem } from '@/lib/mock-portfolio';
import { cn } from '@/utils/cn';

interface NewsFeedProps {
  news: NewsItem[];
}

type FilterType = 'All' | 'Holdings' | 'Watchlist' | 'Macro';

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

  return (
    <div className="glass-card rounded-2xl border border-border/50 flex flex-col h-[600px]">
      <div className="p-5 border-b border-border/50 shrink-0 space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Newspaper className="h-5 w-5 text-primary" />
          Actionable Intelligence
        </h2>
        
        <div className="flex overflow-x-auto pb-2 scroll-smooth" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {['All', 'Holdings', 'Watchlist', 'Macro'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as FilterType)}
              className={cn(
                'px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border shrink-0 mr-2 last:mr-0 cursor-pointer',
                filter === f 
                  ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20' 
                  : 'bg-muted/30 text-muted-foreground border-border/50 hover:bg-muted/80 hover:text-foreground hover:border-border'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {filteredNews.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
            <Newspaper className="h-8 w-8 mb-3 opacity-30" />
            <p className="text-sm font-semibold">No news found for this filter.</p>
          </div>
        ) : (
          filteredNews.map((item) => (
            <a 
              key={item.id} 
              href={item.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="block p-4 rounded-xl border border-border/40 hover:border-border hover:bg-muted/30 transition-all group"
            >
              <div className="flex justify-between items-start mb-2 gap-3">
                <h3 className="text-sm font-bold leading-snug group-hover:text-primary transition-colors line-clamp-2">
                  {item.title}
                </h3>
                <span className={cn(
                  'shrink-0 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider',
                  item.sentiment === 'Bullish' ? 'bg-success/10 text-success' :
                  item.sentiment === 'Bearish' ? 'bg-danger/10 text-danger' :
                  item.sentiment === 'Mixed' ? 'bg-warning/10 text-warning' :
                  'bg-muted text-muted-foreground'
                )}>
                  {item.sentiment}
                </span>
              </div>
              
              <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                {item.summary}
              </p>
              
              <div className="flex items-center justify-between mt-auto pt-3 border-t border-border/30">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-semibold text-foreground/80">{item.source}</span>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {timeAgo(item.publishedAt)}
                  </span>
                </div>
                
                <div className="flex items-center gap-1">
                  {item.tickers.map(t => (
                    <span key={t} className="text-[9px] font-mono font-semibold bg-background border border-border/60 px-1.5 py-0.5 rounded">
                      {t}
                    </span>
                  ))}
                  <ExternalLink className="h-3 w-3 text-muted-foreground ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </a>
          ))
        )}
      </div>
    </div>
  );
}
