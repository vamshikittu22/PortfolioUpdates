import type { Transaction } from '@/lib/types';

/**
 * deriveHoldings — turns a flat BUY/SELL/SPLIT/BONUS transaction ledger into
 * per-instrument holdings (quantity, avgCost) using a running weighted-average-cost
 * method. Pure function: no I/O, no database, deterministic for a given input.
 *
 * Algorithm (per instrument, transactions processed in chronological order):
 *   - Start quantity = 0, costBasis = 0.
 *   - BUY:   costBasis += qty * price;  quantity += qty.
 *   - SELL:  avgCost = quantity > 0 ? costBasis / quantity : 0;
 *            costBasis -= qty * avgCost; quantity -= qty (clamped at 0).
 *            (Selling does NOT change avgCost — only quantity and cost basis drop
 *            proportionally. This is the PORT-04 partial-sell correctness case.)
 *   - SPLIT / BONUS: quantity += qty; costBasis UNCHANGED (no cash flow) — this is
 *     what makes avgCost dilute correctly instead of the UI showing a false loss.
 *   - Final avgCost = quantity > 0 ? costBasis / quantity : 0.
 *
 * Instruments whose derived quantity is 0 (fully sold out) are OMITTED from the
 * result — a zero-quantity row is not a "holding" — rather than included with
 * quantity: 0. This choice is documented here per plan instruction.
 */
export function deriveHoldings(
  transactions: Transaction[]
): Map<string, { quantity: number; avgCost: number }> {
  const byInstrument = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const list = byInstrument.get(t.instrumentId);
    if (list) {
      list.push(t);
    } else {
      byInstrument.set(t.instrumentId, [t]);
    }
  }

  const result = new Map<string, { quantity: number; avgCost: number }>();

  for (const [instrumentId, txns] of byInstrument) {
    const sorted = sortChronologically(txns);
    const { quantity, avgCost } = reduceInstrumentTransactions(sorted);

    // Omit zero-quantity (fully sold out) instruments — not a "holding".
    if (quantity > 0) {
      result.set(instrumentId, { quantity, avgCost });
    }
  }

  return result;
}

/** Sort by transactionDate ascending, then created_at (if present) as a tiebreaker. */
function sortChronologically(txns: Transaction[]): Transaction[] {
  return [...txns].sort((a, b) => {
    const dateDiff = new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime();
    if (dateDiff !== 0) return dateDiff;

    const aCreated = (a as { createdAt?: string }).createdAt;
    const bCreated = (b as { createdAt?: string }).createdAt;
    if (aCreated && bCreated) {
      return new Date(aCreated).getTime() - new Date(bCreated).getTime();
    }
    return 0;
  });
}

/** Reduce one instrument's chronologically-sorted transactions to { quantity, avgCost }. */
function reduceInstrumentTransactions(sorted: Transaction[]): { quantity: number; avgCost: number } {
  let quantity = 0;
  let costBasis = 0;

  for (const t of sorted) {
    switch (t.transactionType) {
      case 'BUY': {
        const price = t.price ?? 0;
        costBasis += t.quantity * price;
        quantity += t.quantity;
        break;
      }
      case 'SELL': {
        const avgCost = quantity > 0 ? costBasis / quantity : 0;
        costBasis -= t.quantity * avgCost;
        quantity = Math.max(0, quantity - t.quantity);
        break;
      }
      case 'SPLIT':
      case 'BONUS': {
        // No cash flow — cost basis unchanged, quantity increases, avgCost dilutes.
        quantity += t.quantity;
        break;
      }
    }
  }

  const avgCost = quantity > 0 ? costBasis / quantity : 0;
  return { quantity, avgCost };
}
