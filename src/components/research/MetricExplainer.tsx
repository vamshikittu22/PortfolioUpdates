'use client';

import React, { useState } from 'react';
import { HelpCircle, Info, TrendingUp, TrendingDown, Layers } from 'lucide-react';
import { cn } from '@/utils/cn';

interface MetricExplainerProps {
  metricName: string;
  currentValue?: string | number;
  trend?: 'improving' | 'stable' | 'deteriorating';
  benchmark?: string;
  explanation?: string;
  className?: string;
}

const METRIC_DICTIONARY: Record<string, { definition: string; significance: string; defaultBenchmark: string }> = {
  'PE Ratio': {
    definition: 'Price-to-Earnings Ratio measures the current share price relative to its per-share earnings.',
    significance: 'Helps determine if a stock is overvalued or undervalued relative to historical norms and sector peers.',
    defaultBenchmark: 'Sector average or 5-year historical median.'
  },
  'PB Ratio': {
    definition: 'Price-to-Book Ratio compares a company\'s market value to its book value (net assets).',
    significance: 'Critical for capital-intensive sectors and banks to see how assets are priced. A lower ratio can suggest safety.',
    defaultBenchmark: 'Sector average or 1.5x - 3.0x range.'
  },
  'ROE': {
    definition: 'Return on Equity measures profitability by showing how much profit a company generates with the money shareholders have invested.',
    significance: 'Measures capital productivity. Consistent ROE above 15% indicates a strong, wealth-generating business.',
    defaultBenchmark: 'Private Sector Banking average is ~14%; Nifty median is ~12-14%.'
  },
  'ROCE': {
    definition: 'Return on Capital Employed measures profitability and efficiency with which all capital (debt + equity) is employed.',
    significance: 'Indicates how well the firm allocates capital. Must consistently exceed the cost of debt/capital to generate value.',
    defaultBenchmark: 'Cost of capital threshold (typically ~11-12%).'
  },
  'Debt to Equity': {
    definition: 'Total debt divided by shareholders\' equity. Measures financial leverage.',
    significance: 'Indicates risk profile. High debt (ratios > 1.0x) raises interest costs and increases insolvency risk during downturns.',
    defaultBenchmark: 'Nifty 50 median is ~0.5x. Warnings triggered if > 1.2x (non-financials).'
  },
  'Interest Coverage': {
    definition: 'EBITDA (or EBIT) divided by total annual interest expense.',
    significance: 'Measures ease of servicing outstanding debt. Ratios below 2.0x suggest immediate distress potential.',
    defaultBenchmark: 'Ideally > 3.0x for stability.'
  },
  'Current Ratio': {
    definition: 'Current assets divided by current liabilities. Measures short-term liquidity.',
    significance: 'Checks if a company can meet its short-term obligations due within 1 year.',
    defaultBenchmark: 'Ideally > 1.2x - 1.5x for non-financials.'
  },
  'Free Cash Flow': {
    definition: 'Operating cash flow minus capital expenditures (Capex).',
    significance: 'Actual cash available for dividends, acquisitions, or debt reduction. True measure of profitability over accounting net profit.',
    defaultBenchmark: 'Net Profit to FCF conversion of > 65% over cycles.'
  }
};

export function MetricExplainer({ 
  metricName, 
  currentValue, 
  trend, 
  benchmark, 
  explanation,
  className 
}: MetricExplainerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const dictData = METRIC_DICTIONARY[metricName] || {
    definition: 'Financial metric analyzing operational or structural performance.',
    significance: 'Used to benchmark growth, efficiency, or leverage safety parameters.',
    defaultBenchmark: 'Industry peer average.'
  };

  return (
    <div className={cn('relative inline-block', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        title={`What is ${metricName}?`}
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />
          
          {/* Explainer Popover Card */}
          <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-4 bg-popover border border-border text-xs rounded-xl shadow-lg space-y-3 animate-in fade-in slide-in-from-bottom-1">
            <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
              <span className="font-bold text-foreground">{metricName} Explainer</span>
              <span className="text-[9px] uppercase font-black text-primary tracking-widest">
                AI Audit
              </span>
            </div>

            <div className="space-y-2">
              <div>
                <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider block">What is it?</span>
                <p className="text-muted-foreground leading-relaxed mt-0.5">{dictData.definition}</p>
              </div>

              <div>
                <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider block">Why it matters?</span>
                <p className="text-muted-foreground leading-relaxed mt-0.5">{dictData.significance}</p>
              </div>

              {explanation && (
                <div className="p-2 bg-muted/30 rounded border border-border/40">
                  <span className="text-[9px] text-foreground uppercase font-bold tracking-wider block">Current Asset Assessment</span>
                  <p className="text-foreground/90 leading-relaxed mt-0.5">{explanation}</p>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-border/30 grid grid-cols-2 gap-2 text-[9px] text-muted-foreground">
              {currentValue !== undefined && (
                <div>
                  Current Value: <strong className="text-foreground">{currentValue}</strong>
                </div>
              )}
              {trend && (
                <div className="flex items-center gap-0.5">
                  Trend: 
                  <strong className={cn(
                    'inline-flex items-center gap-0.5 uppercase',
                    trend === 'improving' ? 'text-success' :
                    trend === 'deteriorating' ? 'text-danger' :
                    'text-warning'
                  )}>
                    {trend}
                  </strong>
                </div>
              )}
              <div className="col-span-2 mt-1">
                Target Benchmark: <strong className="text-foreground">{benchmark || dictData.defaultBenchmark}</strong>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
