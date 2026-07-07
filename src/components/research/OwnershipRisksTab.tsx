'use client';

import React from 'react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as ChartTooltip, 
  Legend 
} from 'recharts';
import { 
  Users, 
  AlertTriangle, 
  ShieldCheck, 
  Info, 
  Activity, 
  AlertCircle,
  TrendingDown,
  TrendingUp,
  Percent
} from 'lucide-react';
import type { 
  OwnershipAnalysis, 
  BalanceSheetHealth, 
  RedFlag 
} from '@/lib/research/research-types';
import { cn } from '@/utils/cn';

interface OwnershipRisksTabProps {
  ownership: OwnershipAnalysis;
  balanceSheet: BalanceSheetHealth;
  redFlags: RedFlag[];
  ticker: string;
}

export function OwnershipRisksTab({ ownership, balanceSheet, redFlags, ticker }: OwnershipRisksTabProps) {
  const { snapshots, trendSummary, redFlags: ownershipFlags, evidence: ownershipEvidence } = ownership;
  const { debtTrend, overallVerdict: debtVerdict, verdictExplanation: debtExplanation, warnings: debtWarnings, evidence: debtEvidence } = balanceSheet;

  // Format data for stacked shareholding area chart
  const validChartData = snapshots.map(s => ({
    date: s.date.substring(0, 7), // YYYY-MM
    Promoter: s.promoterHolding,
    FII: s.fiiHolding,
    DII: s.diiHolding,
    Retail: s.retailHolding,
  }));

  // Debt verdict style mapper
  const debtVerdictColors = {
    Healthy: 'bg-success/10 border-success/20 text-success',
    Manageable: 'bg-primary/10 border-primary/20 text-primary',
    Stretched: 'bg-warning/10 border-warning/20 text-warning',
    Risky: 'bg-danger/10 border-danger/20 text-danger',
  };

  const chartTheme = {
    grid: 'rgba(148, 163, 184, 0.1)',
    tooltipBg: 'rgba(21, 25, 35, 0.95)',
    tooltipBorder: 'rgba(255, 255, 255, 0.08)'
  };

  return (
    <div className="space-y-6">
      
      {/* 1. Shareholding Pattern Stacked Chart & Promoter Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Shareholding Area Chart */}
        <div className="lg:col-span-7 glass-card rounded-2xl border border-border/50 p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-foreground">Shareholding Structure Trend</h3>
            <p className="text-xs text-muted-foreground">Historical shift in ownership distribution (%)</p>
          </div>
          {validChartData.length > 0 ? (
            <div className="h-64 w-full text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={validChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                  <XAxis dataKey="date" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" unit="%" />
                  <ChartTooltip
                    contentStyle={{ backgroundColor: chartTheme.tooltipBg, borderColor: chartTheme.tooltipBorder, borderRadius: '8px' }}
                    labelStyle={{ fontWeight: 'bold', color: '#f8fafc' }}
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Area type="monotone" dataKey="Promoter" stackId="1" stroke="#00d4aa" fill="#00d4aa" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="FII" stackId="1" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="DII" stackId="1" stroke="#a855f7" fill="#a855f7" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="Retail" stackId="1" stroke="#f97316" fill="#f97316" fillOpacity={0.6} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center border border-dashed border-border rounded-xl bg-muted/10 text-muted-foreground text-xs">
              Shareholding snapshots are not available.
            </div>
          )}
        </div>

        {/* Shareholding Verdict & Summary */}
        <div className="lg:col-span-5 glass-card rounded-2xl border border-border/50 p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Users className="h-4.5 w-4.5 text-primary" />
              Ownership Quality Verdict
            </h3>
            <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed">
              {trendSummary}
            </p>
          </div>

          <div className="space-y-3 pt-3 border-t border-border/30">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider block">
              Ownership Evidence Trail
            </span>
            <div className="space-y-1.5 text-xs text-muted-foreground">
              {ownershipEvidence.map((point, idx) => (
                <div key={idx} className="flex items-start gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
                  <span className="text-foreground/95">{point}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* 2. Debt Health & Solvency Panel */}
      <div className="glass-card rounded-2xl border border-border/50 p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/30">
          <div>
            <h3 className="text-sm font-black uppercase text-foreground tracking-wider flex items-center gap-2">
              <Activity className="h-4.5 w-4.5 text-primary" />
              Balance Sheet & Debt Health Analysis
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Appraisal of solvency risks, debt burdens, and liquidity structures
            </p>
          </div>
          
          <div className={cn('inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border text-xs font-bold', debtVerdictColors[debtVerdict] || 'bg-muted')}>
            Solvency: {debtVerdict}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed">
              {debtExplanation}
            </p>

            {debtWarnings.length > 0 && (
              <div className="p-4 rounded-xl border border-danger/20 bg-danger/5 space-y-2">
                <span className="text-[10px] text-danger font-black uppercase tracking-wider flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  Solvency Warning Flags
                </span>
                <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-1">
                  {debtWarnings.map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="p-4 bg-muted/20 border border-border/40 rounded-xl space-y-3">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">
              Balance Sheet Evidence
            </span>
            <div className="space-y-2 text-xs text-muted-foreground">
              {debtEvidence.map((point, idx) => (
                <div key={idx} className="flex items-start gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
                  <span className="text-foreground/90">{point}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Debt Trend Multi-year Matrix (For non-financials) */}
        {debtTrend.some(d => d.totalDebt !== null) && (
          <div className="overflow-x-auto border border-border/40 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-muted/30 border-b border-border/45 font-semibold text-muted-foreground">
                  <th className="p-3">FY Year</th>
                  <th className="p-3 text-right">Total Debt (Cr)</th>
                  <th className="p-3 text-right">Debt / Equity</th>
                  <th className="p-3 text-right">Interest Coverage</th>
                  <th className="p-3 text-right">Current Ratio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/25">
                {debtTrend.map((d) => (
                  <tr key={d.year} className="hover:bg-muted/10 transition-colors font-tabular">
                    <td className="p-3 font-semibold text-foreground">FY{d.year}</td>
                    <td className="p-3 text-right text-foreground">{d.totalDebt !== null ? d.totalDebt.toLocaleString() : 'N/A'}</td>
                    <td className="p-3 text-right text-foreground">{d.debtToEquity !== null ? `${d.debtToEquity.toFixed(2)}x` : 'N/A'}</td>
                    <td className="p-3 text-right text-foreground">{d.interestCoverage !== null ? `${d.interestCoverage.toFixed(2)}x` : 'N/A'}</td>
                    <td className="p-3 text-right text-foreground">{d.currentRatio !== null ? `${d.currentRatio.toFixed(2)}x` : 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3. Deep Red Flag Scanner Details */}
      <div className="glass-card rounded-2xl border border-border/50 p-6 space-y-6">
        <div>
          <h3 className="text-sm font-black uppercase text-foreground tracking-wider flex items-center gap-2">
            <AlertTriangle className="h-4.5 w-4.5 text-warning shrink-0" />
            Audit Red Flag Scanner ({redFlags.length})
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Detailed breakdown of warning signals, governance audits, and cash conversion issues
          </p>
        </div>

        {redFlags.length === 0 ? (
          <div className="flex items-center gap-2.5 p-4 rounded-xl border border-success/20 bg-success/5 text-success text-xs font-semibold">
            <ShieldCheck className="h-5 w-5 shrink-0" />
            No active governance or balance sheet red flags detected under our scanner parameters.
          </div>
        ) : (
          <div className="space-y-4">
            {redFlags.map((flag) => (
              <div 
                key={flag.id} 
                className={cn(
                  'p-5 rounded-xl border flex flex-col md:flex-row gap-5 items-start justify-between relative overflow-hidden transition-all duration-200 hover:bg-muted/10',
                  flag.severity === 'High' ? 'bg-danger/5 border-danger/25' :
                  flag.severity === 'Medium' ? 'bg-warning/5 border-warning/25' :
                  'bg-muted/20 border-border/60'
                )}
              >
                <div className="space-y-3 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black uppercase tracking-widest bg-card border border-border px-2 py-0.5 rounded text-foreground/80">
                      {flag.category}
                    </span>
                    <span className={cn(
                      'text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border',
                      flag.severity === 'High' ? 'bg-danger/15 text-danger border-danger/30' :
                      flag.severity === 'Medium' ? 'bg-warning/15 text-warning border-warning/30' :
                      'bg-muted/60 text-muted-foreground border-border'
                    )}>
                      {flag.severity} Severity
                    </span>
                    <h4 className="text-sm font-bold text-foreground font-sans">
                      {flag.title}
                    </h4>
                  </div>
                  
                  <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed">
                    {flag.explanation}
                  </p>
                  
                  <div className="p-3 bg-card border border-border rounded-xl space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">
                      Suggested Investor Caution
                    </span>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {flag.investorCaution}
                    </p>
                  </div>
                </div>

                {/* Inline Auditable Evidence box */}
                <div className="w-full md:w-80 shrink-0 p-4 bg-card border border-border rounded-xl space-y-2 relative overflow-hidden self-stretch flex flex-col justify-center">
                  <span className="text-[9px] text-muted-foreground uppercase font-black tracking-widest block border-b border-border/40 pb-1">
                    Audit Verification Trail
                  </span>
                  <div className="text-xs font-semibold text-foreground leading-relaxed flex items-start gap-1.5">
                    <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    <span>{flag.evidence}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
