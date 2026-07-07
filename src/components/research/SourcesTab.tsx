'use client';

import React from 'react';
import { ExternalLink, Database, Link2, ShieldAlert } from 'lucide-react';
import type { SourceAttribution } from '@/lib/research/research-types';
import { cn } from '@/utils/cn';

interface SourcesTabProps {
  sources: SourceAttribution[];
}

const RELIABILITY_COLORS = {
  High: 'bg-success/10 text-success border-success/20',
  Medium: 'bg-warning/10 text-warning border-warning/20',
  Low: 'bg-danger/10 text-danger border-danger/20',
};

export function SourcesTab({ sources }: SourcesTabProps) {
  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl border border-border/50 p-6 space-y-3">
        <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
          <Database className="h-5 w-5 text-primary" />
          Traceable Data Sources
        </h2>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          In alignment with our design principles for transparent and explainable AI, all metrics, scoring indices, events, and scenarios in this research report are traceable to original filings, market index providers, and certified regulatory sources. We do not use black-box models or aggregate third-party summaries without structured attribution.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sources.map((src, index) => (
          <div
            key={`${src.name}-${index}`}
            className="glass-card rounded-xl border border-border/50 p-4 flex flex-col justify-between space-y-4 hover:border-primary/30 transition-all duration-200"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-primary px-2 py-0.5 bg-primary/10 rounded-md border border-primary/25">
                  {src.sourceType}
                </span>
                
                <span
                  className={cn(
                    'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border',
                    RELIABILITY_COLORS[src.reliability] || 'bg-muted text-muted-foreground border-border'
                  )}
                >
                  Reliability: {src.reliability}
                </span>
              </div>

              <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5 pt-1">
                {src.name}
              </h3>
              
              <p className="text-xs text-muted-foreground leading-relaxed">
                {src.description}
              </p>
            </div>

            <div className="pt-3 border-t border-border/30 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
              <div className="flex gap-3">
                {src.lastUpdated && (
                  <span>
                    Updated: <strong>{src.lastUpdated}</strong>
                  </span>
                )}
                {src.accessedAt && (
                  <span>
                    Accessed: <strong>{src.accessedAt}</strong>
                  </span>
                )}
              </div>
              
              {src.url ? (
                <a
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:text-primary-foreground hover:bg-primary/20 px-2 py-1 rounded transition-colors font-medium cursor-pointer"
                >
                  <Link2 className="h-3 w-3" />
                  Source Link
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              ) : (
                <span className="text-muted-foreground italic flex items-center gap-1">
                  <ShieldAlert className="h-3 w-3" />
                  Internal/Exchange Feed
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
