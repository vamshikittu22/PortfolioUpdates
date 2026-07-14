/**
 * PRICE-01 / PRICE-05 / PRICE-06 / PRICE-07 — pure-function correctness proof
 * for the price ingestion + P&L calculation layer.
 *
 * Run:  npm run test:price-pnl   (→ tsx scripts/price-pnl-test.ts)
 *
 * This is a PURE unit test — no database, no network, no env vars. It exercises:
 *   - parseYahooChartResponse: malformed/empty input never fabricates a price.
 *   - detectCorporateAction: the >40% overnight-move heuristic (strict boundary).
 *   - shouldSkipRefresh: 60s dedup guard against thundering-herd refreshes.
 *   - isAuthorizedRefreshRequest: unset-secret always denies, even against an
 *     empty auth header (prevents an unconfigured secret becoming an open endpoint).
 *   - convertToBaseCurrency: identity case for same-currency, sign-preserving FX.
 *   - calculateHoldingPnL: honest 'pending' state vs computed day/total change.
 *   - calculatePortfolioTotals: cross-currency aggregation with native subtotals
 *     visible (the FX effect must not be hidden inside one opaque total).
 *
 * Same dependency-free style as scripts/rls-isolation-test.ts and
 * scripts/derive-holdings-test.ts: node:assert/strict, console.log('PASS') +
 * process.exit(0) on success, throw / non-zero exit on failure.
 * Do NOT weaken these assertions to make the script pass — a failure means the
 * implementation is wrong; fix ingest.ts / pnl-calculator.ts instead.
 */
import assert from 'node:assert/strict';
import {
  parseYahooChartResponse,
  detectCorporateAction,
  shouldSkipRefresh,
  isAuthorizedRefreshRequest,
} from '../src/lib/prices/ingest';
import {
  convertToBaseCurrency,
  calculateHoldingPnL,
  calculatePortfolioTotals,
} from '../src/lib/prices/pnl-calculator';

function approxEqual(actual: number, expected: number, epsilon = 1e-6): void {
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `expected ${actual} to be approximately ${expected}`
  );
}

function yahooChart(close: (number | null)[]): unknown {
  return {
    chart: {
      result: [
        {
          indicators: {
            quote: [{ close }],
          },
        },
      ],
    },
  };
}

// --- Case 1: normal multi-point close array ---
function testParseYahooChartResponseNormal(): void {
  const result = parseYahooChartResponse(yahooChart([100, 102, 105]));
  assert.ok(result, 'Case 1: expected a parsed result');
  approxEqual(result!.price, 105);
  approxEqual(result!.previousClose, 102);
  approxEqual(result!.changePct, ((105 - 102) / 102) * 100);
}

// --- Case 2: missing chart.result → null, never throws ---
function testParseYahooChartResponseMissingResult(): void {
  const result = parseYahooChartResponse({ chart: {} });
  assert.equal(result, null, 'Case 2: missing chart.result must return null');
}

// --- Case 3: all-null close array → null, never a fabricated 0 ---
function testParseYahooChartResponseAllInvalid(): void {
  const result = parseYahooChartResponse(yahooChart([null, null]));
  assert.equal(result, null, 'Case 3: all-invalid close entries must return null');
}

// --- Case 4: single valid point → price=previousClose, changePct=0 ---
function testParseYahooChartResponseSinglePoint(): void {
  const result = parseYahooChartResponse(yahooChart([50]));
  assert.ok(result, 'Case 4: expected a parsed result');
  approxEqual(result!.price, 50);
  approxEqual(result!.previousClose, 50);
  approxEqual(result!.changePct, 0);
}

// --- Case 5: detectCorporateAction boundary (strict >40) ---
function testDetectCorporateAction(): void {
  assert.equal(detectCorporateAction(45), true, 'Case 5a: 45% must be flagged');
  assert.equal(detectCorporateAction(-45), true, 'Case 5b: -45% must be flagged');
  assert.equal(detectCorporateAction(39.9), false, 'Case 5c: 39.9% must not be flagged');
  assert.equal(detectCorporateAction(40), false, 'Case 5d: exactly 40% must not be flagged (strict boundary)');
}

// --- Case 6: shouldSkipRefresh dedup window ---
function testShouldSkipRefresh(): void {
  const now = new Date('2026-07-14T12:00:00Z');
  assert.equal(shouldSkipRefresh(null, now), false, 'Case 6a: never-fetched must not skip');

  const thirtySecondsAgo = new Date(now.getTime() - 30_000);
  assert.equal(shouldSkipRefresh(thirtySecondsAgo, now), true, 'Case 6b: 30s ago must skip (< 60s window)');

  const ninetySecondsAgo = new Date(now.getTime() - 90_000);
  assert.equal(shouldSkipRefresh(ninetySecondsAgo, now), false, 'Case 6c: 90s ago must not skip (>= 60s window)');
}

