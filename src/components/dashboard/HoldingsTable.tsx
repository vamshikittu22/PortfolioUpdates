'use client';

import React from 'react';
import { ArrowUpRight, ArrowDownRight, Briefcase } from 'lucide-react';
import type { Holding } from '@/lib/mock-portfolio';
import { cn } from '@/utils/cn';

interface HoldingsTableProps {
  holdings: Holding[];
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(value);
};

export function HoldingsTable({ holdings }: HoldingsTableProps) {
  return (
    <div className="glass-card rounded-2xl overflow-hidden border border-border/50">
      <div className="flex items-center justify-between p-5 border-b border-border/50">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-primary" />
          Holdings Performance
        </h2>
        <button className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors">
          View All
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/20 text-muted-foreground text-xs uppercase font-semibold">
            <tr>
              <th className="px-5 py-4 tracking-wider">Asset</th>
              <th className="px-5 py-4 tracking-wider text-right">Avg Price</th>
              <th className="px-5 py-4 tracking-wider text-right">Current Price</th>
              <th className="px-5 py-4 tracking-wider text-right">Total Return</th>
              <th className="px-5 py-4 tracking-wider text-right">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {holdings.map((h) => (
              <tr key={h.id} className="hover:bg-muted/10 transition-colors group">
                <td className="px-5 py-3">
                  <div className="flex flex-col">
                    <span className="font-bold text-foreground">{h.ticker}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                        {h.name}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-muted text-muted-foreground border border-border/50">
                        {h.sector}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3 text-right">
                  <span className="font-tabular font-medium text-foreground">
                    {formatCurrency(h.avgPrice)}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="font-tabular font-medium text-foreground">{formatCurrency(h.currentPrice)}</div>
                  <div className={cn(
                    'text-[10px] font-semibold font-tabular flex items-center justify-end gap-0.5 mt-0.5',
                    h.dayChange >= 0 ? 'text-success' : 'text-danger'
                  )}>
                    {h.dayChange >= 0 ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
                    {Math.abs(h.dayChange)}%
                  </div>
                </td>
                <td className="px-5 py-3 text-right">
                  <div className={cn(
                    'inline-flex items-center justify-end gap-1 px-2 py-1 rounded-md text-xs font-bold font-tabular',
                    h.totalChange >= 0 ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                  )}>
                    {h.totalChange >= 0 ? '+' : '-'}{Math.abs(h.totalChange)}%
                  </div>
                </td>
                <td className="px-5 py-3 text-right">
                  <span className={cn(
                    'px-2 py-1 rounded-md text-[10px] font-semibold border',
                    h.broker === 'Groww' ? 'bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/20' :
                    h.broker === 'Binance' ? 'bg-[#f3ba2f]/10 text-[#f3ba2f] border-[#f3ba2f]/20' :
                    h.broker === 'CoinDCX' ? 'bg-[#0052ff]/10 text-[#0052ff] border-[#0052ff]/20' :
                    h.broker === 'Zerodha' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                    'bg-muted text-muted-foreground border-border/50'
                  )}>
                    {h.broker}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
