/**
 * NEWS-01/02/04/05 — the single orchestration point where `news_items` and
 * `news_item_instruments` are ever written. Mirrors
 * `src/lib/prices/refresh-service.ts`'s header discipline: accepts an
 * ALREADY-CONSTRUCTED admin client — the "which client" decision stays at the
 * call site (the secret-guarded `/api/news/refresh` route), never built
 * here.
 *
 * This file wires together, but does not reimplement, Phase 6's pure/network
 * modules: `fetch-news.ts` (network), `dedupe.ts` (canonicalizeUrl /
 * computeTitleHash, pure), `match.ts` (matchInstruments, pure), `ai.ts`
 * (summarizeNewsBatch, network). No RSS/XML parsing, no regex matching, no
 * hashing logic is re-implemented in this file.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchFinnhubCompanyNews,
  fetchGoogleNews,
  fetchPublisherFeed,
} from '@/lib/news/fetch-news';
import { canonicalizeUrl, computeTitleHash } from '@/lib/news/dedupe';
import { matchInstruments, type MatchCandidate } from '@/lib/news/match';
import { buildInstrumentNewsQuery, INDIAN_PUBLISHER_FEEDS } from '@/lib/news/sources';
import type { RawNewsItem } from '@/lib/news/types';

export interface NewsRefreshSummary {
  instrumentsConsidered: number;
  sourcesFetched: number;
  sourceErrors: string[];
  itemsSeen: number;
  itemsNew: number;
  itemsDuplicate: number;
  itemsUnmatched: number;
  summarizedNow: number;
  degradedNow: number;
  aiDegraded: boolean;
  timestamp: string;
}

interface InstrumentRow {
  id: string;
  symbol: string;
  display_name: string;
  exchange: string;
}

/** Politeness delay between sequential per-source fetch calls (Finnhub per-minute limit, outbox sendSequentially precedent). */
const INTER_FETCH_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Chunks an array into groups of `size` — used to keep `.in()` filter lists bounded. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function yyyymmdd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Discovers every instrument referenced by ANY user's transactions or
 * watchlist items — same union-of-both-tables rationale as
 * `refresh-service.ts`'s `discoverInstrumentIds`: news is a shared, global
 * table, so the ingest cycle must consider all accounts, not just one.
 */
async function discoverInstruments(admin: SupabaseClient): Promise<InstrumentRow[]> {
  const [txResult, watchlistResult] = await Promise.all([
    admin.from('transactions').select('instrument_id'),
    admin.from('watchlist_items').select('instrument_id'),
  ]);

  if (txResult.error) throw txResult.error;
  if (watchlistResult.error) throw watchlistResult.error;

  const ids = new Set<string>();
  for (const row of txResult.data ?? []) ids.add(row.instrument_id as string);
  for (const row of watchlistResult.data ?? []) ids.add(row.instrument_id as string);

  if (ids.size === 0) return [];

  const { data, error } = await admin
    .from('instruments')
    .select('id, symbol, display_name, exchange')
    .in('id', Array.from(ids));
  if (error) throw error;

  return (data ?? []) as InstrumentRow[];
}

interface FetchedItem {
  raw: RawNewsItem;
  /** The instrument this item was fetched FOR (Finnhub is already company-scoped); null for market-wide publisher feeds and Google News per-instrument fetches, which rely entirely on matchInstruments. */
  seedInstrumentId: string | null;
}

/**
 * Fetch phase: SEQUENTIALLY per source class (politeness + Finnhub's
 * per-minute limit). Every fetchError is source-labeled and recorded in
 * `sourceErrors`; the run NEVER aborts on a single source failure.
 * A Finnhub "not configured" error is recorded ONCE, not per-instrument.
 */