// --- Case 7: isAuthorizedRefreshRequest ---
function testIsAuthorizedRefreshRequest(): void {
  assert.equal(isAuthorizedRefreshRequest('Bearer abc123', 'abc123'), true, 'Case 7a: matching secret authorizes');
  assert.equal(isAuthorizedRefreshRequest(null, 'abc123'), false, 'Case 7b: null header denies');
  assert.equal(isAuthorizedRefreshRequest('Bearer wrong', 'abc123'), false, 'Case 7c: mismatched secret denies');
  assert.equal(isAuthorizedRefreshRequest('Bearer ', ''), false, 'Case 7d: unset secret must ALWAYS deny');
}

// --- Case 8: convertToBaseCurrency identity + sign preservation ---
function testConvertToBaseCurrency(): void {
  approxEqual(convertToBaseCurrency(1000, 'INR', 'INR', 83.5), 1000);
  approxEqual(convertToBaseCurrency(100, 'USD', 'INR', 83.5), 8350);
  approxEqual(convertToBaseCurrency(-100, 'USD', 'INR', 83.5), -8350);
}

// --- Case 9: calculateHoldingPnL pending state (no fabricated 0) ---
function testCalculateHoldingPnLPending(): void {
  const result = calculateHoldingPnL({ quantity: 10, avgCost: 100, currency: 'INR' }, null, null);
  assert.equal(result.status, 'pending');
  approxEqual(result.costBasis, 1000);
  assert.equal(result.currentValue, null, 'Case 9: currentValue must be null, not fabricated 0');
  assert.equal(result.unrealizedPnL, null);
  assert.equal(result.unrealizedPnLPct, null);
  assert.equal(result.dayChangeAmount, null);
  assert.equal(result.dayChangePct, null);
}

// --- Case 10: calculateHoldingPnL priced state ---
function testCalculateHoldingPnLPriced(): void {
  const result = calculateHoldingPnL({ quantity: 10, avgCost: 100, currency: 'INR' }, 120, 2);
  assert.equal(result.status, 'priced');
  approxEqual(result.costBasis, 1000);
  approxEqual(result.currentValue!, 1200);
  approxEqual(result.unrealizedPnL!, 200);
  approxEqual(result.unrealizedPnLPct!, 20);
  approxEqual(result.dayChangeAmount!, 24);
  approxEqual(result.dayChangePct!, 2);
}

// --- Case 11: calculatePortfolioTotals mixed currency, native subtotals visible ---
function testCalculatePortfolioTotalsMixedCurrency(): void {
  const inrHolding = {
    ...calculateHoldingPnL({ quantity: 10, avgCost: 100, currency: 'INR' }, 120, 2),
    currency: 'INR' as const,
  };
  const usdHolding = {
    ...calculateHoldingPnL({ quantity: 5, avgCost: 20, currency: 'USD' }, 25, 1),
    currency: 'USD' as const,
  };

  const totals = calculatePortfolioTotals([inrHolding, usdHolding], 'INR', 83);

  const expectedTotalCurrentValue = inrHolding.currentValue! + usdHolding.currentValue! * 83;
  approxEqual(totals.totalCurrentValue, expectedTotalCurrentValue);
  approxEqual(totals.nativeSubtotals.USD.currentValue!, usdHolding.currentValue!);
  assert.equal(totals.fxRateUsed, 83);
}

// --- Case 12: calculatePortfolioTotals all-pending → 0/null, no NaN, no throw ---
function testCalculatePortfolioTotalsAllPending(): void {
  const pendingInr = {
    ...calculateHoldingPnL({ quantity: 10, avgCost: 100, currency: 'INR' }, null, null),
    currency: 'INR' as const,
  };
  const pendingUsd = {
    ...calculateHoldingPnL({ quantity: 5, avgCost: 20, currency: 'USD' }, null, null),
    currency: 'USD' as const,
  };

  const totals = calculatePortfolioTotals([pendingInr, pendingUsd], 'INR', 83);

  approxEqual(totals.totalCurrentValue, 0);
  assert.equal(Number.isNaN(totals.totalCurrentValue), false);
  assert.equal(Number.isNaN(totals.totalUnrealizedPnL), false);
  approxEqual(totals.totalCostBasis, 1000 + 100 * 83); // cost basis still sums (converted), even for pending
}

function main(): void {
  testParseYahooChartResponseNormal();
  testParseYahooChartResponseMissingResult();
  testParseYahooChartResponseAllInvalid();
  testParseYahooChartResponseSinglePoint();
  testDetectCorporateAction();
  testShouldSkipRefresh();
  testIsAuthorizedRefreshRequest();
  testConvertToBaseCurrency();
  testCalculateHoldingPnLPending();
  testCalculateHoldingPnLPriced();
  testCalculatePortfolioTotalsMixedCurrency();
  testCalculatePortfolioTotalsAllPending();

  console.log('PASS: price-pnl — all 12 case groups passed (ingest parsing/dedup/auth + P&L calc/FX/aggregation correct)');
  process.exit(0);
}

main();
