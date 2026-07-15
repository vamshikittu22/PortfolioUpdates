'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { Briefcase, Pencil, TrendingDown, GitBranch, Gift, Trash2, Search, AlertTriangle } from 'lucide-react';
import type { PricedHolding } from '@/lib/prices/get-portfolio-pnl';
import { cn } from '@/utils/cn';
import { formatCurrency } from '@/utils/format';
import { HoldingFormDialog } from './HoldingFormDialog';
import { StalenessBadge } from './StalenessBadge';
import { deleteHolding } from '@/server-actions/portfolio';

interface HoldingsTableProps {
  holdings: PricedHolding[];
}

// Moved to src/utils/format.ts so WatchlistTable renders prices identically.

const EXCHANGE_STYLES: Record<PricedHolding['exchange'], string> = {
  NSE: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  BSE: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  NASDAQ: 'bg-[#a855f7]/10 text-[#a855f7] border-[#a855f7]/20',
  NYSE: 'bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/20',
  OTHER: 'bg-muted text-muted-foreground border-border/50',
};

// Signed percent/amount pill — used for both day-change and total-return
// cells. `null` renders nothing (caller decides the pending fallback), it
// never renders 0/NaN for a value that doesn't actually exist yet.
function SignedPercent({ pct }: { pct: number }) {
  return (
    <div
      className={cn(
        'inline-flex items-center justify-end gap-1 px-2 py-1 rounded-md text-xs font-bold font-tabular',
        pct >= 0 ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
      )}
    >
      {pct >= 0 ? '+' : '-'}
      {Math.abs(pct).toFixed(2)}%
    </div>
  );
}

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
                <th className="px-5 py-4 tracking-wider text-right">Day Change</th>
                <th className="px-5 py-4 tracking-wider text-right">Total Return</th>
                <th className="px-5 py-4 tracking-wider text-left">Exchange</th>
                <th className="px-5 py-4 tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {holdings.map((h) => {
                const instrumentLabel = `${h.ticker} · ${h.exchange}`;
                // The em-dash "pending" path from Phase 2 is not deleted —
                // it's now conditional on whether calculateHoldingPnL
                // actually produced a priced result (status === 'priced'),
                // never on whether the field happens to be non-undefined.
                const isPriced = h.status === 'priced';

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
                      <div className="flex flex-col items-end gap-1">
                        {isPriced && h.currentPrice !== undefined ? (
                          <span className="font-tabular font-medium text-foreground">
                            {formatCurrency(h.currentPrice, h.currency)}
                          </span>
                        ) : (
                          <span
                            className="font-tabular font-medium text-muted-foreground"
                            title="Not yet priced"
                          >
                            —
                          </span>
                        )}
                        <StalenessBadge staleness={h.staleness} />
                        {h.corporateActionFlag && (
                          <span
                            title="Overnight move exceeds 40% — verify before trading. Price is still shown, not hidden."
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold border bg-warning/10 text-warning border-warning/25"
                          >
                            <AlertTriangle className="h-2.5 w-2.5" />
                            Possible corporate action — verify before trading
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {isPriced && h.dayChangePct !== null && h.dayChangeAmount !== null ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <SignedPercent pct={h.dayChangePct} />
                          <span className="text-[10px] text-muted-foreground font-tabular">
                            {h.dayChangeAmount >= 0 ? '+' : ''}
                            {formatCurrency(h.dayChangeAmount, h.currency)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs" title="Not yet priced">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {isPriced && h.unrealizedPnLPct !== null && h.unrealizedPnL !== null ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <SignedPercent pct={h.unrealizedPnLPct} />
                          <span className="text-[10px] text-muted-foreground font-tabular">
                            {h.unrealizedPnL >= 0 ? '+' : ''}
                            {formatCurrency(h.unrealizedPnL, h.currency)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs" title="Not yet priced">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-left">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            'px-2 py-1 rounded-md text-[10px] font-semibold border',
                            EXCHANGE_STYLES[h.exchange]
                          )}
                        >
                          {h.exchange}
                        </span>
                        <Link
                          href={`/research?ticker=${h.ticker}`}
                          title={`Research ${h.ticker}`}
                          className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        >
                          <Search className="h-3 w-3" />
                        </Link>
                      </div>
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
