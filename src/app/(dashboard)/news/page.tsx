'use client';

import React from 'react';
import { usePortfolioStore } from '@/store/usePortfolioStore';
import { NewsFeed } from '@/components/dashboard/NewsFeed';
import { WatchlistTable } from '@/components/dashboard/WatchlistTable';
import { Newspaper, Filter, Settings2 } from 'lucide-react';

export default function NewsPage() {
  const { accounts, selectedAccountId } = usePortfolioStore();
  
  if (!selectedAccountId) return null;
  const { news, watchlist, newsPrefs, profile } = accounts[selectedAccountId];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Newspaper className="h-6 w-6 text-primary" />
            Market Intelligence
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Curated signals for <span className="font-semibold text-foreground">{profile.name}</span>
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border/60 hover:bg-muted text-xs font-semibold rounded-lg transition-colors cursor-pointer">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            Filters
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border/60 hover:bg-muted text-xs font-semibold rounded-lg transition-colors cursor-pointer">
            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
            Preferences
          </button>
        </div>
      </div>

      {/* Preferences Summary */}
      <div className="flex items-center gap-4 text-xs">
        <span className="text-muted-foreground">Tracking:</span>
        <div className="flex gap-2">
          {newsPrefs.trackedSymbols.map(sym => (
            <span key={sym} className="px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded font-mono font-bold">
              {sym}
            </span>
          ))}
          {newsPrefs.trackedSymbols.length === 0 && (
            <span className="text-muted-foreground italic">No specific symbols tracked</span>
          )}
        </div>
        <span className="text-muted-foreground ml-4 border-l border-border/50 pl-4">
          Sentiment Analysis: <strong className={newsPrefs.sentimentEnabled ? 'text-success' : 'text-muted-foreground'}>{newsPrefs.sentimentEnabled ? 'ON' : 'OFF'}</strong>
        </span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-7">
          <div className="h-[800px]">
            <NewsFeed news={news} />
          </div>
        </div>
        <div className="xl:col-span-5 space-y-6">
          <WatchlistTable items={watchlist} />
          
          <div className="glass-card rounded-2xl p-5 border border-border/50 bg-gradient-to-br from-primary/5 to-transparent">
            <h3 className="text-sm font-bold flex items-center gap-2 mb-2">
              <Newspaper className="h-4 w-4 text-primary" />
              Why this matters
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The intelligence feed filters out market noise by exclusively surfacing news that directly impacts your holdings or watchlist. The sentiment engine scores each article to help you gauge market reaction instantly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
