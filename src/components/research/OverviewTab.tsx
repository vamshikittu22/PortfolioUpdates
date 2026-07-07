'use client';

import React, { useState } from 'react';
import { 
  ShieldAlert, 
  TrendingUp, 
  TrendingDown, 
  HelpCircle, 
  FileText, 
  Info, 
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  Calendar,
  AlertCircle
} from 'lucide-react';
import type { ResearchReport } from '@/lib/research/research-types';
import { ResearchDisclaimer } from './ResearchDisclaimer';
import { CompanyHeader } from './CompanyHeader';
import { ResearchScorecard } from './ResearchScorecard';
import { ProsConsCard } from './ProsConsCard';
import { cn } from '@/utils/cn';

interface OverviewTabProps {
  report: ResearchReport;
}

export function OverviewTab({ report }: OverviewTabProps) {
  const { companyProfile, priceAnalysis, finalAssessment, redFlags, pros, cons } = report;
  const [showEvidence, setShowEvidence] = useState(false);

  // Stance Styling mapping
  const stanceConfig = {
    Favorable: {
      bg: 'bg-success/10 border-success/30 text-success',
      text: 'text-success',
      icon: CheckCircle2,
    },
    Mixed: {
      bg: 'bg-warning/10 border-warning/30 text-warning',
      text: 'text-warning',
      icon: AlertTriangle,
    },
    Risky: {
      bg: 'bg-danger/10 border-danger/30 text-danger',
      text: 'text-danger',
      icon: XCircle,
    },
  };

  const currentStance = stanceConfig[finalAssessment.stance] || stanceConfig.Mixed;
  const StanceIcon = currentStance.icon;

  // Simple Helper for displaying short currency values
  const fmtCurrency = (val: number | null) => {
    if (val === null) return 'N/A';
    return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  return (
    <div className="space-y-6">
      {/* 1. Research Disclaimer */}
      <ResearchDisclaimer compact />

      {/* 2. Company Header (Included inside Overview Tab as requested) */}
      <CompanyHeader profile={companyProfile} price={priceAnalysis.snapshot} />

      {/* 3. Final Assessment Card */}
      <div className="glass-card rounded-2xl border border-border/50 p-6 space-y-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 h-24 w-24 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/30">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Final Research Stance
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Structured summary of findings & research stance
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEvidence(!showEvidence)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer',
                showEvidence
                  ? 'bg-primary/20 border-primary text-primary'
                  : 'bg-muted/40 border-border text-muted-foreground hover:text-foreground hover:border-border/80'
              )}
            >
              <Eye className="h-3.5 w-3.5" />
              {showEvidence ? 'Hide Source Trail' : 'Show Source Trail'}
            </button>
            
            <div className={cn('inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border text-sm font-bold', currentStance.bg)}>
              <StanceIcon className="h-4.5 w-4.5 shrink-0" />
              {finalAssessment.stance}
            </div>
          </div>
        </div>

        {/* Assessment Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-3">
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Confidence Level</span>
              <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <span className={cn(
                  'h-2 w-2 rounded-full',
                  finalAssessment.confidence === 'High' ? 'bg-success' : 
                  finalAssessment.confidence === 'Medium' ? 'bg-warning' : 'bg-danger'
                )} />
                {finalAssessment.confidence}
              </div>
            </div>
            
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Thesis Strength</span>
              <div className="text-sm font-bold text-foreground">
                {finalAssessment.thesisStrength}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Time Horizon</span>
              <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-primary shrink-0" />
                {finalAssessment.timeHorizon} Horizon
              </div>
            </div>
          </div>

          <div className="md:col-span-2 space-y-3">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider block">
              Core Stance Rationale & Supporting Evidence
            </span>
            <ul className="space-y-2">
              {finalAssessment.topEvidence.map((point, index) => (
                <li key={index} className="text-xs sm:text-sm text-foreground/90 flex items-start gap-2.5 leading-relaxed">
                  <span className="h-5 w-5 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0 mt-0.5">
                    {index + 1}
                  </span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Inline Source/Evidence Overlay */}
        {showEvidence && (
          <div className="p-4 bg-muted/40 rounded-xl border border-border/80 text-xs space-y-2 animate-in fade-in duration-200">
            <span className="font-bold text-foreground block">Evidence Source Index Path</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-muted-foreground">
              <div>• Financial Quality Index: Derived from 10-year filings (annual sheets).</div>
              <div>• Price Trend Quality: Based on Adjusted Close price index (NSE feed).</div>
              <div>• Shareholding Ratios: Disclosed under SEBI listing regulations.</div>
              <div>• Risks Scanner: Extracted from litigation reports and leverage ratios.</div>
            </div>
          </div>
        )}

        {/* Unresolved Uncertainties */}
        <div className="pt-4 border-t border-border/30 space-y-2">
          <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider flex items-center gap-1">
            <HelpCircle className="h-3.5 w-3.5 text-warning shrink-0" />
            Unresolved Uncertainties & Risk Caveats
          </span>
          <div className="flex flex-wrap gap-2">
            {finalAssessment.unresolvedUncertainties.map((item, idx) => (
              <span key={idx} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border/60 text-xs text-foreground/90">
                <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Scorecard Component */}
      <ResearchScorecard scores={report.scores} />

      {/* 5. Pros & Cons (Side by Side) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ProsConsCard items={pros} type="pro" />
        <ProsConsCard items={cons} type="con" />
      </div>

      {/* 6. Key Metrics Grid */}
      <div className="glass-card rounded-2xl border border-border/50 p-6 space-y-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
          Key Fundamental Indicators
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div>
            <span className="text-[9px] uppercase font-bold text-muted-foreground block tracking-wider">P/E Ratio</span>
            <span className="text-lg font-black text-foreground font-tabular">
              {report.valuation.multiples.find(m => m.name === 'PE Ratio')?.current || 'N/A'}x
            </span>
          </div>
          <div>
            <span className="text-[9px] uppercase font-bold text-muted-foreground block tracking-wider">P/B Ratio</span>
            <span className="text-lg font-black text-foreground font-tabular">
              {report.valuation.multiples.find(m => m.name === 'PB Ratio')?.current || 'N/A'}x
            </span>
          </div>
          <div>
            <span className="text-[9px] uppercase font-bold text-muted-foreground block tracking-wider">ROE</span>
            <span className="text-lg font-black text-foreground font-tabular">
              {report.fundamentals.metrics[report.fundamentals.metrics.length - 1]?.roe || 'N/A'}%
            </span>
          </div>
          <div>
            <span className="text-[9px] uppercase font-bold text-muted-foreground block tracking-wider">Net Margin</span>
            <span className="text-lg font-black text-foreground font-tabular">
              {report.fundamentals.metrics[report.fundamentals.metrics.length - 1]?.netMargin || 'N/A'}%
            </span>
          </div>
          <div>
            <span className="text-[9px] uppercase font-bold text-muted-foreground block tracking-wider">Debt to Equity</span>
            <span className="text-lg font-black text-foreground font-tabular">
              {report.fundamentals.metrics[report.fundamentals.metrics.length - 1]?.debtToEquity !== null
                ? `${report.fundamentals.metrics[report.fundamentals.metrics.length - 1]?.debtToEquity}x`
                : 'N/A'}
            </span>
          </div>
          <div>
            <span className="text-[9px] uppercase font-bold text-muted-foreground block tracking-wider">Dividend Yield</span>
            <span className="text-lg font-black text-foreground font-tabular">
              {report.valuation.dividendYield !== null ? `${report.valuation.dividendYield}%` : '0.00%'}
            </span>
          </div>
        </div>
      </div>

      {/* 7. Mini Red Flag Panel */}
      <div className="glass-card rounded-2xl border border-border/50 p-6 space-y-4">
        <h3 className="text-sm font-black uppercase text-foreground tracking-wider flex items-center gap-2">
          <AlertCircle className="h-4.5 w-4.5 text-warning shrink-0" />
          Red Flags Scanner ({redFlags.length})
        </h3>
        
        {redFlags.length === 0 ? (
          <div className="flex items-center gap-2 p-4 rounded-xl border border-success/20 bg-success/5 text-success text-xs font-semibold">
            <CheckCircle2 className="h-4.5 w-4.5 shrink-0" />
            No red flags detected based on available audit metrics.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {redFlags.slice(0, 4).map((flag) => (
              <div key={flag.id} className="p-4 bg-muted/20 border border-border/40 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">{flag.title}</span>
                  <span className={cn(
                    'text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border',
                    flag.severity === 'High' ? 'bg-danger/15 text-danger border-danger/30' :
                    flag.severity === 'Medium' ? 'bg-warning/15 text-warning border-warning/30' :
                    'bg-muted/60 text-muted-foreground border-border'
                  )}>
                    {flag.severity} Risk
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                  {flag.explanation}
                </p>
                <div className="text-[10px] text-muted-foreground bg-card border border-border px-2.5 py-1 rounded">
                  <strong>Evidence:</strong> {flag.evidence}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 8. Company Snapshot */}
      <div className="glass-card rounded-2xl border border-border/50 p-6 space-y-3">
        <h3 className="text-sm font-black uppercase text-foreground tracking-wider">
          Company Snapshot
        </h3>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          {companyProfile.description}
        </p>
        <div className="pt-2">
          <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider block">Business Model</span>
          <p className="text-xs text-foreground/90 leading-relaxed mt-1">
            {companyProfile.businessModel}
          </p>
        </div>
      </div>
    </div>
  );
}
