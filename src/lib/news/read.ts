/**
 * NEWS-03 — read-only data access for the user-facing `/news` feed. Mirrors
 * the read-only, cookie-bound, never-fabricate style of
 * `src/lib/alerts/read.ts` / `src/lib/supabase/portfolio.ts`: accepts an
 * already-constructed cookie-bound `SupabaseClient` (RLS-scoped) — NEVER the
 * admin client. `news_items` / `news_item_instruments` carry authenticated
 * SELECT policies (06-01) precisely so this read can stay RLS-clean.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { NewsItem, Sentiment } from '@/lib/types';
import { getHoldings, getWatchlist } from '@/lib/supabase/portfolio';

interface NewsItemRow {
  id: string;
  headline: string;
  summary: string | null;
  url: string;
  source: string | null;
  published_at: string;
  sentiment_label: Sentiment | null;
}

interface NewsItemInstrumentRow {
  instrument_id: string;
  news_items: NewsItemRow | NewsItemRow[] | null;
}

/**
 * Supabase nests a to-one FK relation as a single object, but depending on
 * client/type inference it can surface as a one-element array — normalize
 * both shapes to a single row (or null). Same pattern as
 * `src/lib/alerts/sweep.ts`'s `firstOf` (sweep.ts:57-60).
 */
function firstOf<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * getNewsFeed — the caller's portfolio-filtered (held ∪ watched) news feed,
 * newest first, capped at 100 items. Honest degradation throughout:
 *   - a null `summary` renders as an empty string, never fabricated text
 *     (NEWS-05 headline-only rendering).
 *   - a null `sentiment_label` maps to 'Neutral' — "not analyzed / no
 *     directional signal", the only honest value the required Sentiment enum
 *     admits. NEVER map null to Bullish/Bearish/Mixed.
 *   - a query error (e.g. the 06-01 tables not yet pushed live) degrades to
 *     an empty feed with a console.warn, rather than crashing the page.
 */
export async function getNewsFeed(supabase: SupabaseClient, accountId: string): Promise<NewsItem[]> {
  const [holdings, watchlist] = await Promise.all([
    getHoldings(supabase, accountId),
    getWatchlist(supabase, accountId),
  ]);

  const heldIds = new Set(holdings.map((h) => h.instrumentId));
  const watchedIds = new Set(watchlist.map((w) => w.instrumentId));
  if (heldIds.size === 0 && watchedIds.size === 0) return []; // honest empty portfolio => empty feed

  const tickerById = new Map<string, string>();
  for (const h of holdings) tickerById.set(h.instrumentId, h.ticker);
  for (const w of watchlist) tickerById.set(w.instrumentId, w.ticker);

  const instrumentIds = Array.from(new Set([...heldIds, ...watchedIds]));

  const { data, error } = await supabase
    .from('news_item_instruments')
    .select(
      `instrument_id,
      news_items ( id, headline, summary, url, source, published_at, sentiment_label )`
    )
    .in('instrument_id', instrumentIds);

  if (error) {
    // Honest degradation: a missing/un-migrated table (06-01 not yet pushed
    // live) or any other read failure must never crash the page — an empty
    // feed with a logged warning matches the existing honest-empty-state UI.
    console.warn(`getNewsFeed: failed to load news_item_instruments: ${error.message}`);
    return [];
  }

  const rows = (data ?? []) as unknown as NewsItemInstrumentRow[];

  // Group rows by news item id — one article matching several portfolio
  // instruments appears ONCE, with all matched instrument ids collected.
  interface Grouped {
    article: NewsItemRow;
    matchedInstrumentIds: Set<string>;
  }
  const byArticleId = new Map<string, Grouped>();
  for (const row of rows) {
    const article = firstOf(row.news_items);
    if (!article) continue; // news_item_id is NOT NULL FK; guard is type-safety only
    const existing = byArticleId.get(article.id);
    if (existing) {
      existing.matchedInstrumentIds.add(row.instrument_id);
    } else {
      byArticleId.set(article.id, {
        article,
        matchedInstrumentIds: new Set([row.instrument_id]),
      });
    }
  }

  const items: NewsItem[] = [];
  for (const { article, matchedInstrumentIds } of byArticleId.values()) {
    const tickers = Array.from(matchedInstrumentIds)
      .map((id) => tickerById.get(id))
      .filter((t): t is string => Boolean(t)); // skip ids without a portfolio ticker

    // 'Macro' remains honestly unreachable — no macro source is in scope this
    // phase (all matched articles are tied to a specific held/watched
    // instrument by construction of the query above).
    const category: NewsItem['category'] = Array.from(matchedInstrumentIds).some((id) => heldIds.has(id))
      ? 'Holdings'
      : 'Watchlist';

    items.push({
      id: article.id,
      title: article.headline,
      url: article.url,
      source: article.source ?? 'Unknown',
      publishedAt: article.published_at,
      // null means "not analyzed / no directional signal" — 'Neutral' is the
      // only honest value the Sentiment enum admits for that case.
      sentiment: article.sentiment_label ?? 'Neutral',
      // headline-only degradation (NEWS-05): empty string renders as a blank
      // line, never fabricated text.
      summary: article.summary ?? '',
      tickers,
      category,
    });
  }

  items.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  return items.slice(0, 100);
}
