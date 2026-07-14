/**
 * PRICE-01 — network wrapper around Yahoo Finance's chart endpoint.
 *
 * This file owns ONLY "how do we get the bytes and handle the network
 * failing." All "what does this response mean" logic lives in the tested
 * pure function `parseYahooChartResponse` (src/lib/prices/ingest.ts, 03-02)
 * and is reused here, never reimplemented.
 *
 * Every `symbol` passed in MUST be an instrument's `price_source_symbol`
 * (e.g. 'INFY.NS', 'TATASTEEL.BO', 'AAPL') — never the bare display
 * `symbol` column. Mixing the two fetches the wrong exchange's quote (see
 * 03-RESEARCH.md Pitfall 3). Mapping symbol -> instrument_id, Supabase
 * access, and the price_cache upsert all happen in the caller (03-04) —
 * this function is keyed purely by the symbol string it was asked to fetch.
 */

import { parseYahooChartResponse } from '@/lib/prices/ingest';

export type PriceFetchResult =
  | { price: number; changePct: number; fetchError: null }
  | { price: null; changePct: null; fetchError: string };

// Same browser-like User-Agent used by src/lib/research/yahoo-finance.ts —
// Yahoo blocks requests that don't look like they came from a browser.
const YAHOO_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchOnePrice(symbol: string): Promise<PriceFetchResult> {
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': YAHOO_USER_AGENT },
    });

    if (!res.ok) {
      return { price: null, changePct: null, fetchError: `HTTP ${res.status}` };
    }

    const json = await res.json();
    const parsed = parseYahooChartResponse(json);

    if (parsed === null) {
      return {
        price: null,
        changePct: null,
        fetchError: 'Malformed response from price source',
      };
    }

    return { price: parsed.price, changePct: parsed.changePct, fetchError: null };
  } catch (err) {
    return {
      price: null,
      changePct: null,
      fetchError: err instanceof Error ? err.message : 'Unknown fetch error',
    };
  }
}

/**
 * Fetches the latest price for every symbol in `symbols`, in parallel.
 * Never throws for the whole batch — one bad/delisted ticker resolves to
 * an explicit per-symbol error result, it never aborts the other N-1
 * fetches or produces an unhandled rejection.
 */
export async function fetchPrices(
  symbols: string[]
): Promise<Record<string, PriceFetchResult>> {
  const results: Record<string, PriceFetchResult> = {};

  const settled = await Promise.allSettled(
    symbols.map(async (symbol) => ({ symbol, result: await fetchOnePrice(symbol) }))
  );

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    const symbol = symbols[i];

    if (outcome.status === 'fulfilled') {
      results[outcome.value.symbol] = outcome.value.result;
    } else {
      // fetchOnePrice already catches its own errors, so this branch should
      // be unreachable in practice — kept as a defensive fallback so a
      // truly unexpected rejection still yields an honest error result
      // instead of an unhandled rejection or a missing key.
      results[symbol] = {
        price: null,
        changePct: null,
        fetchError:
          outcome.reason instanceof Error ? outcome.reason.message : 'Unknown fetch error',
      };
    }
  }

  return results;
}
