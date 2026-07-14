/**
 * PRICE-06 / PRICE-07 — pure P&L calculation logic consumed by 03-05's UI.
 * No I/O, no database. Reuses nothing from deriveHoldings (that stays in
 * src/lib/portfolio/derive-holdings.ts) — this module only turns
 * { quantity, avgCost } + a current price into P&L numbers.
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

/**
 * Converts a native-currency amount to the account's base currency.
 * Identity case (same currency) returns the amount unchanged, ignoring
 * fxRate entirely — never silently multiply a same-currency amount. Sign is
 * preserved (a loss converts to a loss, never abs()'d). `fxRate` is assumed
 * to already be oriented fromCurrency -> baseCurrency by the caller; this
 * function does no lookup itself, it stays pure.
 */
export function convertToBaseCurrency(
  amount: number,
  fromCurrency: Currency,
  baseCurrency: Currency,
  fxRate: number
): number {
  if (fromCurrency === baseCurrency) return amount;
  return amount * fxRate;
}

/**
 * Computes per-holding P&L. `currentPrice === null` returns an honest
 * 'pending' state (PRICE-04) — never substitutes 0 for currentValue /
 * unrealizedPnL. Divide-by-zero on a zero-cost-basis holding is guarded.
 */
export function calculateHoldingPnL(
  holding: { quantity: number; avgCost: number; currency: Currency },
  currentPrice: number | null,
  changePct: number | null
): HoldingPnL {
  const costBasis = holding.quantity * holding.avgCost;

  if (currentPrice === null) {
    return {
      status: 'pending',
      costBasis,
      currentValue: null,
      unrealizedPnL: null,
      unrealizedPnLPct: null,
      dayChangeAmount: null,
      dayChangePct: null,
    };
  }

  const currentValue = holding.quantity * currentPrice;
  const unrealizedPnL = currentValue - costBasis;
  const unrealizedPnLPct = costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0;
  const effectiveChangePct = changePct ?? 0;
  const dayChangeAmount = currentValue * (effectiveChangePct / 100);

  return {
    status: 'priced',
    costBasis,
    currentValue,
    unrealizedPnL,
    unrealizedPnLPct,
    dayChangeAmount,
    dayChangePct: effectiveChangePct,
  };
}

/**
 * Aggregates per-holding P&L into portfolio totals, converting each
 * non-base-currency holding via convertToBaseCurrency BEFORE summing. Also
 * returns nativeSubtotals so the FX effect is VISIBLE (PRICE-06) rather than
 * hidden inside one opaque total. A portfolio with zero holdings, or all
 * holdings pending, never throws or produces NaN.
 */
export function calculatePortfolioTotals(
  holdingsPnL: Array<HoldingPnL & { currency: Currency }>,
  baseCurrency: Currency,
  fxRate: number
): PortfolioTotal {
  const nativeSubtotals: Record<Currency, { costBasis: number; currentValue: number | null }> = {
    INR: { costBasis: 0, currentValue: null },
    USD: { costBasis: 0, currentValue: null },
  };

  let totalCostBasis = 0;
  let totalCurrentValue = 0;
  let totalUnrealizedPnL = 0;
  let totalDayChange = 0;

  for (const h of holdingsPnL) {
    // Native subtotals — accumulate cost basis unconditionally; only
    // accumulate currentValue for priced holdings (starts at null).
    nativeSubtotals[h.currency].costBasis += h.costBasis;
    if (h.status === 'priced' && h.currentValue !== null) {
      nativeSubtotals[h.currency].currentValue =
        (nativeSubtotals[h.currency].currentValue ?? 0) + h.currentValue;
    }

    // Base-currency totals — costBasis sums for every holding (pending
    // holdings contribute their cost basis but no current value).
    totalCostBasis += convertToBaseCurrency(h.costBasis, h.currency, baseCurrency, fxRate);

    if (h.status === 'priced') {
      totalCurrentValue += convertToBaseCurrency(h.currentValue ?? 0, h.currency, baseCurrency, fxRate);
      totalUnrealizedPnL += convertToBaseCurrency(h.unrealizedPnL ?? 0, h.currency, baseCurrency, fxRate);
      totalDayChange += convertToBaseCurrency(h.dayChangeAmount ?? 0, h.currency, baseCurrency, fxRate);
    }
  }

  return {
    totalCostBasis,
    totalCurrentValue,
    totalUnrealizedPnL,
    totalDayChange,
    fxRateUsed: fxRate,
    nativeSubtotals,
  };
}
