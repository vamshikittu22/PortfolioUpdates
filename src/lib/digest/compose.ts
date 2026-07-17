/**
 * DGST-01 — the pure heart of the daily digest: IST date bucketing + dedupe
 * key, honest top-mover selection, and (added in Task 2) the HTML digest
 * message builder. Zero I/O — no Supabase, no fetch, no env — mirrors
 * `src/lib/alerts/evaluate.ts`'s shape. Proven by
 * `scripts/digest-compose-test.ts` under node:assert/strict.
 *
 * See 07-RESEARCH.md Q3 (HTML message composition + escaping) and Q5
 * (IST date bucketing for the once-a-day dedupe key) for the design
 * rationale behind the choices below.
 */
import type { DigestHoldingInput } from './types';

const IST_OFFSET_MS = 5.5 * 3600 * 1000;

/**
 * Returns the `YYYY-MM-DD` calendar date in IST (fixed UTC+5:30, India has
 * no DST) for the given instant, via fixed-offset arithmetic only — no
 * `Intl`/timezone-database dependency, so this is fully deterministic across
 * environments and Node builds.
 *
 * Rollover happens at exactly `18:30:00Z` (IST midnight): a UTC instant at
 * `18:29:59Z` is still `23:59:59` IST on the SAME calendar day; `18:30:00Z`
 * is `00:00:00` IST on the NEXT calendar day (year boundary included).
 */
export function istDateKey(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * The once-per-day idempotency bucket key backing the `notifications_outbox`
 * partial unique index for `kind = 'daily_digest'` — shape matches
 * `computeAlertDedupeKey`'s `price_alert:{id}:{bucket}` precedent
 * (`src/lib/alerts/evaluate.ts`): `daily_digest:{userId}:{istDate}`.
 * Two calls with different UTC instants that fall on the SAME IST calendar
 * day return the identical key, which is exactly what makes a re-run inside
 * the same day collide with the unique index and get suppressed rather than
 * duplicated.
 */
export function computeDigestDedupeKey(userId: string, now: Date): string {
  return `daily_digest:${userId}:${istDateKey(now)}`;
}

/**
 * Returns at most `n` holdings sorted by absolute `dayChangePct` descending
 * (sign preserved in the output). Considers ONLY `status === 'priced'`
 * holdings with a non-null `dayChangePct` — pending/failed-price holdings
 * are excluded honestly, never shown as a fabricated 0% mover.
 */
export function selectTopMovers(
  holdings: DigestHoldingInput[],
  n = 3
): Array<{ ticker: string; dayChangePct: number }> {
  return holdings
    .filter(
      (h): h is DigestHoldingInput & { dayChangePct: number } =>
        h.status === 'priced' && h.dayChangePct !== null
    )
    .sort((a, b) => Math.abs(b.dayChangePct) - Math.abs(a.dayChangePct))
    .slice(0, n)
    .map((h) => ({ ticker: h.ticker, dayChangePct: h.dayChangePct }));
}
