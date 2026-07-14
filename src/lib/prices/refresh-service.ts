/**
 * PRICE-01/02/03/07 — the single orchestration point where price_cache and
 * fx_cache are ever written. Both entry points (the secret-guarded cron
 * route and the auth-gated "refresh now" Server Action) call
 * `refreshAllPrices` with an admin (service-role) client they construct
 * themselves — this file never constructs a client, it only accepts one,
 * keeping the "which client" decision at the call site (see AUTH-05's
 * admin.ts warning comment).
 *
 * This file wires together, but does not reimplement, 03-02's pure logic
 * (`shouldSkipRefresh`, `detectCorporateAction`) and 03-03's network
 * wrappers (`fetchPrices`, `fetchFXRate`).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { shouldSkipRefresh, detectCorporateAction } from '@/lib/prices/ingest';
import { fetchPrices } from '@/lib/prices/fetch-prices';
import { fetchFXRate } from '@/lib/prices/fx-rates';

export interface RefreshSummary {
  instrumentsConsidered: number;
  instrumentsFetched: number;
  instrumentsSkippedDedup: number;
  succeeded: number;
  failed: number;
  fxUpdated: boolean;
  timestamp: string;
}

interface InstrumentRow {
  id: string;
  price_source_symbol: string;
}

/**
 * Discovers every instrument referenced by ANY user's transactions or
 * watchlist items — price_cache is a shared, global table per Phase 1's
 * design, so the refresh cycle must consider all accounts, not just one.
 * Requires the admin client: a cookie-bound client would only see the
 * calling user's own rows (RLS-scoped) and undercount the shared cache's
 * needs.
 */
async function discoverInstrumentIds(admin: SupabaseClient): Promise<string[]> {
  const [txResult, watchlistResult] = await Promise.all([
    admin.from('transactions').select('instrument_id'),
    admin.from('watchlist_items').select('instrument_id'),
  ]);

  if (txResult.error) throw txResult.error;
  if (watchlistResult.error) throw watchlistResult.error;

  const ids = new Set<string>();
  for (const row of txResult.data ?? []) ids.add(row.instrument_id as string);
  for (const row of watchlistResult.data ?? []) ids.add(row.instrument_id as string);

  return Array.from(ids);
}

/**
 * refreshAllPrices — discovers instruments across all users, applies the
 * 60s dedup guard per-instrument, fetches via 03-03's wrappers, and writes
 * honestly: a failed fetch NEVER clobbers a previously-good price, and NEVER
 * fabricates a new one. FX is refreshed unconditionally on every call (not
 * dedup'd like prices) — it's a single cheap extra request per
 * 03-RESEARCH.md's Open Question 4 recommendation, and keeping it simple
 * avoids standing up a second dedup timer for just one pair.
 */
