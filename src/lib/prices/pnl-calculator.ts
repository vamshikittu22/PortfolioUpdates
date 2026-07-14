/**
 * PRICE-06 / PRICE-07 — pure P&L calculation logic consumed by 03-05's UI.
 * No I/O, no database. Reuses nothing from deriveHoldings (that stays in
 * src/lib/portfolio/derive-holdings.ts) — this module only turns
 * { quantity, avgCost } + a current price into P&L numbers.
 *
 * STUB (RED phase) — every function below is intentionally unimplemented.
 */

import type { Currency } from '@/lib/types';

export interface HoldingPnL {
  status: 'pending' | 'priced';
  costBasis: number;
  currentValue: number | null;
  unrealizedPnL: number | null;
  unrealizedPnLPct: number | null;
  dayChangeAmount: number | null;
  dayChangePct: number | null;
}

export interface PortfolioTotal {
  totalCostBasis: number;
  totalCurrentValue: number;
  totalUnrealizedPnL: number;
  totalDayChange: number;
  fxRateUsed: number;
  nativeSubtotals: Record<Currency, { costBasis: number; currentValue: number | null }>;
}

export function convertToBaseCurrency(
  amount: number,
  fromCurrency: Currency,
  baseCurrency: Currency,
  fxRate: number
): number {
  throw new Error('not implemented');
}

export function calculateHoldingPnL(
  holding: { quantity: number; avgCost: number; currency: Currency },
  currentPrice: number | null,
  changePct: number | null
): HoldingPnL {
  throw new Error('not implemented');
}

export function calculatePortfolioTotals(
  holdingsPnL: Array<HoldingPnL & { currency: Currency }>,
  baseCurrency: Currency,
  fxRate: number
): PortfolioTotal {
  throw new Error('not implemented');
}
