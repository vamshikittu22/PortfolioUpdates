'use client';

import React from 'react';
import { Eye, ArrowUpRight, ArrowDownRight, MessageSquare } from 'lucide-react';
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
        <button className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors">
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
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/20 text-muted-foreground text-xs uppercase font-semibold">
              <tr>
                <th className="px-5 py-4 tracking-wider">Symbol</th>
                <th className="px-5 py-4 tracking-wider text-right">Price</th>
                <th className="px-5 py-4 tracking-wider text-center">Sentiment</th>
                <th className="px-5 py-4 tracking-wider">Why This Matters</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-muted/10 transition-colors group">
                  <td className="px-5 py-3">
                    <div className="flex flex-col">
                      <span className="font-bold text-foreground">{item.ticker}</span>
                      <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                        {item.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="font-tabular font-medium text-foreground">{item.currentPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
                    <div className={cn(
                      'text-[10px] font-semibold font-tabular inline-flex items-center justify-end w-full gap-0.5',
                      item.dayChange >= 0 ? 'text-success' : 'text-danger'
                    )}>
                      {item.dayChange >= 0 ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
                      {Math.abs(item.dayChange)}%
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={cn(
                      'px-2.5 py-1 rounded-full text-[10px] font-bold border',
                      item.sentiment === 'Bullish' ? 'bg-success/10 text-success border-success/20' :
                      item.sentiment === 'Bearish' ? 'bg-danger/10 text-danger border-danger/20' :
                      item.sentiment === 'Mixed' ? 'bg-warning/10 text-warning border-warning/20' :
                      'bg-muted/50 text-muted-foreground border-border/50'
                    )}>
                      {item.sentiment}
                    </span>
                    <div className="text-[9px] text-muted-foreground font-semibold mt-1.5 flex items-center justify-center gap-1">
                      <MessageSquare className="h-2.5 w-2.5" /> {item.newsCount} news
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground leading-relaxed max-w-sm">
                    {item.insight}
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
