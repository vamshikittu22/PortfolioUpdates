/**
 * NEWS-01 — feed registry + URL builders for all three news sources.
 *
 * Pure module: string builders and constants only, zero I/O. The 06-08
 * fetch wrappers (fetch-news.ts) are the only callers of these builders;
 * every URL shape here was live-verified 2026-07-17 (06-RESEARCH-external.md
 * §§1-3) against the real endpoints, not guessed from docs.
 */
import { stripCompanySuffixes } from '@/lib/news/match';

/**
 * Market-wide Indian publisher RSS feeds (not per-ticker) — every item must
 * go through the NEWS-02 instrument matcher before it's attributed to a
 * holding. Both URLs live-verified 2026-07-17 (06-RESEARCH-external.md §3):
 * HTTP 200, valid RSS 2.0, items minutes-to-hours old.
 */
export const INDIAN_PUBLISHER_FEEDS = [
  {
    name: 'ET Markets',
    // Live-verified 2026-07-17: CDATA title/description, real publisher
    // article URLs, RFC-822 pubDate with +0530 offset.
    url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms',
  },
  {
    name: 'LiveMint Markets',
    // Live-verified 2026-07-17: everything CDATA-wrapped, real publisher
    // URLs, RFC-822 pubDate with +0530 offset.
    url: 'https://www.livemint.com/rss/markets',
  },
] as const;

/** Minimum stripped-name length before it's usable in a search query — mirrors match.ts's MIN_NAME_LENGTH. */
const MIN_QUERY_NAME_LENGTH = 3;

/**
 * Builds the quoted `"<company>" OR "<symbol>"` query phrase for an
 * instrument's Google News search (06-RESEARCH-external.md §2: quoting
 * reduces false positives at the source). Falls back to just the quoted
 * symbol when the legal-suffix-stripped display name is empty/too short
 * (e.g. a bare ticker-like display name).
 */
export function buildInstrumentNewsQuery(displayName: string, symbol: string): string {
  const strippedName = stripCompanySuffixes(displayName);
  if (strippedName.length < MIN_QUERY_NAME_LENGTH) {
    return `"${symbol}"`;
  }
  return `"${strippedName}" OR "${symbol}"`;
}

/**
 * Builds a Google News RSS search URL for the given query phrase, pinned to
 * the India locale — live-verified 2026-07-17 (06-RESEARCH-external.md §2):
 * channel `<language>` came back `en-IN`, items were Indian-market stories
 * minutes old.
 */
export function buildGoogleNewsSearchUrl(query: string): string {
  // hl = language, gl = country, ceid = country:language edition id.
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
}

/**
 * Builds a Finnhub company-news URL. North-American symbols ONLY —
 * verbatim from Finnhub's own swagger: "This endpoint is only available for
 * North American companies." Callers must route NSE/BSE instruments to
 * Google News + the Indian publisher feeds instead (06-RESEARCH-external.md
 * §1). `fromDate`/`toDate` are required YYYY-MM-DD strings per the swagger.
 */
export function buildFinnhubCompanyNewsUrl(
  symbol: string,
  fromDate: string,
  toDate: string,
  token: string
): string {
  return `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}&token=${encodeURIComponent(token)}`;
}
