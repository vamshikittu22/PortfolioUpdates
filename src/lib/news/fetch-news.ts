/**
 * NEWS-01 — raw-fetch wrappers around all three news sources (Google News
 * RSS search, generic publisher RSS, Finnhub company-news).
 *
 * Same separation-of-concerns as src/lib/prices/fetch-prices.ts and
 * src/lib/telegram/api.ts: this file owns ONLY "how do we get the bytes and
 * handle the network failing." All "what does this response mean" logic is
 * delegated to the pure parsers in src/lib/news/parse-feeds.ts
 * (parseGoogleNewsRss / parseRssFeed / parseFinnhubNews) — never
 * reimplemented here. Every fetch carries a 15s AbortSignal.timeout so a
 * hung feed can never wedge the pipeline. Never throws for a single source;
 * every failure mode (non-2xx, timeout, parse error, unconfigured key)
 * resolves to an honest `{ items: null, fetchError: string }` result.
 */
import {
  buildFinnhubCompanyNewsUrl,
  buildGoogleNewsSearchUrl,
} from '@/lib/news/sources';
import { parseFinnhubNews, parseGoogleNewsRss, parseRssFeed } from '@/lib/news/parse-feeds';
import type { RawNewsItem } from '@/lib/news/types';

export type NewsFetchResult =
  | { items: RawNewsItem[]; fetchError: null }
  | { items: null; fetchError: string };

// Same browser-like User-Agent used by src/lib/prices/fetch-prices.ts:25 —
// some publishers 403 bot-looking User-Agents.
const NEWS_FETCH_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const FETCH_TIMEOUT_MS = 15000;

/**
 * Fetches Google News' RSS search feed for the given query phrase (build it
 * with buildInstrumentNewsQuery — quoted "company" OR "symbol"). India
 * locale is baked into buildGoogleNewsSearchUrl.
 */
export async function fetchGoogleNews(query: string): Promise<NewsFetchResult> {
  try {
    const res = await fetch(buildGoogleNewsSearchUrl(query), {
      headers: { 'User-Agent': NEWS_FETCH_USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      return { items: null, fetchError: `Google News HTTP ${res.status}` };
    }

    const xml = await res.text();
    const parsed = parseGoogleNewsRss(xml);

    if (parsed.error !== null) {
      return { items: null, fetchError: parsed.error };
    }

    return { items: parsed.items, fetchError: null };
  } catch (err) {
    return { items: null, fetchError: err instanceof Error ? err.message : 'Unknown fetch error' };
  }
}

/**
 * Fetches one of the Indian publisher RSS feeds (INDIAN_PUBLISHER_FEEDS
 * entries from sources.ts) — a market-wide feed, not per-ticker.
 */
export async function fetchPublisherFeed(feed: {
  name: string;
  url: string;
}): Promise<NewsFetchResult> {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': NEWS_FETCH_USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      return { items: null, fetchError: `${feed.name} HTTP ${res.status}` };
    }

    const xml = await res.text();
    const parsed = parseRssFeed(xml, feed.name);

    if (parsed.error !== null) {
      return { items: null, fetchError: parsed.error };
    }

    return { items: parsed.items, fetchError: null };
  } catch (err) {
    return { items: null, fetchError: err instanceof Error ? err.message : 'Unknown fetch error' };
  }
}

/** Recognizes the .env.local labeled-placeholder convention (e.g. 'your-key-here'), same as telegram/api.ts's unset-token treatment. */
function isPlaceholderToken(token: string): boolean {
  return token.trim().length === 0 || token.toLowerCase().includes('your-');
}

/**
 * Fetches Finnhub company-news for a North-American symbol. Key guard
 * FIRST (telegram/api.ts:30-34 precedent): an unset or placeholder-looking
 * FINNHUB_API_KEY never reaches the network, returning an honest
 * "not configured" result instead. Live use (real key) is deferred to
 * 06-10 — this function is fully coded and correct now, but its live path
 * is key-gated.
 */
export async function fetchFinnhubCompanyNews(
  symbol: string,
  fromDate: string,
  toDate: string
): Promise<NewsFetchResult> {
  const token = process.env.FINNHUB_API_KEY;

  if (!token || isPlaceholderToken(token)) {
    return { items: null, fetchError: 'FINNHUB_API_KEY not configured' };
  }

  try {
    const res = await fetch(buildFinnhubCompanyNewsUrl(symbol, fromDate, toDate, token), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      // Finnhub's live-probed 401 bodies are clean JSON ({"error":"..."})
      // — read the body text so that message reaches the caller, not just
      // the bare status code.
      const bodyText = await res.text();
      return {
        items: null,
        fetchError: `Finnhub HTTP ${res.status}: ${bodyText.slice(0, 300)}`,
      };
    }

    const json = await res.json();
    const parsed = parseFinnhubNews(json, 'Finnhub');

    if (parsed.error !== null) {
      return { items: null, fetchError: parsed.error };
    }

    return { items: parsed.items, fetchError: null };
  } catch (err) {
    return { items: null, fetchError: err instanceof Error ? err.message : 'Unknown fetch error' };
  }
}
