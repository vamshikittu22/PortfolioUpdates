/**
 * PRICE-01 / PRICE-05 — pure refresh-cycle logic consumed by 03-03's network
 * wrappers and 03-04's orchestration/route. No I/O, no database, no network
 * call in this file — everything here is deterministic and unit-testable
 * with `npm run test:price-pnl`.
 */

/**
 * Parses a raw Yahoo Finance `/v8/finance/chart/{symbol}` response into a
 * price. NEVER throws and NEVER fabricates a value — malformed/empty input
 * always returns null so the caller can show an honest "pending" state
 * instead of a guessed number.
 */
export function parseYahooChartResponse(
  json: unknown
): { price: number; previousClose: number; changePct: number } | null {
  if (typeof json !== 'object' || json === null) return null;

  const chart = (json as Record<string, unknown>).chart;
  if (typeof chart !== 'object' || chart === null) return null;

  const result = (chart as Record<string, unknown>).result;
  if (!Array.isArray(result) || result.length === 0) return null;

  const first = result[0];
  if (typeof first !== 'object' || first === null) return null;

  const indicators = (first as Record<string, unknown>).indicators;
  if (typeof indicators !== 'object' || indicators === null) return null;

  const quote = (indicators as Record<string, unknown>).quote;
  if (!Array.isArray(quote) || quote.length === 0) return null;

  const quote0 = quote[0];
  if (typeof quote0 !== 'object' || quote0 === null) return null;

  const close = (quote0 as Record<string, unknown>).close;
  if (!Array.isArray(close)) return null;

  const validCloses = close.filter(
    (v): v is number => typeof v === 'number' && !Number.isNaN(v)
  );

  if (validCloses.length === 0) return null;

  const price = validCloses[validCloses.length - 1];

  if (validCloses.length === 1) {
    return { price, previousClose: price, changePct: 0 };
  }

  const previousClose = validCloses[validCloses.length - 2];
  const changePct =
    previousClose === 0 ? 0 : ((price - previousClose) / previousClose) * 100;

  return { price, previousClose, changePct };
}

/**
 * Flags a possible corporate action (split/bonus/etc.) on a >40% overnight
 * move. Strict `>`, so exactly 40 is not flagged (documented boundary,
 * matches the roadmap's ">40%" wording literally).
 */
export function detectCorporateAction(changePct: number): boolean {
  return Math.abs(changePct) > 40;
}

/**
 * Dedup guard: returns true when a refresh happened too recently and should
 * be skipped. Never fetched (`lastUpdatedAt === null`) always proceeds —
 * this is the "no fabricated first value" path feeding into 03-04.
 */
export function shouldSkipRefresh(
  lastUpdatedAt: Date | null,
  now: Date,
  minIntervalMs = 60_000
): boolean {
  if (lastUpdatedAt === null) return false;
  return now.getTime() - lastUpdatedAt.getTime() < minIntervalMs;
}

/**
 * Pure predicate 03-04's route handler calls before touching Supabase. An
 * empty/unset `expectedSecret` (e.g. env var missing) ALWAYS returns false,
 * even against an empty/blank auth header — this prevents an unconfigured
 * secret from silently becoming an open endpoint.
 */
export function isAuthorizedRefreshRequest(
  authHeader: string | null,
  expectedSecret: string
): boolean {
  if (!expectedSecret) return false;
  return authHeader === `Bearer ${expectedSecret}`;
}
