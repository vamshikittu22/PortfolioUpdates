'use client';

import React, { useState } from 'react';
import { 
  Newspaper, 
  Clock, 
  ExternalLink, 
  MessageSquareQuote, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  HelpCircle,
  Eye,
  Info
} from 'lucide-react';
import type { NewsAnalysis, NewsEvent } from '@/lib/research/research-types';
import { cn } from '@/utils/cn';

interface NewsTimelineTabProps {
  news: NewsAnalysis;
}

const CATEGORIES = ['All', 'Earnings', 'Regulation', 'Management', 'Litigation', 'Acquisition', 'Macro', 'Product', 'Governance'];

const SENTIMENT_STYLES = {
  Positive: 'bg-success/15 text-success border-success/30',
  Negative: 'bg-danger/15 text-danger border-danger/30',
  Neutral: 'bg-muted text-muted-foreground border-border',
  Mixed: 'bg-warning/15 text-warning border-warning/30',
};

const SENTIMENT_ICONS = {
  Positive: CheckCircle2,
  Negative: XCircle,
  Neutral: HelpCircle,
  Mixed: AlertTriangle,
};

export function NewsTimelineTab({ news }: NewsTimelineTabProps) {
  const { events, overallSentiment, narrativeSummary } = news;
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // Filter events by selected category
  const filteredEvents = selectedCategory === 'All' 
    ? events 
    : events.filter(e => e.category === selectedCategory);

  const overallSentimentStyle = SENTIMENT_STYLES[overallSentiment] || SENTIMENT_STYLES.Neutral;
  const SentimentIcon = SENTIMENT_ICONS[overallSentiment] || SENTIMENT_ICONS.Neutral;

  return (
    <div className="space-y-6">
      
      {/* 1. Overall Narrative Summary Card */}
      <div className="glass-card rounded-2xl border border-border/50 p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/30">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <MessageSquareQuote className="h-5 w-5 text-primary" />
              Narrative & Sentiment Summary
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Explainable synthesis of regulatory announcements, earnings news, and litigation
            </p>
          </div>
          
          <div className={cn('inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border text-sm font-bold', overallSentimentStyle)}>
            <SentimentIcon className="h-4 w-4 shrink-0" />
            Sentiment: {overallSentiment}
          </div>
        </div>

        <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed">
          {narrativeSummary}
        </p>
      </div>

      {/* 2. Category Filter Chips */}
      <div className="flex gap-2 overflow-x-auto pb-1.5 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none">
        {CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat;
          const count = cat === 'All' ? events.length : events.filter(e => e.category === cat).length;
          
          if (count === 0 && cat !== 'All') return null;

          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border shrink-0 cursor-pointer',
                isActive
                  ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/10'
                  : 'bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground hover:border-border/80'
              )}
            >
              {cat}
              <span className={cn(
                'text-[10px] font-black rounded-full px-1.5 py-0.5 inline-flex items-center justify-center leading-none',
                isActive ? 'bg-primary-foreground/25 text-primary-foreground' : 'bg-muted text-muted-foreground'
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 3. Vertical News Timeline */}
      {filteredEvents.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-2xl bg-card text-muted-foreground">
          <Newspaper className="h-10 w-10 mx-auto opacity-30 mb-2" />
          <p className="text-sm font-semibold">No news items found under category "{selectedCategory}"</p>
        </div>
      ) : (
        <div className="relative pl-6 sm:pl-8 border-l border-border/60 ml-3 sm:ml-4 space-y-6">
          {filteredEvents.map((evt) => {
            const isExpanded = expandedEventId === evt.id;
            const EventSentimentIcon = SENTIMENT_ICONS[evt.sentiment] || SENTIMENT_ICONS.Neutral;
            
            return (
              <div key={evt.id} className="relative group">
                
                {/* Timeline dot */}
                <span className={cn(
                  'absolute -left-[31px] sm:-left-[39px] top-1 h-5 w-5 rounded-full bg-card border-2 flex items-center justify-center transition-all group-hover:scale-110 z-10',
                  evt.sentiment === 'Positive' ? 'border-success text-success bg-success/5' :
                  evt.sentiment === 'Negative' ? 'border-danger text-danger bg-danger/5' :
                  evt.sentiment === 'Mixed' ? 'border-warning text-warning bg-warning/5' :
                  'border-border text-muted-foreground bg-muted'
                )}>
                  <EventSentimentIcon className="h-3 w-3 shrink-0" />
                </span>

                {/* Event Card */}
                <div className="glass-card rounded-xl border border-border/50 p-5 space-y-3 hover:border-primary/20 transition-all duration-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/30 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-primary px-2 py-0.5 bg-primary/10 rounded-md border border-primary/25">
                        {evt.category}
                      </span>
                      {evt.eventType && (
                        <span className="text-[10px] text-muted-foreground font-semibold px-2 py-0.5 bg-muted rounded border border-border/50">
                          {evt.eventType}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-tabular">
                      <span className="flex items-center gap-1 font-medium">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        {new Date(evt.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                      <span>Source: <strong>{evt.source}</strong></span>
                    </div>
                  </div>

                  <h3 className="text-sm sm:text-base font-extrabold text-foreground leading-snug group-hover:text-primary transition-colors">
                    {evt.headline}
                  </h3>

                  {/* Why it Matters Section */}
                  <div className="p-3 bg-muted/20 border border-border/40 rounded-xl space-y-1.5">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider flex items-center gap-1">
                      <Info className="h-3 w-3 text-primary shrink-0" />
                      Analytical Context: Why this matters
                    </span>
                    <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed">
                      {evt.whyItMatters}
                    </p>
                  </div>

                  {evt.url && (
                    <div className="flex justify-end pt-1">
                      <a
                        href={evt.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline cursor-pointer"
                      >
                        Read Filing / Press Release
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
