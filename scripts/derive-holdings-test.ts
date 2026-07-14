/**
 * PORT-04 / PORT-05 — deriveHoldings() pure-function correctness proof.
 *
 * Run:  npm run test:derive-holdings   (→ tsx scripts/derive-holdings-test.ts)
 *
 * This is a PURE unit test — no database, no network, no env vars. It exercises the
 * weighted-average-cost aggregation algorithm that turns a BUY/SELL/SPLIT/BONUS
 * transaction ledger into per-instrument holdings (quantity, avgCost).
 *
 * Two cases are the hard-to-reverse correctness guarantees the roadmap called out:
 *   - A partial SELL must NOT perturb average cost (only quantity drops).
 *   - A SPLIT/BONUS must NOT produce a false loss (cost basis unchanged, avgCost dilutes).
 *
 * Same dependency-free style as scripts/rls-isolation-test.ts: node:assert/strict,
 * console.log('PASS') + process.exit(0) on success, throw / non-zero exit on failure.
 * Do NOT weaken these assertions to make the script pass — a failure means the
 * aggregation algorithm is wrong; fix derive-holdings.ts instead.
 */
import assert from 'node:assert/strict';
import { deriveHoldings } from '../src/lib/portfolio/derive-holdings';
import type { Transaction } from '../src/lib/types';

let idCounter = 0;
function tx(partial: Partial<Transaction> & Pick<Transaction, 'instrumentId' | 'transactionType' | 'quantity' | 'transactionDate'>): Transaction {
  idCounter += 1;
  return {
    id: `tx_${idCounter}`,
    accountId: 'acct_1',
    price: null,
    ...partial,
  };
}

function approxEqual(actual: number, expected: number, epsilon = 1e-6): void {
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `expected ${actual} to be approximately ${expected}`
  );
}

// --- Case 1: Single BUY 10 @ ₹100 → { quantity: 10, avgCost: 100 } ---
function testSingleBuy(): void {
  const result = deriveHoldings([
    tx({ instrumentId: 'INFY', transactionType: 'BUY', quantity: 10, price: 100, transactionDate: '2026-01-01' }),
  ]);
  const h = result.get('INFY');
  assert.ok(h, 'Case 1: expected INFY holding to exist');
  approxEqual(h!.quantity, 10);
  approxEqual(h!.avgCost, 100);
}

// --- Case 2: BUY 10 @ 100, SELL 4 @ 150 → { quantity: 6, avgCost: 100 } (unchanged by partial sell) ---
function testPartialSellPreservesAvgCost(): void {
  const result = deriveHoldings([
    tx({ instrumentId: 'INFY', transactionType: 'BUY', quantity: 10, price: 100, transactionDate: '2026-01-01' }),
    tx({ instrumentId: 'INFY', transactionType: 'SELL', quantity: 4, price: 150, transactionDate: '2026-01-05' }),
  ]);
  const h = result.get('INFY');
  assert.ok(h, 'Case 2: expected INFY holding to exist');
  approxEqual(h!.quantity, 6);
  approxEqual(h!.avgCost, 100); // PORT-04: partial sell must not perturb avg cost
}

// --- Case 3: BUY 10 @ 100, SPLIT +10 (2-for-1) → { quantity: 20, avgCost: 50 }, cost basis unchanged ---
function testSplitDilutesAvgCostNoFalseLoss(): void {
  const result = deriveHoldings([
    tx({ instrumentId: 'TCS', transactionType: 'BUY', quantity: 10, price: 100, transactionDate: '2026-01-01' }),
    tx({ instrumentId: 'TCS', transactionType: 'SPLIT', quantity: 10, price: null, transactionDate: '2026-02-01' }),
  ]);
  const h = result.get('TCS');
  assert.ok(h, 'Case 3: expected TCS holding to exist');
  approxEqual(h!.quantity, 20);
  approxEqual(h!.avgCost, 50); // cost basis 1000 / 20 shares = 50, no false loss
}

