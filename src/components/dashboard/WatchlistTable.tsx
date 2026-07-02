'use client';

import React from 'react';
import { Eye, ArrowUpRight, ArrowDownRight, MessageSquare, Plus } from 'lucide-react';
import type { WatchlistItem } from '@/lib/mock-portfolio';
import { cn } from '@/utils/cn';

interface WatchlistTableProps {
  items: WatchlistItem[];
}

export function WatchlistTable({ items }: WatchlistTableProps) {
  return (
    <div className="glass-card rounded-2xl overflow-hidden border border-border/50">
      <div className="flex items-center justify-between p-5 border-b border-border/50">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Eye className="h-5 w-5 text-primary" />
          Watchlist Intelligence
        </h2>
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-primary bg-primary/15 border-2 border-primary/25 rounded-lg hover:bg-primary/20 transition-colors cursor-pointer shadow-sm">
          <Plus className="h-3 w-3" />
          Manage
        </button>
      </div>

      {items.length === 0 ? (
        <div className="p-8 text-center flex flex-col items-center justify-center space-y-3 text-muted-foreground">
          <Eye className="h-10 w-10 text-muted-foreground/30" />
          <p className="font-semibold text-sm">Create a watchlist to unlock news-driven suggestions.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground text-[10px] uppercase font-bold tracking-widest border-b border-border/30">
              <tr>
                <th className="px-5 py-3.5 text-left">Symbol</th>
                <th className="px-5 py-3.5 text-right">Price</th>
                <th className="px-5 py-3.5 text-center">Signal</th>
                <th className="px-5 py-3.5 text-left">Why This Matters</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-muted/10 transition-colors group">
                  {/* Symbol + name — left-aligned */}
                  <td className="px-5 py-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-bold text-foreground text-sm">{item.ticker}</span>
                      <span className="text-[10px] text-muted-foreground truncate max-w-[120px] leading-tight">
                        {item.name}
                      </span>
                    </div>
                  </td>

                  {/* Price + change — right-aligned, tabular nums */}
                  <td className="px-5 py-4 text-right">
                    <div className="font-tabular font-semibold text-foreground text-sm tabular-nums">
                      {item.currentPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </div>
                    <div className={cn(
                      'text-[10px] font-bold font-tabular inline-flex items-center justify-end w-full gap-0.5 mt-0.5 tabular-nums',
                      item.dayChange >= 0 ? 'text-success' : 'text-danger'
                    )}>
                      {item.dayChange >= 0 ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
                      {item.dayChange >= 0 ? '+' : ''}{item.dayChange.toFixed(1)}%
                    </div>
                  </td>

                  {/* Sentiment badge + news count as muted metadata */}
                  <td className="px-5 py-4 text-center">
                    <span className={cn(
                      'inline-flex items-center justify-center px-2.5 py-1 rounded-full text-[10px] font-black border tracking-wider',
                      item.sentiment === 'Bullish' ? 'bg-success/15 text-success border-success/30' :
                      item.sentiment === 'Bearish' ? 'bg-danger/15 text-danger border-danger/30' :
                      item.sentiment === 'Mixed' ? 'bg-warning/15 text-warning border-warning/30' :
                      'bg-muted/50 text-muted-foreground border-border'
                    )}>
                      {item.sentiment}
                    </span>
                    <div className="flex items-center justify-center gap-1 mt-2">
                      <MessageSquare className="h-2.5 w-2.5 text-muted-foreground/50" />
                      <span className="text-[9px] text-muted-foreground/60 font-medium">
                        {item.newsCount} articles
                      </span>
                    </div>
                  </td>

                  {/* Insight — left-aligned */}
                  <td className="px-5 py-4 text-left">
                    <p className="text-xs text-muted-foreground leading-relaxed max-w-sm line-clamp-3">
                      {item.insight}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