async function fetchAllSources(
  instruments: InstrumentRow[],
  summary: NewsRefreshSummary
): Promise<FetchedItem[]> {
  const fetched: FetchedItem[] = [];

  const usInstruments = instruments.filter((i) => i.exchange === 'NASDAQ' || i.exchange === 'NYSE');
  const indianInstruments = instruments.filter((i) => i.exchange === 'NSE' || i.exchange === 'BSE');

  // ── Finnhub (US instruments) ──
  const today = new Date();
  const fromDate = yyyymmdd(new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000));
  const toDate = yyyymmdd(today);

  let finnhubNotConfiguredRecorded = false;
  let finnhubSkipped = false;

  for (const instrument of usInstruments) {
    if (finnhubSkipped) break;

    const result = await fetchFinnhubCompanyNews(instrument.symbol, fromDate, toDate);
    if (result.fetchError !== null) {
      if (result.fetchError.includes('not configured')) {
        // Recorded once, not per-instrument spam — Finnhub is skipped for
        // the rest of this run (headline degradation, not failure).
        if (!finnhubNotConfiguredRecorded) {
          summary.sourceErrors.push(`Finnhub: ${result.fetchError}`);
          finnhubNotConfiguredRecorded = true;
        }
        finnhubSkipped = true;
        break;
      }
      summary.sourceErrors.push(`Finnhub (${instrument.symbol}): ${result.fetchError}`);
    } else {
      summary.sourcesFetched++;
      for (const item of result.items) {
        fetched.push({ raw: item, seedInstrumentId: instrument.id });
      }
    }

    await sleep(INTER_FETCH_DELAY_MS);
  }

  // ── Google News (NSE/BSE instruments) ──
  for (const instrument of indianInstruments) {
    const query = buildInstrumentNewsQuery(instrument.display_name, instrument.symbol);
    const result = await fetchGoogleNews(query);
    if (result.fetchError !== null) {
      summary.sourceErrors.push(`Google News (${instrument.symbol}): ${result.fetchError}`);
    } else {
      summary.sourcesFetched++;
      for (const item of result.items) {
        fetched.push({ raw: item, seedInstrumentId: null });
      }
    }

    await sleep(INTER_FETCH_DELAY_MS);
  }

  // ── Indian publisher feeds (market-wide, once each per run) ──
  for (const feed of INDIAN_PUBLISHER_FEEDS) {
    const result = await fetchPublisherFeed(feed);
    if (result.fetchError !== null) {
      summary.sourceErrors.push(`${feed.name}: ${result.fetchError}`);
    } else {
      summary.sourcesFetched++;
      for (const item of result.items) {
        fetched.push({ raw: item, seedInstrumentId: null });
      }
    }

    await sleep(INTER_FETCH_DELAY_MS);
  }

  return fetched;
}

/**
 * refreshAllNews — discover held+watched instruments, fetch per-source
 * class, canonicalize/dedup (URL + title_hash, in-memory AND DB-backstopped),
 * word-boundary match, insert ONLY matched items (no firehose). Every count
 * in the returned summary is real.
 */