// --- Case 4: BUY 10 @ 100, BONUS +5 → { quantity: 15, avgCost: 66.666... }, cost basis unchanged ---
function testBonusDilutesAvgCost(): void {
  const result = deriveHoldings([
    tx({ instrumentId: 'RELIANCE', transactionType: 'BUY', quantity: 10, price: 100, transactionDate: '2026-01-01' }),
    tx({ instrumentId: 'RELIANCE', transactionType: 'BONUS', quantity: 5, price: null, transactionDate: '2026-02-01' }),
  ]);
  const h = result.get('RELIANCE');
  assert.ok(h, 'Case 4: expected RELIANCE holding to exist');
  approxEqual(h!.quantity, 15);
  approxEqual(h!.avgCost, 1000 / 15);
}

// --- Case 5: BUY 10 @ 100, SELL 10 @ 200 (full exit) → omitted from result, no divide-by-zero throw ---
function testFullExitOmitsHoldingNoDivideByZero(): void {
  const result = deriveHoldings([
    tx({ instrumentId: 'ITC', transactionType: 'BUY', quantity: 10, price: 100, transactionDate: '2026-01-01' }),
    tx({ instrumentId: 'ITC', transactionType: 'SELL', quantity: 10, price: 200, transactionDate: '2026-01-10' }),
  ]);
  assert.ok(!result.has('ITC'), 'Case 5: fully-sold-out instrument must be omitted from result');
}

// --- Case 6: Two different instrument_ids interleaved → each aggregates independently ---
function testMultipleInstrumentsIsolated(): void {
  const result = deriveHoldings([
    tx({ instrumentId: 'INFY', transactionType: 'BUY', quantity: 10, price: 100, transactionDate: '2026-01-01' }),
    tx({ instrumentId: 'TCS', transactionType: 'BUY', quantity: 5, price: 200, transactionDate: '2026-01-02' }),
    tx({ instrumentId: 'INFY', transactionType: 'BUY', quantity: 5, price: 120, transactionDate: '2026-01-03' }),
    tx({ instrumentId: 'TCS', transactionType: 'SELL', quantity: 2, price: 250, transactionDate: '2026-01-04' }),
  ]);
  const infy = result.get('INFY');
  const tcs = result.get('TCS');
  assert.ok(infy, 'Case 6: expected INFY holding to exist');
  assert.ok(tcs, 'Case 6: expected TCS holding to exist');
  approxEqual(infy!.quantity, 15);
  approxEqual(infy!.avgCost, (10 * 100 + 5 * 120) / 15);
  approxEqual(tcs!.quantity, 3);
  approxEqual(tcs!.avgCost, 200); // partial sell does not change avg cost
}

// --- Case 7: Out-of-order input array (SELL before its BUY in array order, later by date) ---
// Proves the function sorts by transactionDate before reducing, not array order.
function testOutOfOrderArraySortsByDate(): void {
  const result = deriveHoldings([
    // SELL appears FIRST in the array, but its transactionDate is LATER than the BUY below.
    tx({ instrumentId: 'HDFCBANK', transactionType: 'SELL', quantity: 4, price: 150, transactionDate: '2026-01-05' }),
    tx({ instrumentId: 'HDFCBANK', transactionType: 'BUY', quantity: 10, price: 100, transactionDate: '2026-01-01' }),
  ]);
  const h = result.get('HDFCBANK');
  assert.ok(h, 'Case 7: expected HDFCBANK holding to exist');
  approxEqual(h!.quantity, 6);
  approxEqual(h!.avgCost, 100); // if array order were used instead of date order, this would throw/be wrong
}

function main(): void {
  testSingleBuy();
  testPartialSellPreservesAvgCost();
  testSplitDilutesAvgCostNoFalseLoss();
  testBonusDilutesAvgCost();
  testFullExitOmitsHoldingNoDivideByZero();
  testMultipleInstrumentsIsolated();
  testOutOfOrderArraySortsByDate();

  console.log('PASS: deriveHoldings — all 7 assertions passed (BUY/SELL/SPLIT/BONUS aggregation correct)');
  process.exit(0);
}

main();
