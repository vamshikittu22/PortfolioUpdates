'use client';

import React, { useState, useTransition } from 'react';
import { Eye, MessageSquare, Plus, X } from 'lucide-react';
import type { WatchlistItem } from '@/lib/types';
import { cn } from '@/utils/cn';
import { WatchlistFormDialog } from './WatchlistFormDialog';
import { removeFromWatchlist } from '@/server-actions/portfolio';

interface WatchlistTableProps {
  items: WatchlistItem[];
}

export function WatchlistTable({ items }: WatchlistTableProps) {
  const [isPending, startTransition] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Calls the Server Action directly rather than delegating to a parent
  // callback: this component is already a 'use client' boundary and owns no
  // other watchlist state, so a direct call keeps the remove flow
  // self-contained (documented per plan Task 2 instruction to pick whichever
  // is simplest).
  const handleRemove = (id: string) => {
    setRemovingId(id);
    startTransition(async () => {
      try {
        const result = await removeFromWatchlist({ watchlistItemId: id });
        if (!result.success) window.alert(result.error);
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Could not remove from watchlist');
      } finally {
        setRemovingId(null);
      }
    });
  };

  return (
    <div className="glass-card rounded-2xl overflow-hidden border border-border/50">
      <div className="flex items-center justify-between p-5 border-b border-border/50">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Eye className="h-5 w-5 text-primary" />
          Watchlist Intelligence
        </h2>
        <WatchlistFormDialog
          trigger={
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-primary bg-primary/15 border-2 border-primary/25 rounded-lg hover:bg-primary/20 transition-colors cursor-pointer shadow-sm">
              <Plus className="h-3 w-3" />
              Manage
            </button>
          }
        />
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
                <th className="px-5 py-3.5 text-right" aria-label="Remove" />
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

                  {/* Price — no live feed until Phase 3, an honest em-dash */}
                  <td className="px-5 py-4 text-right">
                    <div
                      className="font-tabular font-semibold text-muted-foreground text-sm tabular-nums"
                      title="Pricing arrives in Phase 3"
                    >
                      —
                    </div>
                  </td>

                  {/* Sentiment badge + news count — optional until Phase 6 */}
                  <td className="px-5 py-4 text-center">
                    {item.sentiment ? (
                      <>
                        <span
                          className={cn(
                            'inline-flex items-center justify-center px-2.5 py-1 rounded-full text-[10px] font-black border tracking-wider',
                            item.sentiment === 'Bullish' ? 'bg-success/15 text-success border-success/30' :
                            item.sentiment === 'Bearish' ? 'bg-danger/15 text-danger border-danger/30' :
                            item.sentiment === 'Mixed' ? 'bg-warning/15 text-warning border-warning/30' :
                            'bg-muted/50 text-muted-foreground border-border'
                          )}
                        >
                          {item.sentiment}
                        </span>
                        {item.newsCount !== undefined && (
                          <div className="flex items-center justify-center gap-1 mt-2">
                            <MessageSquare className="h-2.5 w-2.5 text-muted-foreground/50" />
                            <span className="text-[9px] text-muted-foreground/60 font-medium">
                              {item.newsCount} articles
                            </span>
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-[9px] text-muted-foreground/60 font-medium">
                        Sentiment available after Phase 6
                      </span>
                    )}
                  </td>

                  {/* Insight — left-aligned */}
                  <td className="px-5 py-4 text-left">
                    <p className="text-xs text-muted-foreground leading-relaxed max-w-sm line-clamp-3">
                      {item.insight ?? '—'}
                    </p>
                  </td>

                  {/* Remove affordance */}
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => handleRemove(item.id)}
                      disabled={isPending && removingId === item.id}
                      title="Remove from watchlist"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
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