export async function refreshAllNews(admin: SupabaseClient): Promise<NewsRefreshSummary> {
  const nowIso = new Date().toISOString();

  const instruments = await discoverInstruments(admin);

  const summary: NewsRefreshSummary = {
    instrumentsConsidered: instruments.length,
    sourcesFetched: 0,
    sourceErrors: [],
    itemsSeen: 0,
    itemsNew: 0,
    itemsDuplicate: 0,
    itemsUnmatched: 0,
    summarizedNow: 0,
    degradedNow: 0,
    aiDegraded: false,
    timestamp: nowIso,
  };

  if (instruments.length === 0) {
    return summary;
  }

  const candidates: MatchCandidate[] = instruments.map((i) => ({
    instrumentId: i.id,
    symbol: i.symbol,
    displayName: i.display_name,
  }));
  const candidatesById = new Map(candidates.map((c) => [c.instrumentId, c]));

  const fetchedItems = await fetchAllSources(instruments, summary);

  summary.itemsSeen = fetchedItems.length;
  if (fetchedItems.length === 0) {
    return summary;
  }

  // ── Canonicalize + in-memory dedup (the same story often appears in
  // Google News AND a publisher feed within one run) ──
  interface CanonicalItem {
    fetched: FetchedItem;
    canonicalUrl: string;
    titleHash: string;
  }
  const seenUrls = new Set<string>();
  const seenTitleHashes = new Set<string>();
  const canonicalItems: CanonicalItem[] = [];

  for (const item of fetchedItems) {
    const canonicalUrl = canonicalizeUrl(item.raw.url);
    const titleHash = computeTitleHash(item.raw.title);

    if (seenUrls.has(canonicalUrl) || seenTitleHashes.has(titleHash)) {
      summary.itemsDuplicate++;
      continue;
    }
    seenUrls.add(canonicalUrl);
    seenTitleHashes.add(titleHash);
    canonicalItems.push({ fetched: item, canonicalUrl, titleHash });
  }

  // ── DB-backstop pre-dedup: batch-query existing url/title_hash, chunked at 200 ──
  const allUrls = canonicalItems.map((c) => c.canonicalUrl);
  const allTitleHashes = canonicalItems.map((c) => c.titleHash);

  const existingUrls = new Set<string>();
  const existingTitleHashes = new Set<string>();

  for (const urlChunk of chunk(allUrls, 200)) {
    const { data, error } = await admin.from('news_items').select('url, title_hash').in('url', urlChunk);
    if (error) throw error;
    for (const row of data ?? []) {
      existingUrls.add(row.url as string);
    }
  }
  for (const hashChunk of chunk(allTitleHashes, 200)) {
    const { data, error } = await admin
      .from('news_items')
      .select('url, title_hash')
      .in('title_hash', hashChunk);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.title_hash) existingTitleHashes.add(row.title_hash as string);
    }
  }

  // ── Match + insert ──
  for (const item of canonicalItems) {
    if (existingUrls.has(item.canonicalUrl) || existingTitleHashes.has(item.titleHash)) {
      summary.itemsDuplicate++;
      continue;
    }

    const text = `${item.fetched.raw.title} ${item.fetched.raw.abstract ?? ''}`;
    const textMatches = matchInstruments(text, candidates);

    // Finnhub items are already company-scoped: seed with the
    // fetched-for instrument (matchedVia 'symbol', the company-news
    // endpoint's own scoping), then union word-boundary matches. The
    // `related` field on Finnhub items is deliberately ignored — bare
    // symbols without exchange identity, the exact price_cache flaw.
    const matchesByInstrumentId = new Map<string, 'symbol' | 'company-name'>();
    if (item.fetched.seedInstrumentId && candidatesById.has(item.fetched.seedInstrumentId)) {
      matchesByInstrumentId.set(item.fetched.seedInstrumentId, 'symbol');
    }
    for (const m of textMatches) {
      if (!matchesByInstrumentId.has(m.instrumentId)) {
        matchesByInstrumentId.set(m.instrumentId, m.matchedVia);
      }
    }

    if (matchesByInstrumentId.size === 0) {
      // Portfolio-relevant only; the no-firehose rule.
      summary.itemsUnmatched++;
      continue;
    }

    const matchedDisplaySymbols = Array.from(matchesByInstrumentId.keys())
      .map((id) => candidatesById.get(id)?.symbol)
      .filter((s): s is string => Boolean(s));

    const { data: insertedRow, error: insertError } = await admin
      .from('news_items')
      .insert({
        headline: item.fetched.raw.title,
        url: item.canonicalUrl,
        source: item.fetched.raw.source,
        published_at: item.fetched.raw.publishedAtIso,
        title_hash: item.titleHash,
        affected_symbols: matchedDisplaySymbols,
        summary_status: 'pending',
      })
      .select('id')
      .single();

    if (insertError) {
      // 23505 = unique violation (url or title_hash race with a concurrent
      // writer) — count as duplicate, never fail the run.
      if (insertError.code === '23505') {
        summary.itemsDuplicate++;
        continue;
      }
      throw insertError;
    }

    const newsItemId = insertedRow.id as string;

    const joinRows = Array.from(matchesByInstrumentId.entries()).map(([instrumentId, matchedVia]) => ({
      news_item_id: newsItemId,
      instrument_id: instrumentId,
      matched_via: matchedVia,
    }));

    const { error: joinError } = await admin.from('news_item_instruments').insert(joinRows);
    // Ignore-duplicate on 23505 (composite PK race) likewise — never fail
    // the run on a duplicate join row.
    if (joinError && joinError.code !== '23505') {
      throw joinError;
    }

    summary.itemsNew++;
  }

  // Task 2 continues: summarization pass
  return summary;
}
