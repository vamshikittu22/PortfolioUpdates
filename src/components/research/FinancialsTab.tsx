'use client';

import React, { useState } from 'react';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as ChartTooltip, 
  Legend, 
  AreaChart, 
  Area 
} from 'recharts';
import { 
  TrendingUp, 
  Info, 
  DollarSign, 
  Copy, 
  Check, 
  AlertCircle,
  FileSpreadsheet
} from 'lucide-react';
import type { FundamentalsAnalysis, FinancialMetricYear } from '@/lib/research/research-types';
import { cn } from '@/utils/cn';

interface FinancialsTabProps {
  fundamentals: FundamentalsAnalysis;
  ticker: string;
}

export function FinancialsTab({ fundamentals, ticker }: FinancialsTabProps) {
  const { metrics, currency, unitScale, highlights } = fundamentals;
  const [copied, setCopied] = useState(false);

  const fmtCurrency = (val: number | null) => {
    if (val === null) return 'N/A';
    return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  // Check which years have valid data for key charts
  const validRevenueData = metrics.filter(m => m.revenue !== null);
  const validMarginData = metrics.filter(m => m.netMargin !== null || m.operatingMargin !== null);
  const validReturnData = metrics.filter(m => m.roe !== null || m.roce !== null);
  const validCashFlowData = metrics.filter(m => m.operatingCashFlow !== null || m.freeCashFlow !== null);

  // Copy table to clipboard in CSV format
  const handleCopyTable = () => {
    const headers = ['Year', 'Revenue (Cr)', 'Net Profit (Cr)', 'EPS (₹)', 'Book Value (₹)', 'ROE (%)', 'ROCE (%)', 'D/E Ratio'];
    const rows = metrics.map(m => [
      m.year,
      m.revenue !== null ? m.revenue : 'N/A',
      m.netProfit !== null ? m.netProfit : 'N/A',
      m.eps !== null ? m.eps : 'N/A',
      m.bookValuePerShare !== null ? m.bookValuePerShare : 'N/A',
      m.roe !== null ? `${m.roe}%` : 'N/A',
      m.roce !== null ? `${m.roce}%` : 'N/A',
      m.debtToEquity !== null ? m.debtToEquity : 'N/A'
    ]);

    const csvContent = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
    navigator.clipboard.writeText(csvContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const chartTheme = {
    grid: 'rgba(148, 163, 184, 0.1)',
    tooltipBg: 'rgba(21, 25, 35, 0.95)',
    tooltipBorder: 'rgba(255, 255, 255, 0.08)'
  };

  return (
    <div className="space-y-6">
      {/* Highlights/Explainers Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {highlights.map((hl, i) => (
          <div key={i} className="glass-card rounded-xl border border-border/50 p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                {hl.metric}
              </span>
              <span className="text-xs font-black text-primary font-tabular">
                {hl.currentValue}
              </span>
            </div>
            <p className="text-xs text-foreground/90 leading-relaxed pt-1">
              {hl.explanation}
            </p>
            {hl.benchmark && (
              <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1 border-t border-border/30 pt-1.5">
                <Info className="h-3 w-3 text-primary shrink-0" />
                Benchmark: {hl.benchmark}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Primary Financial Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Chart 1: Revenue & Profit Trend */}
        <div className="glass-card rounded-2xl border border-border/50 p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-foreground">Revenue & Net Profit Trend</h3>
            <p className="text-xs text-muted-foreground">Historical trajectory over 10 fiscal years (Figures in ₹ {unitScale})</p>
          </div>
          {validRevenueData.length > 0 ? (
            <div className="h-72 w-full text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={validRevenueData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                  <XAxis dataKey="year" stroke="#94a3b8" />
                  <YAxis yAxisId="left" stroke="#00d4aa" />
                  <YAxis yAxisId="right" orientation="right" stroke="#ef4444" />
                  <ChartTooltip 
                    contentStyle={{ backgroundColor: chartTheme.tooltipBg, borderColor: chartTheme.tooltipBorder, borderRadius: '8px' }}
                    labelStyle={{ fontWeight: 'bold', color: '#f8fafc' }}
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#00d4aa" radius={[4, 4, 0, 0]} maxBarSize={30} />
                  <Bar yAxisId="right" dataKey="netProfit" name="Net Profit" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 flex items-center justify-center border border-dashed border-border rounded-xl bg-muted/10 text-muted-foreground text-xs">
              Revenue data is not available for this security.
            </div>
          )}
        </div>

        {/* Chart 2: Profit Margins Trend */}
        <div className="glass-card rounded-2xl border border-border/50 p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-foreground">Operating & Net Margin Quality</h3>
            <p className="text-xs text-muted-foreground">Evolution of operational efficiency and profit retention (%)</p>
          </div>
          {validMarginData.length > 0 ? (
            <div className="h-72 w-full text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={validMarginData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                  <XAxis dataKey="year" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" unit="%" />
                  <ChartTooltip
                    contentStyle={{ backgroundColor: chartTheme.tooltipBg, borderColor: chartTheme.tooltipBorder, borderRadius: '8px' }}
                    labelStyle={{ fontWeight: 'bold', color: '#f8fafc' }}
                  />
                  <Legend verticalAlign="top" height={36} />
                  {validMarginData.some(m => m.operatingMargin !== null) && (
                    <Area type="monotone" dataKey="operatingMargin" name="Operating Margin" stroke="#a855f7" fill="url(#opMargin)" strokeWidth={2} />
                  )}
                  <Area type="monotone" dataKey="netMargin" name="Net Margin" stroke="#00d4aa" fill="url(#netMargin)" strokeWidth={2} />
                  <defs>
                    <linearGradient id="opMargin" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="netMargin" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00d4aa" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#00d4aa" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 flex items-center justify-center border border-dashed border-border rounded-xl bg-muted/10 text-muted-foreground text-xs p-4 text-center">
              <AlertCircle className="h-8 w-8 text-warning mx-auto mb-2" />
              Margins metrics are not available or not applicable for this banking profile.
            </div>
          )}
        </div>

        {/* Chart 3: ROE & ROCE Return Profiles */}
        <div className="glass-card rounded-2xl border border-border/50 p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-foreground">Return on Capital (ROE & ROCE)</h3>
            <p className="text-xs text-muted-foreground">Historical productivity of shareholder equity and capital employed (%)</p>
          </div>
          {validReturnData.length > 0 ? (
            <div className="h-72 w-full text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={validReturnData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                  <XAxis dataKey="year" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" unit="%" />
                  <ChartTooltip
                    contentStyle={{ backgroundColor: chartTheme.tooltipBg, borderColor: chartTheme.tooltipBorder, borderRadius: '8px' }}
                    labelStyle={{ fontWeight: 'bold', color: '#f8fafc' }}
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Line type="monotone" dataKey="roe" name="Return on Equity (ROE)" stroke="#00d4aa" strokeWidth={2.5} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="roce" name="Return on Capital Employed (ROCE)" stroke="#f97316" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 flex items-center justify-center border border-dashed border-border rounded-xl bg-muted/10 text-muted-foreground text-xs">
              Return ratios data is not available.
            </div>
          )}
        </div>

        {/* Chart 4: Cash Flow Quality */}
        <div className="glass-card rounded-2xl border border-border/50 p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-foreground">Operating vs Free Cash Flow</h3>
            <p className="text-xs text-muted-foreground">Cash conversion ability and capital expenditure quality (₹ {unitScale})</p>
          </div>
          {validCashFlowData.length > 0 ? (
            <div className="h-72 w-full text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={validCashFlowData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                  <XAxis dataKey="year" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <ChartTooltip
                    contentStyle={{ backgroundColor: chartTheme.tooltipBg, borderColor: chartTheme.tooltipBorder, borderRadius: '8px' }}
                    labelStyle={{ fontWeight: 'bold', color: '#f8fafc' }}
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Bar dataKey="operatingCashFlow" name="Operating Cash Flow" fill="#00d4aa" radius={[4, 4, 0, 0]} maxBarSize={20} />
                  <Bar dataKey="freeCashFlow" name="Free Cash Flow" fill="#38bdf8" radius={[4, 4, 0, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 flex items-center justify-center border border-dashed border-border rounded-xl bg-muted/10 text-muted-foreground text-xs p-6 text-center">
              <div className="space-y-1">
                <AlertCircle className="h-8 w-8 text-warning mx-auto mb-1" />
                <span className="font-semibold block text-foreground">Cash Flows Not Applicable</span>
                <span className="text-[11px] leading-relaxed block">
                  For banking institutions (e.g. {ticker}), operational and free cash flow metrics are distorted by asset-liability mismatched deposit/lending flows. Solvency ratios are preferred.
                </span>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Multi-Year Data Table */}
      <div className="glass-card rounded-2xl border border-border/50 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">Historical Metric Series (FY15 - FY24)</h3>
            <p className="text-xs text-muted-foreground">Complete tabular metrics matching official exchange filings</p>
          </div>
          <button
            onClick={handleCopyTable}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-muted/50 border border-border hover:border-primary/40 text-xs font-bold text-foreground rounded-lg transition-colors cursor-pointer"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied CSV' : 'Copy Table Data'}
          </button>
        </div>

        <div className="overflow-x-auto border border-border/40 rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-muted/30 border-b border-border/45 font-semibold text-muted-foreground">
                <th className="p-3">FY Year</th>
                <th className="p-3 text-right">Revenue (Cr)</th>
                <th className="p-3 text-right">Net Profit (Cr)</th>
                <th className="p-3 text-right">EPS (₹)</th>
                <th className="p-3 text-right">Book Value (₹)</th>
                <th className="p-3 text-right">ROE</th>
                <th className="p-3 text-right">ROCE</th>
                <th className="p-3 text-right">Debt / Equity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/25">
              {metrics.map((m) => (
                <tr key={m.year} className="hover:bg-muted/10 transition-colors font-tabular">
                  <td className="p-3 font-semibold text-foreground">FY{m.year}</td>
                  <td className="p-3 text-right text-foreground">{fmtCurrency(m.revenue)}</td>
                  <td className="p-3 text-right text-foreground">{fmtCurrency(m.netProfit)}</td>
                  <td className="p-3 text-right text-foreground">{m.eps !== null ? m.eps.toFixed(2) : 'N/A'}</td>
                  <td className="p-3 text-right text-foreground">{m.bookValuePerShare !== null ? m.bookValuePerShare.toFixed(2) : 'N/A'}</td>
                  <td className="p-3 text-right text-foreground">{m.roe !== null ? `${m.roe.toFixed(1)}%` : 'N/A'}</td>
                  <td className="p-3 text-right text-foreground">{m.roce !== null ? `${m.roce.toFixed(1)}%` : 'N/A'}</td>
                  <td className="p-3 text-right text-foreground">{m.debtToEquity !== null ? `${m.debtToEquity.toFixed(2)}x` : 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
