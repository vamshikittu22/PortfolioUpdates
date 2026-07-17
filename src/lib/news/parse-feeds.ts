/**
 * NEWS-01 — pure feed-interpretation layer for all three news sources
 * (Google News RSS, generic publisher RSS, Finnhub company-news JSON).
 *
 * Same separation-of-concerns as src/lib/prices/fetch-prices.ts: this file
 * owns ONLY "what does this response mean" — turning raw XML/JSON bytes
 * into the normalized `RawNewsItem` shape. It never fetches anything and
 * never throws; the 06-08 fetch wrappers hand this file bytes/JSON and get
 * back an honest `{ items, error }` result. Zero I/O, zero Date.now(),
 * zero randomness.
 *
 * 06-RESEARCH-external.md pitfalls pinned here:
 *  - §2/§5: a single-item RSS channel parses to an OBJECT, not an array,
 *    unless fast-xml-parser's `isArray` forces it — pinned by TDD.
 *  - §2: Google News' <source> element carries the publisher name as its
 *    text node, which fast-xml-parser represents as a plain string when the
 *    element has no attributes, or as `{ '#text': ..., '@_url': ... }` when
 *    it does (Google's live feed always includes the url attribute) —
 *    `extractText` handles both forms.
 *  - §4: Finnhub `datetime` is unix SECONDS, not milliseconds.
 *  - §1: a Finnhub auth failure returns a clean JSON `{ "error": "..." }`
 *    body (not an array) — surfaced as an honest error, not silently
 *    treated as zero items.
 */
import { XMLParser } from 'fast-xml-parser';
import type { RawNewsItem } from '@/lib/news/types';

export type ParseResult = { items: RawNewsItem[]; error: string | null };

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  isArray: (name) => name === 'item',
});

/**
 * Parses an RSS 2.0 document and returns its <channel> node, or an honest
 * error if the document isn't parseable XML or doesn't contain an
 * <rss><channel> element. fast-xml-parser does not throw on non-XML input
 * (e.g. "not xml at all" parses to `{}`) — the missing-channel check is
 * what actually catches malformed feeds.
 */
function parseChannel(xml: string): { channel: Record<string, unknown> } | { error: string } {
  let doc: unknown;
  try {
    doc = xmlParser.parse(xml);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to parse XML document' };
  }

  const rss = isRecord(doc) ? doc['rss'] : undefined;
  const channel = isRecord(rss) ? rss['channel'] : undefined;

  if (!isRecord(channel)) {
    return { error: 'Invalid RSS feed: missing <rss><channel> element' };
  }

  return { channel };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Reads a text value out of a fast-xml-parser node, which may be a plain
 * string, or (when the element carries attributes, e.g. <source url="...">)
 * an object with the text at `#text`. Returns null for anything else
 * (missing, empty after trim, or an unexpected shape) — callers treat null
 * as "absent", never fabricate a value.
 */
function extractText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (isRecord(value) && '#text' in value) {
    return extractText(value['#text']);
  }
  return null;
}

