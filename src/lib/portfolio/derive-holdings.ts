// RED stub — intentionally incorrect. Implemented in the GREEN step of this TDD plan.
import type { Transaction } from '@/lib/types';

export function deriveHoldings(
  _transactions: Transaction[]
): Map<string, { quantity: number; avgCost: number }> {
  return new Map();
}
