'use client';

import React from 'react';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as ChartTooltip, 
  Legend 
} from 'recharts';
import { 
  Scale, 
  TrendingUp, 
  TrendingDown, 
  HelpCircle, 
  AlertTriangle,
  Layers,
  ChevronRight,
  Info
} from 'lucide-react';
import type { ValuationAnalysis } from '@/lib/research/research-types';
import { cn } from '@/utils/cn';

interface ValuationTabProps {
  valuation: ValuationAnalysis;
  ticker: string;
}

export function ValuationTab({ valuation, ticker }: ValuationTabProps) {
  const { multiples, historicalPE, peers, overallVerdict, verdictExplanation, evidence, status } = valuation;

  // Filter out nulls in historical PE for rendering
  const validHistoricalPE = historicalPE.filter(h => h.pe !== null);

  // Verdict style mapper
  const verdictConfig = {
    Rich: 'bg-danger/10 border-danger/20 text-danger',
    Fair: 'bg-success/10 border-success/20 text-success',
    Discounted: 'bg-primary/10 border-primary/20 text-primary',
    Mixed: 'bg-warning/10 border-warning/20 text-warning',
  };

  const currentVerdictStyle = verdictConfig[overallVerdict] || verdictConfig.Mixed;

  const chartTheme = {
    grid: 'rgba(148, 163, 184, 0.1)',
    tooltipBg: 'rgba(21, 25, 35, 0.95)',
    tooltipBorder: 'rgba(255, 255, 255, 0.08)'
  };

  return (
    <div className="space-y-6">
      {/* 1. Valuation Verdict Card with Inline Evidence */}
      <div className="glass-card rounded-2xl border border-border/50 p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/30">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              Valuation Thesis & Verdict
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Explainable appraisal of current pricing vs intrinsic indicators
            </p>
          </div>
          
          <div className={cn('inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border text-sm font-bold', currentVerdictStyle)}>
            Verdict: {overallVerdict}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed">
              {verdictExplanation}
            </p>
            
            {/* Inline Evidence Bullets */}
            <div className="space-y-2">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider block">
                Supporting Evidence Trail
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {evidence.map((point, index) => (
                  <div key={index} className="text-xs text-foreground/90 bg-muted/20 border border-border/40 p-2.5 rounded-xl flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
                    <span>{point}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Summary Grid */}
          <div className="p-4 bg-muted/20 border border-border/40 rounded-xl space-y-4">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">
              Core Valuation Ratios
            </span>
            <div className="space-y-3">
              {multiples.filter(m => m.current !== null).map((m) => (
                <div key={m.name} className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">{m.name}</span>
                  <div className="text-right">
                    <span className="font-bold text-foreground font-tabular">{m.current}x</span>
                    <span className={cn(
                      'text-[9px] font-semibold uppercase ml-2 px-1.5 py-0.5 rounded border',
                      m.verdict === 'Rich' ? 'bg-danger/10 text-danger border-danger/25' :
                      m.verdict === 'Fair' ? 'bg-success/10 text-success border-success/25' :
                      'bg-primary/10 text-primary border-primary/25'
                    )}>
                      {m.verdict}
                    </span>
                  </div>
                </div>
              ))}
              {valuation.dividendYield !== null && (
                <div className="flex justify-between items-center text-xs border-t border-border/30 pt-3">
                  <span className="text-muted-foreground">Dividend Yield</span>
                  <span className="font-bold text-foreground font-tabular">{valuation.dividendYield}%</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Valuation Ratios Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {multiples.map((m) => (
          <div key={m.name} className="glass-card rounded-xl border border-border/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground">{m.name}</span>
              {m.current !== null && (
                <span className={cn(
                  'text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border',
                  m.verdict === 'Rich' ? 'bg-danger/10 text-danger border-danger/30' :
                  m.verdict === 'Fair' ? 'bg-success/10 text-success border-success/30' :
                  m.verdict === 'Discounted' ? 'bg-primary/10 text-primary border-primary/30' :
                  'bg-muted/50 text-muted-foreground border-border'
                )}>
                  {m.verdict}
                </span>
              )}
            </div>
            
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-foreground font-tabular">
                {m.current !== null ? `${m.current}x` : 'N/A'}
              </span>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              {m.explanation}
            </p>

            {m.current !== null && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/30 text-[10px] text-muted-foreground font-tabular">
                <div>
                  5Y Median: <strong className="text-foreground">{m.median5Y ? `${m.median5Y}x` : 'N/A'}</strong>
                </div>
                <div>
                  Sector Avg: <strong className="text-foreground">{m.sectorAverage ? `${m.sectorAverage}x` : 'N/A'}</strong>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 3. PE Bands Chart & Peer Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Historical PE Chart */}
        <div className="glass-card rounded-2xl border border-border/50 p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-foreground">Historical P/E Trend</h3>
            <p className="text-xs text-muted-foreground">Historical P/E multiple evolution vs earnings growth cycles</p>
          </div>
          {validHistoricalPE.length > 0 ? (
            <div className="h-64 w-full text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={validHistoricalPE} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                  <XAxis dataKey="year" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <ChartTooltip
                    contentStyle={{ backgroundColor: chartTheme.tooltipBg, borderColor: chartTheme.tooltipBorder, borderRadius: '8px' }}
                    labelStyle={{ fontWeight: 'bold', color: '#f8fafc' }}
                  />
                  <Line type="monotone" dataKey="pe" name="P/E Ratio" stroke="#00d4aa" strokeWidth={2.5} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center border border-dashed border-border rounded-xl bg-muted/10 text-muted-foreground text-xs p-6 text-center">
              Historical P/E data is not available or not meaningful due to structural earnings losses.
            </div>
          )}
        </div>

        {/* Peer Comparison Table */}
        <div className="glass-card rounded-2xl border border-border/50 p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-foreground">Competitive Peer Comparison</h3>
            <p className="text-xs text-muted-foreground">Relative valuation benchmarking vs direct industry competitors</p>
          </div>

          {status === 'partial' || peers.length === 0 ? (
            <div className="h-60 flex flex-col items-center justify-center border border-dashed border-border rounded-xl bg-muted/10 text-muted-foreground text-xs p-6 text-center">
              <AlertTriangle className="h-8 w-8 text-warning mb-2" />
              <span className="font-semibold block text-foreground">Peer Data Excluded</span>
              <span className="text-[11px] leading-relaxed block mt-1">
                Peer benchmarking is suspended for this security. Yes Bank represents a restructured turnaround profile; comparing against healthy private sector banking peers is misleading.
              </span>
            </div>
          ) : (
            <div className="overflow-x-auto border border-border/40 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-muted/30 border-b border-border/45 font-semibold text-muted-foreground">
                    <th className="p-3">Company</th>
                    <th className="p-3 text-right">P/E</th>
                    <th className="p-3 text-right">P/B</th>
                    <th className="p-3 text-right">ROE</th>
                    <th className="p-3 text-right">Market Cap</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/25">
                  <tr className="bg-primary/5 hover:bg-primary/10 transition-colors font-tabular font-bold">
                    <td className="p-3 text-primary">{ticker} *</td>
                    <td className="p-3 text-right">{multiples.find(m => m.name === 'PE Ratio')?.current || 'N/A'}x</td>
                    <td className="p-3 text-right">{multiples.find(m => m.name === 'PB Ratio')?.current || 'N/A'}x</td>
                    <td className="p-3 text-right">17.0%</td>
                    <td className="p-3 text-right">Selected</td>
                  </tr>
                  {peers.map((peer) => (
                    <tr key={peer.ticker} className="hover:bg-muted/10 transition-colors font-tabular">
                      <td className="p-3 font-semibold text-foreground">
                        <div>{peer.companyName}</div>
                        <span className="text-[9px] text-muted-foreground font-mono">{peer.ticker}</span>
                      </td>
                      <td className="p-3 text-right text-foreground">{peer.pe !== null ? `${peer.pe}x` : 'N/A'}</td>
                      <td className="p-3 text-right text-foreground">{peer.pb !== null ? `${peer.pb}x` : 'N/A'}</td>
                      <td className="p-3 text-right text-foreground">{peer.roe !== null ? `${peer.roe}%` : 'N/A'}</td>
                      <td className="p-3 text-right text-foreground">{peer.marketCap}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
