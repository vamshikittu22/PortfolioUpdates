'use client';

import React, { useState } from 'react';
import { 
  ResponsiveContainer, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  Radar 
} from 'recharts';
import { 
  LayoutGrid, 
  Hexagon, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Info,
  Scale
} from 'lucide-react';
import type { ResearchScore } from '@/lib/research/research-types';
import { cn } from '@/utils/cn';

interface ResearchScorecardProps {
  scores: ResearchScore[];
}

export function ResearchScorecard({ scores }: ResearchScorecardProps) {
  const [viewMode, setViewMode] = useState<'list' | 'radar'>('list');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(scores[0]?.category || null);

  // Map scores data format for radar chart
  const radarData = scores.map(s => ({
    subject: s.category,
    value: s.score,
    fullMark: 10,
  }));

  // Calculate weighted overall score
  const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
  const weightedOverallScore = totalWeight > 0 
    ? scores.reduce((sum, s) => sum + (s.score * s.weight), 0) / totalWeight
    : 0;

  const getImpactIcon = (impact: 'Positive' | 'Negative' | 'Neutral') => {
    switch (impact) {
      case 'Positive':
        return <CheckCircle className="h-3.5 w-3.5 text-success shrink-0" />;
      case 'Negative':
        return <XCircle className="h-3.5 w-3.5 text-danger shrink-0" />;
      default:
        return <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
    }
  };

  const chartTheme = {
    radarStroke: '#00d4aa',
    radarFill: '#00d4aa',
    grid: 'rgba(148, 163, 184, 0.1)',
  };

  return (
    <div className="glass-card rounded-2xl border border-border/50 p-6 space-y-6">
      
      {/* Header and Toggle Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/30 pb-4">
        <div className="space-y-1">
          <h3 className="text-sm font-black uppercase text-foreground tracking-wider flex items-center gap-2">
            <Scale className="h-4.5 w-4.5 text-primary" />
            Explainable Research Scores
          </h3>
          <p className="text-xs text-muted-foreground">
            Analysis score compiled across 7 key pillars. Weighted Overall Score:{' '}
            <strong className="text-foreground text-sm font-mono">{weightedOverallScore.toFixed(2)}/10</strong>
          </p>
        </div>

        <div className="inline-flex rounded-xl bg-muted p-1 border border-border/50 shrink-0">
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer',
              viewMode === 'list'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Pillars List
          </button>
          <button
            onClick={() => setViewMode('radar')}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer',
              viewMode === 'radar'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Hexagon className="h-3.5 w-3.5" />
            Radar Plot
          </button>
        </div>
      </div>

      {/* View Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Score display panel */}
        <div className={cn(
          'space-y-3',
          viewMode === 'list' ? 'lg:col-span-6' : 'lg:col-span-5'
        )}>
          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">
            Core Research Pillars
          </span>
          <div className="space-y-2.5">
            {scores.map((item) => {
              const isActive = expandedCategory === item.category;
              
              return (
                <button
                  key={item.category}
                  onClick={() => setExpandedCategory(isActive ? null : item.category)}
                  className={cn(
                    'w-full text-left p-3.5 rounded-xl border transition-all duration-200 cursor-pointer block',
                    isActive 
                      ? 'bg-muted/30 border-primary/30 shadow-sm' 
                      : 'bg-card border-border/50 hover:border-border hover:bg-muted/10'
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5 gap-2">
                    <span className="text-xs font-bold text-foreground truncate">{item.category}</span>
                    <div className="flex items-center gap-1.5 shrink-0 font-tabular text-xs">
                      <span className="font-black text-foreground">{item.score}</span>
                      <span className="text-muted-foreground">/10</span>
                      <span className="text-[10px] text-muted-foreground ml-1.5">({Math.round(item.weight * 100)}%)</span>
                    </div>
                  </div>

                  {/* Horizontal score indicator bar */}
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden border border-border/40">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-300',
                        item.score >= 8 ? 'bg-success/80' : 
                        item.score >= 5 ? 'bg-primary/80' : 
                        item.score >= 3 ? 'bg-warning/80' : 'bg-danger/80'
                      )}
                      style={{ width: `${item.score * 10}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Side: Details panel / Recharts Radar Chart */}
        <div className={cn(
          'border-t lg:border-t-0 pt-6 lg:pt-0',
          viewMode === 'list' ? 'lg:col-span-6 lg:border-l lg:pl-6 border-border/30' : 'lg:col-span-7'
        )}>
          {viewMode === 'list' ? (
            <div className="space-y-4">
              {expandedCategory ? (
                (() => {
                  const selectedScore = scores.find(s => s.category === expandedCategory);
                  if (!selectedScore) return null;

                  return (
                    <div className="space-y-4 animate-in fade-in duration-150">
                      <div>
                        <span className="text-[10px] text-primary uppercase font-black tracking-widest">
                          {selectedScore.category} Audit
                        </span>
                        <h4 className="text-sm font-bold text-foreground mt-0.5">Score Analysis & Valuation factors</h4>
                        <p className="text-xs text-muted-foreground leading-relaxed mt-1.5">
                          {selectedScore.explanation}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">
                          Supporting Factors & Metrics
                        </span>
                        <div className="divide-y divide-border/30 border border-border/40 rounded-xl overflow-hidden bg-card">
                          {selectedScore.factors.map((f, i) => (
                            <div key={i} className="flex items-start gap-2.5 p-3 text-xs">
                              {getImpactIcon(f.impact)}
                              <div className="flex-1">
                                <span className="font-bold text-foreground block">{f.name}</span>
                                <span className="text-muted-foreground leading-relaxed mt-0.5">{f.value}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="h-full flex items-center justify-center text-center p-6 text-muted-foreground text-xs border border-dashed border-border rounded-xl">
                  Select any pillar on the left to inspect its explainable parameters, weighting values, and supporting metrics.
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 flex flex-col justify-center items-center">
              <div className="h-72 w-full max-w-sm text-xs">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                    <PolarGrid stroke={chartTheme.grid} />
                    <PolarAngleAxis dataKey="subject" stroke="#94a3b8" />
                    <PolarRadiusAxis angle={30} domain={[0, 10]} stroke="#94a3b8" tickCount={6} />
                    <Radar
                      name="Score Pillars"
                      dataKey="value"
                      stroke={chartTheme.radarStroke}
                      fill={chartTheme.radarFill}
                      fillOpacity={0.25}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <span className="text-[10px] text-muted-foreground italic text-center max-w-xs leading-relaxed">
                Normalized radar chart mapping 7 pillars out of 10. Symmetric shapes represent balanced capital returns and low solvency stress.
              </span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
