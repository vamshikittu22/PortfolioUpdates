'use client';

import React, { useState, useTransition } from 'react';
import { Briefcase, Pencil, TrendingDown, GitBranch, Gift, Trash2 } from 'lucide-react';
import type { Holding } from '@/lib/types';
import { cn } from '@/utils/cn';
import { HoldingFormDialog } from './HoldingFormDialog';
import { deleteHolding } from '@/server-actions/portfolio';

interface HoldingsTableProps {
  holdings: Holding[];
}

const formatCurrency = (value: number, currency: Holding['currency']) => {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
};

const EXCHANGE_STYLES: Record<Holding['exchange'], string> = {
  NSE: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  BSE: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  NASDAQ: 'bg-[#a855f7]/10 text-[#a855f7] border-[#a855f7]/20',
  NYSE: 'bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/20',
  OTHER: 'bg-muted text-muted-foreground border-border/50',
};

export function HoldingsTable({ holdings }: HoldingsTableProps) {
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = (instrumentId: string, ticker: string) => {
    if (!window.confirm(`Delete ${ticker}? This removes the entire position (not a recorded sale).`)) return;
    setDeletingId(instrumentId);
    startTransition(async () => {
      try {
        const result = await deleteHolding({ instrumentId });
        if (!result.success) window.alert(result.error);
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Could not delete holding');
      } finally {
        setDeletingId(null);
      }
    });
  };

  return (
    <div className="glass-card rounded-2xl overflow-hidden border border-border/50">
      <div className="flex items-center justify-between p-5 border-b border-border/50">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-primary" />
          Holdings Performance
        </h2>
      </div>

      {holdings.length === 0 ? (
        <div className="p-8 text-center flex flex-col items-center justify-center space-y-3 text-muted-foreground">
          <Briefcase className="h-10 w-10 text-muted-foreground/30" />
          <p className="font-semibold text-sm">No holdings yet — add your first position to get started.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/20 text-muted-foreground text-xs uppercase font-semibold">
              <tr>
                <th className="px-5 py-4 tracking-wider text-left">Asset</th>
                <th className="px-5 py-4 tracking-wider text-right">Avg Price</th>
                <th className="px-5 py-4 tracking-wider text-right">Current Price</th>
                <th className="px-5 py-4 tracking-wider text-right">Total Return</th>
                <th className="px-5 py-4 tracking-wider text-left">Exchange</th>
                <th className="px-5 py-4 tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {holdings.map((h) => {
                const instrumentLabel = `${h.ticker} · ${h.exchange}`;
                return (
                  <tr key={h.instrumentId} className="hover:bg-muted/10 transition-colors group">
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-bold text-foreground tracking-tight">{h.ticker}</span>
                        <span className="text-[11px] text-muted-foreground/80 truncate max-w-[150px]">
                          {h.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="font-tabular font-medium text-foreground">
                        {formatCurrency(h.avgCost, h.currency)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {/* currentPrice is undefined pre-Phase-3 — an honest
                          pending state, never a fabricated number or NaN. */}
                      {h.currentPrice !== undefined ? (
                        <div className="font-tabular font-medium text-foreground">
                          {formatCurrency(h.currentPrice, h.currency)}
                        </div>
                      ) : (
                        <div
                          className="font-tabular font-medium text-muted-foreground"
                          title="Pricing arrives in Phase 3"
                        >
                          —
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {h.totalChangePercent !== undefined ? (
                        <div
                          className={cn(
                            'inline-flex items-center justify-end gap-1 px-2 py-1 rounded-md text-xs font-bold font-tabular',
                            h.totalChangePercent >= 0 ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                          )}
                        >
                          {h.totalChangePercent >= 0 ? '+' : '-'}
                          {Math.abs(h.totalChangePercent)}%
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs" title="Pricing arrives in Phase 3">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-left">
                      <span
                        className={cn(
                          'px-2 py-1 rounded-md text-[10px] font-semibold border',
                          EXCHANGE_STYLES[h.exchange]
                        )}
                      >
                        {h.exchange}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <HoldingFormDialog
                          mode="edit"
                          instrumentId={h.instrumentId}
                          instrumentLabel={instrumentLabel}
                          trigger={
                            <button
                              title="Edit"
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          }
                        />
                        <HoldingFormDialog
                          mode="sell"
                          instrumentId={h.instrumentId}
                          instrumentLabel={instrumentLabel}
                          trigger={
                            <button
                              title="Sell"
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-warning hover:bg-warning/10 transition-colors cursor-pointer"
                            >
                              <TrendingDown className="h-3.5 w-3.5" />
                            </button>
                          }
                        />
                        <HoldingFormDialog
                          mode="split"
                          instrumentId={h.instrumentId}
                          instrumentLabel={instrumentLabel}
                          trigger={
                            <button
                              title="Record Split"
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                            >
                              <GitBranch className="h-3.5 w-3.5" />
                            </button>
                          }
                        />
                        <HoldingFormDialog
                          mode="bonus"
                          instrumentId={h.instrumentId}
                          instrumentLabel={instrumentLabel}
                          trigger={
                            <button
                              title="Record Bonus"
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                            >
                              <Gift className="h-3.5 w-3.5" />
                            </button>
                          }
                        />
                        <button
                          title="Delete"
                          onClick={() => handleDelete(h.instrumentId, h.ticker)}
                          disabled={isPending && deletingId === h.instrumentId}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
