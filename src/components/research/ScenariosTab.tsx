'use client';

import React from 'react';
import { 
  Compass, 
  HelpCircle, 
  AlertTriangle, 
  CheckSquare, 
  Globe, 
  TrendingUp, 
  TrendingDown, 
  Play, 
  ShieldAlert,
  Info
} from 'lucide-react';
import type { ScenariosAnalysis, ScenarioCase } from '@/lib/research/research-types';
import { cn } from '@/utils/cn';

interface ScenariosTabProps {
  scenariosAnalysis: ScenariosAnalysis;
}

const PROBABILITY_COLORS = {
  High: 'bg-success/15 text-success border-success/30',
  Medium: 'bg-warning/15 text-warning border-warning/30',
  Low: 'bg-danger/15 text-danger border-danger/30',
};

export function ScenariosTab({ scenariosAnalysis }: ScenariosTabProps) {
  const { scenarios, macroContext, triggerChecklist } = scenariosAnalysis;

  return (
    <div className="space-y-6">
      
      {/* 1. Foreword Disclaimer */}
      <div className="p-4 rounded-xl border border-warning/20 bg-warning/5 text-xs text-muted-foreground leading-relaxed">
        <strong className="text-warning">Scenario Framework Notice:</strong> These projection matrices do not represent financial predictions, guaranteed targets, or absolute certainties. They are structured, conditional scenarios designed to map sensitivities based on macro and micro assumptions.
      </div>

      {/* 2. Macro Sensitivity Assessment Panel */}
      <div className="glass-card rounded-2xl border border-border/50 p-6 space-y-4">
        <div>
          <h3 className="text-sm font-black uppercase text-foreground tracking-wider flex items-center gap-2">
            <Globe className="h-4.5 w-4.5 text-primary" />
            Macroeconomic Sensitivity & industry Impact
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            How broader market indicators affect the company\'s structural margins
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {macroContext.factors.map((factor, idx) => (
            <div key={idx} className="p-4 bg-muted/20 border border-border/40 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-foreground">{factor.factor}</span>
                <span className={cn(
                  'text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border',
                  factor.sensitivity === 'High' ? 'bg-danger/15 text-danger border-danger/30' :
                  factor.sensitivity === 'Medium' ? 'bg-warning/15 text-warning border-warning/30' :
                  'bg-muted/60 text-muted-foreground border-border'
                )}>
                  Sensitivity: {factor.sensitivity}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {factor.explanation}
              </p>
              <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1 border-t border-border/30 pt-1.5">
                <Info className="h-3 w-3 text-primary shrink-0" />
                Current Cycle Impact:{' '}
                <span className={cn(
                  'font-bold ml-1',
                  factor.currentImpact === 'Positive' ? 'text-success' :
                  factor.currentImpact === 'Negative' ? 'text-danger' :
                  'text-muted-foreground'
                )}>
                  {factor.currentImpact}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Three-Column Scenario Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {scenarios.map((sc) => {
          const isBull = sc.type === 'Bull';
          const isBear = sc.type === 'Bear';

          return (
            <div 
              key={sc.type} 
              className={cn(
                'glass-card rounded-2xl border p-5 flex flex-col justify-between space-y-5',
                isBull ? 'border-success/25 bg-success/2' :
                isBear ? 'border-danger/25 bg-danger/2' :
                'border-warning/25 bg-warning/2'
              )}
            >
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'h-2.5 w-2.5 rounded-full animate-pulse',
                      isBull ? 'bg-success' : isBear ? 'bg-danger' : 'bg-warning'
                    )} />
                    <span className="font-black text-sm uppercase text-foreground">
                      {sc.type} Case
                    </span>
                  </div>
                  
                  <span className={cn(
                    'text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border',
                    PROBABILITY_COLORS[sc.probabilityBand]
                  )}>
                    Prob: {sc.probabilityBand}
                  </span>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-foreground leading-snug">
                    {sc.title}
                  </h4>

                  {/* Conditions List */}
                  <div className="space-y-1.5">
                    <span className="text-[9px] text-muted-foreground uppercase font-black tracking-wider block">
                      Required Conditions
                    </span>
                    <ul className="space-y-1 text-xs text-muted-foreground list-disc pl-4 leading-relaxed">
                      {sc.conditions.map((cond, i) => (
                        <li key={i}>{cond}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Business Impact */}
                  <div className="space-y-1 border-t border-border/30 pt-3">
                    <span className="text-[9px] text-muted-foreground uppercase font-black tracking-wider block">
                      Operational Implication
                    </span>
                    <p className="text-xs text-foreground/90 leading-relaxed">
                      {sc.businessImpact}
                    </p>
                  </div>

                  {/* Valuation Implication */}
                  <div className="space-y-1 border-t border-border/30 pt-3">
                    <span className="text-[9px] text-muted-foreground uppercase font-black tracking-wider block">
                      Valuation Implication
                    </span>
                    <p className="text-xs text-foreground/90 leading-relaxed font-mono">
                      {sc.valuationImplication}
                    </p>
                  </div>
                </div>
              </div>

              {/* Risks & Signals */}
              <div className="space-y-3 pt-4 border-t border-border/40">
                {sc.watchSignals && sc.watchSignals.length > 0 && (
                  <div className="p-3 bg-card border border-border rounded-xl space-y-1">
                    <span className="text-[9px] text-primary font-black uppercase tracking-wider block">
                      Watch Signals
                    </span>
                    <ul className="space-y-0.5 text-[10px] text-muted-foreground list-decimal pl-3.5 leading-relaxed">
                      {sc.watchSignals.map((sig, i) => (
                        <li key={i}>{sig}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                <div className="space-y-1">
                  <span className="text-[9px] text-danger font-black uppercase tracking-wider block">
                    Key Risk Factors
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {sc.keyRisks.map((risk, i) => (
                      <span key={i} className="inline-flex text-[9px] font-bold px-2 py-0.5 rounded bg-danger/10 border border-danger/20 text-danger">
                        {risk}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          );
        })}
      </div>

      {/* 4. Trigger Checklist Panel */}
      <div className="glass-card rounded-2xl border border-border/50 p-6 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <CheckSquare className="h-4.5 w-4.5 text-primary" />
            Strategic Watchlist & Trigger Checklist
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Key indicators that will validate or invalidate these scenario projections
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {triggerChecklist.map((item, idx) => (
            <div key={idx} className="p-3 bg-muted/10 border border-border/40 rounded-xl flex items-start gap-2.5">
              <Play className="h-3 w-3 text-primary mt-1 shrink-0" />
              <span className="text-xs text-foreground/90 leading-relaxed font-semibold">
                {item}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
