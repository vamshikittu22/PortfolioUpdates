// =============================================================================
// FolioIntel Research Module — Scoring & Verdict Engine
// =============================================================================
// Transparent, explainable, and weight-based scoring engine.
// Avoids black-box mystery scoring by displaying factors and weights.
// =============================================================================

import type { ResearchScore, FinalAssessment, ResearchReport } from './research-types';

// ---------------------------------------------------------------------------
// Standard Weights Configuration (Must sum to 1.0)
// ---------------------------------------------------------------------------
export const SCORING_WEIGHTS = {
  'Business Quality': 0.20,
  'Financial Strength': 0.20,
  'Valuation Attractiveness': 0.15,
  'Ownership Quality': 0.15,
  'Risk Level': 0.10,
  'News Momentum': 0.10,
  'Macro Resilience': 0.10,
};

/**
 * Calculates the overall weighted score based on 7 pillars.
 * Score is normalized to 0-10.
 *
 * @param scores - Array of sub-scores
 * @returns weighted score out of 10
 */
export function calculateWeightedScore(scores: ResearchScore[]): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const s of scores) {
    weightedSum += s.score * s.weight;
    totalWeight += s.weight;
  }

  return totalWeight > 0 ? +(weightedSum / totalWeight).toFixed(2) : 0;
}

/**
 * Derives a research stance based on calculated weighted scores.
 * Under compliance guidelines:
 *   - >= 7.5: Favorable
 *   - >= 4.5 and < 7.5: Mixed
 *   - < 4.5: Risky
 *
 * Stance is framing research support, not guaranteed financial advice.
 */
export function deriveStanceFromScore(weightedScore: number): 'Favorable' | 'Mixed' | 'Risky' {
  if (weightedScore >= 7.5) {
    return 'Favorable';
  } else if (weightedScore >= 4.5) {
    return 'Mixed';
  } else {
    return 'Risky';
  }
}

/**
 * Validates that score weights config is mathematically sound (summing to 1.0)
 */
export function validateWeights(): boolean {
  const sum = Object.values(SCORING_WEIGHTS).reduce((acc, w) => acc + w, 0);
  return Math.abs(sum - 1.0) < 0.0001;
}