/** Converts an RFC-822 pubDate string to ISO-8601 UTC, or null if invalid. */
function pubDateToIso(pubDate: unknown): string | null {
  const text = extractText(pubDate);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/**
 * Normalizes fast-xml-parser's `channel.item` into an array of item
 * objects. With `isArray: (name) => name === 'item'`, a channel with at
 * least one <item> is always an array already; this only exists to
 * honestly handle the zero-items case (property absent) without throwing.
 */
function asItemRecords(rawItem: unknown): Record<string, unknown>[] {
  if (rawItem === undefined || rawItem === null) return [];
  const arr = Array.isArray(rawItem) ? rawItem : [rawItem];
  return arr.filter(isRecord);
}

/**
 * Parses a Google News RSS search feed
 * (`https://news.google.com/rss/search?...`). Title keeps its raw
 * " - Publisher" suffix — stripping/normalizing that suffix for dedup is
 * dedupe.ts's job, not the parser's. `<description>` is HTML anchor soup
 * with no clean abstract, so `abstract` is always null here.
 */
export function parseGoogleNewsRss(xml: string): ParseResult {
  const parsed = parseChannel(xml);
  if ('error' in parsed) return { items: [], error: parsed.error };

  const items: RawNewsItem[] = [];

  for (const raw of asItemRecords(parsed.channel['item'])) {
    const title = extractText(raw['title']);
    const url = extractText(raw['link']);
    if (!title || !url) continue;

    const publishedAtIso = pubDateToIso(raw['pubDate']);
    if (!publishedAtIso) continue;

    // <source url="...">Publisher Name</source> — the text node is the
    // publisher name. Fall back to 'Google News' only when genuinely absent.
    const source = extractText(raw['source']) ?? 'Google News';

    items.push({ title, url, source, publishedAtIso, abstract: null });
  }

  return { items, error: null };
}

/**
 * Parses a generic publisher RSS 2.0 feed (ET Markets, LiveMint, or any
 * similarly-shaped market-wide feed). Unlike Google News, these feeds carry
 * no per-item source element — the caller supplies the feed's display name.
 * `<description>` here is a clean text abstract, kept as `abstract`.
 */
export function parseRssFeed(xml: string, sourceName: string): ParseResult {
  const parsed = parseChannel(xml);
  if ('error' in parsed) return { items: [], error: parsed.error };

  const items: RawNewsItem[] = [];

  for (const raw of asItemRecords(parsed.channel['item'])) {
    const title = extractText(raw['title']);
    const url = extractText(raw['link']);
    if (!title || !url) continue;

    const publishedAtIso = pubDateToIso(raw['pubDate']);
    if (!publishedAtIso) continue;

    const abstract = extractText(raw['description']);

    items.push({ title, url, source: sourceName, publishedAtIso, abstract });
  }

  return { items, error: null };
}

interface FinnhubEntry {
  category?: unknown;
  datetime?: unknown;
  headline?: unknown;
  id?: unknown;
  image?: unknown;
  related?: unknown;
  source?: unknown;
  summary?: unknown;
  url?: unknown;
}

/**
 * Validates an unknown JSON value (the parsed body of Finnhub's
 * `GET /company-news`) into `RawNewsItem[]`. A non-array response is either
 * the live-observed `{"error":"..."}` auth-failure shape (surfaced as an
 * honest error mentioning the API's own message) or some other unexpected
 * shape (generic error) — never silently treated as zero items. Entries
 * missing a string `url` or `headline`, or a numeric `datetime`, are
 * skipped, not fabricated; the remaining entries still come back.
 */
export function parseFinnhubNews(json: unknown, fallbackSource?: string): ParseResult {
  if (!Array.isArray(json)) {
    if (isRecord(json) && typeof json['error'] === 'string' && json['error'].trim().length > 0) {
      return { items: [], error: `Finnhub error: ${json['error']}` };
    }
    return { items: [], error: 'Invalid Finnhub response: expected an array of news items' };
  }

  const items: RawNewsItem[] = [];

  for (const entry of json) {
    if (!isRecord(entry)) continue;
    const e = entry as FinnhubEntry;

    if (typeof e.url !== 'string' || e.url.trim().length === 0) continue;
    if (typeof e.headline !== 'string' || e.headline.trim().length === 0) continue;
    if (typeof e.datetime !== 'number' || Number.isNaN(e.datetime)) continue;

    const publishedAtIso = new Date(e.datetime * 1000).toISOString();
    const abstract =
      typeof e.summary === 'string' && e.summary.trim().length > 0 ? e.summary : null;
    const source =
      typeof e.source === 'string' && e.source.trim().length > 0
        ? e.source
        : fallbackSource ?? 'Finnhub';

    items.push({ title: e.headline, url: e.url, source, publishedAtIso, abstract });
  }

  return { items, error: null };
}
