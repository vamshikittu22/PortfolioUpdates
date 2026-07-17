/**
 * DGST-01 — the pure heart of the daily digest: IST date bucketing + dedupe
 * key, honest top-mover selection, and the HTML digest message builder.
 * Zero I/O — no Supabase, no fetch, no env — mirrors
 * `src/lib/alerts/evaluate.ts`'s shape. Proven by
 * `scripts/digest-compose-test.ts` under node:assert/strict.
 *
 * See 07-RESEARCH.md Q3 (HTML message composition + escaping) and Q5
 * (IST date bucketing for the once-a-day dedupe key) for the design
 * rationale behind the choices below.
 */
import { escapeHtml } from '@/lib/telegram/build-message';
import type { DigestHoldingInput, DigestMessageInput } from './types';

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

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

function signedPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function currencyFormatter(baseCurrency: string): Intl.NumberFormat {
  // Same 'en-IN'/'en-US' locale precedent as the dashboard's currencyFmt —
  // deterministic given fixed inputs, no live locale detection.
  return new Intl.NumberFormat(baseCurrency === 'INR' ? 'en-IN' : 'en-US', {
    maximumFractionDigits: 0,
  });
}

/**
 * Composes a single HTML-parse-mode Telegram digest message (DGST-01):
 * total value, signed day P&L, top movers, and the day's summarized news —
 * with every externally-sourced string (ticker, headline, summary) passed
 * through `escapeHtml`, and honest empty/degraded states throughout (never
 * a fabricated total, never a fabricated 0% mover).
 *
 * Truncation is DELIBERATELY different from `buildPriceAlertMessage`'s naive
 * `slice(0, 4096)` (`src/lib/telegram/build-message.ts`), which is only safe
 * for that function's single-line alert message. A digest can contain dozens
 * of news items each wrapped in `<b>...</b>`; a blind slice can land inside
 * an HTML tag or entity, and Telegram's `sendMessage` with `parse_mode:
 * 'HTML'` then rejects the WHOLE message with 400 "can't parse entities"
 * (07-RESEARCH.md Pitfall 3) — silently losing the totals/movers too, not
 * just the news. Instead: build the non-news skeleton (header, snapshot,
 * fx note, movers) first, then append news lines one WHOLE line at a time,
 * stopping at the first line that would not fit. Truncation therefore only
 * ever drops whole news items, never cuts mid-tag, and never touches the
 * portfolio snapshot. The trailing `slice(0, 4096)` is kept only as a
 * defensive belt — the loop above already guarantees it is a no-op.
 */
export function buildDailyDigestMessage(input: DigestMessageInput): string {
  const {
    istDate,
    baseCurrency,
    totalCurrentValue,
    totalDayChange,
    hasHoldings,
    fxUnavailable,
    fxExcludedCurrency,
    topMovers,
    news,
    newsDegraded,
  } = input;

  const lines: string[] = [`<b>Daily Digest — ${istDate}</b>`];

  if (!hasHoldings) {
    lines.push('No holdings yet — add a holding to see your portfolio here.');
  } else if (totalCurrentValue === null) {
    lines.push('Portfolio value: prices pending — check back after the next refresh.');
  } else {
    const fmt = currencyFormatter(baseCurrency);
    lines.push(`Portfolio: <code>${fmt.format(totalCurrentValue)} ${escapeHtml(baseCurrency)}</code>`);
    if (totalDayChange !== null) {
      const sign = totalDayChange >= 0 ? '+' : '';
      lines.push(`Day P&amp;L: ${sign}${fmt.format(totalDayChange)} ${escapeHtml(baseCurrency)}`);
    }
  }

  if (fxUnavailable && fxExcludedCurrency) {
    lines.push(
      `Note: FX rate unavailable — ${escapeHtml(fxExcludedCurrency)} holdings excluded from the totals above.`
    );
  }

  if (topMovers.length > 0) {
    lines.push('');
    lines.push('<b>Top movers</b>');
    for (const mover of topMovers) {
      lines.push(`${escapeHtml(mover.ticker)} ${signedPercent(mover.dayChangePct)}`);
    }
  }

  const skeleton = lines.join('\n');

  let message: string;
  if (newsDegraded || news.length === 0) {
    message = `${skeleton}\n\n<b>News</b>\nNo summarized portfolio news today.`;
  } else {
    let current = `${skeleton}\n\n<b>News</b>`;
    for (const item of news) {
      const line = `\n• <b>${escapeHtml(item.headline)}</b> — ${escapeHtml(item.summary ?? '')}`;
      if (current.length + line.length > TELEGRAM_MAX_MESSAGE_LENGTH) break;
      current += line;
    }
    message = current;
  }

  // Defensive belt only — the news loop above already guarantees this never
  // actually truncates (proven by scripts/digest-compose-test.ts).
  return message.slice(0, TELEGRAM_MAX_MESSAGE_LENGTH);
}
