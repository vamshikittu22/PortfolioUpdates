/**
 * PRICE-01 / PRICE-05 — pure refresh-cycle logic consumed by 03-03's network
 * wrappers and 03-04's orchestration/route. No I/O, no database, no network
 * call in this file — everything here is deterministic and unit-testable
 * with `npm run test:price-pnl`.
 *
 * STUB (RED phase) — every function below is intentionally unimplemented.
 */

export function parseYahooChartResponse(
  json: unknown
): { price: number; previousClose: number; changePct: number } | null {
  throw new Error('not implemented');
}

export function detectCorporateAction(changePct: number): boolean {
  throw new Error('not implemented');
}

export function shouldSkipRefresh(
  lastUpdatedAt: Date | null,
  now: Date,
  minIntervalMs = 60_000
): boolean {
  throw new Error('not implemented');
}

export function isAuthorizedRefreshRequest(
  authHeader: string | null,
  expectedSecret: string
): boolean {
  throw new Error('not implemented');
}
