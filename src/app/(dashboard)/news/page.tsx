'use client';

import React, { useState } from 'react';
import { usePortfolioStore } from '@/store/usePortfolioStore';
import { NewsFeed } from '@/components/dashboard/NewsFeed';
import { WatchlistTable } from '@/components/dashboard/WatchlistTable';
import { Newspaper, Filter, Settings2, Radio, X, Plus, Zap } from 'lucide-react';
import { cn } from '@/utils/cn';

export default function NewsPage() {
  const { accounts, selectedAccountId } = usePortfolioStore();
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [addSymbolValue, setAddSymbolValue] = useState('');
  
  if (!selectedAccountId) return null;
  const { news, watchlist, newsPrefs, profile } = accounts[selectedAccountId];

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
              <Newspaper className="h-6 w-6 text-primary" />
              Market Intelligence
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Curated signals for <span className="font-semibold text-foreground">{profile.name}</span>
            </p>
          </div>
          
          {/* Toolbar — high-contrast pill buttons */}
          <div className="flex items-center gap-3 shrink-0">
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer border-2 border-border bg-card text-foreground hover:bg-muted hover:border-primary/40 shadow-sm">
              <Filter className="h-3.5 w-3.5 text-primary" />
              Filters
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer border-2 border-border bg-card text-foreground hover:bg-muted hover:border-primary/40 shadow-sm">
              <Settings2 className="h-3.5 w-3.5 text-primary" />
              Preferences
            </button>
            <button 
              onClick={() => setTrackingOpen(!trackingOpen)}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-sm',
                trackingOpen 
                  ? 'bg-primary text-primary-foreground border-2 border-primary shadow-primary/25'
                  : 'border-2 border-border bg-card text-foreground hover:bg-muted hover:border-primary/40'
              )}
            >
              <Radio className="h-3.5 w-3.5" />
              Tracking
              {newsPrefs.trackedSymbols.length > 0 && (
                <span className={cn(
                  'text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center',
                  trackingOpen
                    ? 'bg-primary-foreground/25 text-primary-foreground'
                    : 'bg-primary/15 text-primary'
                )}>
                  {newsPrefs.trackedSymbols.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Tracking Panel — expandable */}
        {trackingOpen && (
          <div className="rounded-xl p-4 border-2 border-primary/30 bg-primary/5 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                <Radio className="h-3.5 w-3.5 text-primary" />
                Tracked Symbols
              </div>
              <button 
                onClick={() => setTrackingOpen(false)} 
                className="p-1 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {newsPrefs.trackedSymbols.map(sym => (
                <span 
                  key={sym} 
                  className="group inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/15 text-primary border-2 border-primary/25 rounded-lg font-mono text-xs font-bold hover:bg-primary/20 transition-colors"
                >
                  {sym}
                  <button className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-primary/20 transition-all cursor-pointer">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
              {newsPrefs.trackedSymbols.length === 0 && (
                <span className="text-xs text-muted-foreground italic">No symbols tracked for this account</span>
              )}
              
              {/* Add symbol input */}
              <div className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-card border-2 border-dashed border-border rounded-lg hover:border-primary/40 transition-colors">
                <Plus className="h-3 w-3 text-muted-foreground" />
                <input 
                  type="text"
                  placeholder="Add..."
                  value={addSymbolValue}
                  onChange={(e) => setAddSymbolValue(e.target.value.toUpperCase())}
                  className="bg-transparent text-xs font-mono w-14 outline-none placeholder:text-muted-foreground/50"
                />
              </div>
            </div>
          </div>
        )}

        {/* Compact status bar */}
        <div className="flex items-center gap-3 text-xs px-1">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-medium">Tracking:</span>
            <div className="flex gap-1.5">
              {newsPrefs.trackedSymbols.map(sym => (
                <span key={sym} className="px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded font-mono text-[11px] font-bold">
                  {sym}
                </span>
              ))}
              {newsPrefs.trackedSymbols.length === 0 && (
                <span className="text-muted-foreground italic">None</span>
              )}
            </div>
          </div>
          <div className="h-3.5 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <Zap className={cn('h-3 w-3', newsPrefs.sentimentEnabled ? 'text-success' : 'text-muted-foreground')} />
            <span className="text-muted-foreground">Sentiment</span>
            <span className={cn(
              'px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider',
              newsPrefs.sentimentEnabled 
                ? 'bg-success/15 text-success border border-success/25' 
                : 'bg-muted text-muted-foreground border border-border'
            )}>
              {newsPrefs.sentimentEnabled ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>
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
