/**
 * ALRT-04 — HTML parse_mode message builder + permanent dedupe key for news
 * alerts. Deliberately HTML mode ONLY (never Telegram's legacy V2 markdown
 * mode) — same rationale as `@/lib/telegram/build-message` (05-RESEARCH-
 * telegram-api.md Q4 / Pitfall 1). Pure, no I/O.
 *
 * `escapeHtml` is imported from `@/lib/telegram/build-message`, never
 * re-implemented here — one escaping implementation for the whole app.
 */
import { createHash } from 'node:crypto';
import { escapeHtml } from '@/lib/telegram/build-message';

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

export interface NewsAlertMessageInput {
  displaySymbols: string[];
  headline: string;
  whyItMatters: string | null;
  source: string;
  url: string;
}

/**
 * Composes an HTML-parse-mode news-alert message and truncates to
 * Telegram's 4096-char sendMessage limit:
 *   📰 <b>{symbols joined ', '}</b>: {headline}
 *   {whyItMatters}          <- only present when non-empty (no orphan blank line)
 *   <a href="{url}">{source}</a>
 *
 * News headlines/sources/urls are external, attacker-adjacent text (unlike
 * `buildPriceAlertMessage`'s numeric/known-shape fields) — EVERY interpolated
 * value is escaped: symbols, headline, whyItMatters, source.
 *
 * The href value is additionally attribute-hardened: escapeHtml alone is
 * sufficient for Telegram's HTML parser (it does not require quote
 * escaping), but a literal `"` inside the URL would still prematurely close
 * the `href="..."` attribute value textually, so any `"` characters are
 * stripped from the url BEFORE interpolation — belt-and-suspenders for an
 * attribute context, not just a text-node context.
 */
export function buildNewsAlertMessage(input: NewsAlertMessageInput): string {
  const { displaySymbols, headline, whyItMatters, source, url } = input;

  const symbolsText = displaySymbols.map(escapeHtml).join(', ');
  const headerLine = `\u{1F4F0} <b>${symbolsText}</b>: ${escapeHtml(headline)}`;

  const safeUrl = escapeHtml(url).replace(/"/g, '');
  const anchorLine = `<a href="${safeUrl}">${escapeHtml(source)}</a>`;

  const lines = [headerLine];
  if (whyItMatters) {
    lines.push(escapeHtml(whyItMatters));
  }
  lines.push(anchorLine);

  return lines.join('\n').slice(0, TELEGRAM_MAX_MESSAGE_LENGTH);
}

/**
 * ALRT-04 permanent idempotency key — the EXACT shape prescribed at
 * src/lib/alerts/evaluate.ts:102: `news_alert:{userId}:{urlHash}`.
 *
 * Deliberately NOT time-bucketed (unlike `computeAlertDedupeKey`'s cooldown-
 * window bucket): a price crossing can legitimately re-fire after a cooldown
 * elapses, but a single news article is significant to a user exactly ONCE —
 * there is no "cooldown window" concept for news, so the key must stay
 * identical FOREVER for the same (user, article) pair. This makes every
 * re-sweep of the same article for the same user collide with the
 * `uniq_notifications_outbox_dedupe` partial unique index and get silently
 * absorbed, with zero schema state (no `notified_at` column, no stamping
 * step) — the entire idempotence contract lives in this one hash.
 */
export function computeNewsAlertDedupeKey(userId: string, canonicalUrl: string): string {
  const urlHash = createHash('sha256').update(canonicalUrl).digest('hex');
  return `news_alert:${userId}:${urlHash}`;
}
