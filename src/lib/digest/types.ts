/**
 * DGST-01 — declaration-only shared vocabulary for the digest composition
 * layer (`src/lib/digest/compose.ts`). Mirrors the style of
 * `src/lib/notifications/types.ts` / `src/lib/alerts/types.ts`: no logic
 * here, only shapes consumed/produced by pure functions.
 */

/** A single holding's inputs to top-mover selection — honest pending/priced status. */
export type DigestHoldingInput = {
  ticker: string;
  status: 'pending' | 'priced';
  dayChangePct: number | null;
};

/** A single portfolio-relevant news item to render in the digest. */
export type DigestNewsItem = {
  headline: string;
  summary: string | null;
  url: string;
};

/**
 * Everything `buildDailyDigestMessage` needs to render one HTML-parse-mode
 * Telegram message. Every field is already resolved/decided by the caller
 * (07-03's orchestration) — this module never fetches or infers anything.
 */
export type DigestMessageInput = {
  istDate: string; // from istDateKey
  baseCurrency: string; // 'INR' | 'USD' display string
  totalCurrentValue: number | null; // null == nothing priced yet (honest pending)
  totalDayChange: number | null;
  hasHoldings: boolean;
  fxUnavailable: boolean;
  fxExcludedCurrency: string | null; // e.g. 'USD' when fxUnavailable excluded it
  topMovers: Array<{ ticker: string; dayChangePct: number }>;
  news: DigestNewsItem[];
  newsDegraded: boolean;
};