export async function refreshAllPrices(admin: SupabaseClient): Promise<RefreshSummary> {
  const now = new Date();
  const nowIso = now.toISOString();

  const instrumentIds = await discoverInstrumentIds(admin);

  const summary: RefreshSummary = {
    instrumentsConsidered: instrumentIds.length,
    instrumentsFetched: 0,
    instrumentsSkippedDedup: 0,
    succeeded: 0,
    failed: 0,
    fxUpdated: false,
    timestamp: nowIso,
  };

  if (instrumentIds.length === 0) {
    await refreshFx(admin, nowIso, summary);
    return summary;
  }

  const { data: instrumentRows, error: instrumentsError } = await admin
    .from('instruments')
    .select('id, price_source_symbol')
    .in('id', instrumentIds);
  if (instrumentsError) throw instrumentsError;

  const instrumentsById = new Map<string, InstrumentRow>(
    (instrumentRows ?? []).map((row) => [row.id as string, row as InstrumentRow])
  );

  const { data: existingPriceRows, error: priceCacheError } = await admin
    .from('price_cache')
    .select('instrument_id, updated_at')
    .in('instrument_id', instrumentIds);
  if (priceCacheError) throw priceCacheError;

  const lastUpdatedByInstrument = new Map<string, string | null>(
    (existingPriceRows ?? []).map((row) => [row.instrument_id as string, row.updated_at as string | null])
  );

  const instrumentsToFetch: InstrumentRow[] = [];
  for (const instrumentId of instrumentIds) {
    const instrument = instrumentsById.get(instrumentId);
    if (!instrument) continue; // referenced id no longer in instruments (shouldn't happen, defensive)

    const lastUpdatedAt = lastUpdatedByInstrument.get(instrumentId) ?? null;
    const skip = shouldSkipRefresh(lastUpdatedAt ? new Date(lastUpdatedAt) : null, now);
    if (skip) {
      summary.instrumentsSkippedDedup++;
      continue;
    }
    instrumentsToFetch.push(instrument);
  }

  summary.instrumentsFetched = instrumentsToFetch.length;

  if (instrumentsToFetch.length > 0) {
    const symbols = instrumentsToFetch.map((i) => i.price_source_symbol);
    const fetchResults = await fetchPrices(symbols);

    const upsertRows: Array<{
      instrument_id: string;
      symbol: string;
      price: number;
      change_pct: number;
      source: string;
      fetch_error: null;
      corporate_action_flag: boolean;
      updated_at: string;
    }> = [];

    for (const instrument of instrumentsToFetch) {
      const result = fetchResults[instrument.price_source_symbol];
      if (!result) {
        // Defensive: fetchPrices always returns one entry per requested
        // symbol, but guard anyway rather than silently dropping it.
        summary.failed++;
        await recordPriceFetchFailure(admin, instrument, 'No result returned from fetch', nowIso);
        continue;
      }

      if (result.fetchError === null) {
        summary.succeeded++;
        upsertRows.push({
          instrument_id: instrument.id,
          symbol: instrument.price_source_symbol,
          price: result.price,
          change_pct: result.changePct,
          source: 'yahoo-finance',
          fetch_error: null,
          corporate_action_flag: detectCorporateAction(result.changePct),
          updated_at: nowIso,
        });
      } else {
        summary.failed++;
        await recordPriceFetchFailure(admin, instrument, result.fetchError, nowIso);
      }
    }

    if (upsertRows.length > 0) {
      const { error: upsertError } = await admin
        .from('price_cache')
        .upsert(upsertRows, { onConflict: 'instrument_id' });
      if (upsertError) throw upsertError;
    }
  }

  await refreshFx(admin, nowIso, summary);

  return summary;
}

/**
 * On a per-symbol fetch failure: update ONLY fetch_error on the existing
 * row (leaves price/change_pct/updated_at/corporate_action_flag exactly as
 * they were — the "never clobber a good price with a failure" guarantee).
 * If the UPDATE affects zero rows (brand-new instrument, never priced
 * before), fall back to an INSERT with price: null — the ONLY case where a
 * NULL price row is written is "this instrument has never once been
 * successfully priced," which is honest, not fabricated.
 */
async function recordPriceFetchFailure(
  admin: SupabaseClient,
  instrument: InstrumentRow,
  fetchError: string,
  nowIso: string
): Promise<void> {
  const { data: updatedRows, error: updateError } = await admin
    .from('price_cache')
    .update({ fetch_error: fetchError })
    .eq('instrument_id', instrument.id)
    .select('instrument_id');
  if (updateError) throw updateError;

  if (!updatedRows || updatedRows.length === 0) {
    const { error: insertError } = await admin.from('price_cache').insert({
      instrument_id: instrument.id,
      symbol: instrument.price_source_symbol,
      price: null,
      change_pct: null,
      source: null,
      fetch_error: fetchError,
      corporate_action_flag: false,
      updated_at: nowIso,
    });
    if (insertError) throw insertError;
  }
}

/**
 * FX refresh: same partial-update-or-insert honesty pattern as price_cache.
 * On success, resets fetch_error and writes the fresh rate. On failure,
 * preserves the last-known-good rate (update fetch_error only); only
 * inserts a rate:null row if fx_cache has no row for this pair yet.
 */
async function refreshFx(admin: SupabaseClient, nowIso: string, summary: RefreshSummary): Promise<void> {
  const pair = 'USD_INR';
  const result = await fetchFXRate('USD', 'INR');

  if (result.fetchError === null) {
    const { error: upsertError } = await admin
      .from('fx_cache')
      .upsert({ pair, rate: result.rate, fetch_error: null, updated_at: nowIso }, { onConflict: 'pair' });
    if (upsertError) throw upsertError;
    summary.fxUpdated = true;
    return;
  }

  const { data: updatedRows, error: updateError } = await admin
    .from('fx_cache')
    .update({ fetch_error: result.fetchError })
    .eq('pair', pair)
    .select('pair');
  if (updateError) throw updateError;

  if (!updatedRows || updatedRows.length === 0) {
    const { error: insertError } = await admin.from('fx_cache').insert({
      pair,
      rate: null,
      fetch_error: result.fetchError,
      updated_at: nowIso,
    });
    if (insertError) throw insertError;
  }

  summary.fxUpdated = false;
}
