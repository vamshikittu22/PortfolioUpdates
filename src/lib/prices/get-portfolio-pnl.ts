/**
 * PRICE-04/05/06 — server-side glue combining real holdings (Phase 2's
 * getHoldings), cached prices (price_cache), and the cached FX rate
 * (fx_cache) into UI-ready P&L data for the Dashboard/Holdings pages.
 *
 * This is the only place a Supabase client meets the pure P&L math in
 * src/lib/prices/pnl-calculator.ts — it only reads, so the caller's
 * cookie-bound server client (RLS-scoped) is safe here; unlike 03-04's
 * writes to price_cache/fx_cache, no admin client is needed or used.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Currency, Holding, WatchlistItem } from '@/lib/types';
import { getHoldings, getWatchlist } from '@/lib/supabase/portfolio';
import {
  calculateHoldingPnL,
  calculatePortfolioTotals,
  type HoldingPnL,
  type PortfolioTotal,
} from '@/lib/prices/pnl-calculator';

export type StalenessLevel = 'fresh' | 'stale' | 'very-stale' | 'error' | 'pending';

export interface StalenessInfo {
  level: StalenessLevel;
  /**
   * ISO timestamp of the last SUCCESSFUL price fetch, or null when there has
   * never been one. Deliberately null (not "now") on a never-priced
   * instrument, and null (not a meaningless failure-attempt timestamp) on an
   * instrument that has only ever failed — see computeStaleness below.
   */
  asOf: string | null;
}

export type PricedHolding = Holding &
  HoldingPnL & {
    staleness: StalenessInfo;
    corporateActionFlag: boolean;
  };

/**
 * A watchlist row carrying its cached price, exactly like a held instrument.
 *
 * Phase 3's success criterion 1 is "held AND WATCHED tickers show real prices
 * ... each with an 'as of' timestamp". The refresh service already fetches
 * watchlist instruments (03-04 discovers ids from transactions AND
 * watchlist_items), so the price was already in price_cache — the watchlist UI
 * simply never read it and rendered a permanent em-dash. Found during the
 * 2026-07-15 live review.
 *
 * No P&L here, deliberately: a watched instrument has no quantity or cost
 * basis, so day-change % is meaningful but "total return" is not.
 */
export interface PricedWatchlistItem extends WatchlistItem {
  price: number | null;
  changePct: number | null;
  staleness: StalenessInfo;
  corporateActionFlag: boolean;
}

export interface PortfolioPnLResult {
  holdings: PricedHolding[];
  portfolioTotal: PortfolioTotal;
  fxRate: number | null;
  fxFetchError: string | null;
  /**
   * True when at least one holding is in a non-base currency but no FX rate
   * is cached yet (fx_cache has no row, or its rate is null). In that case
   * `portfolioTotal` is computed EXCLUDING those holdings' priced value
   * (rather than silently converting at a fabricated 1:1 rate) — each such
   * holding's OWN native price/P&L is still shown normally in `holdings`,
   * only the cross-currency aggregate is affected. The caller MUST surface
   * this as a visible warning, per PRICE-06's "never silently mis-total"
   * requirement.
   */
  fxUnavailable: boolean;
}

interface PriceCacheRow {
  instrument_id: string;
  price: number | null;
  change_pct: number | null;
  updated_at: string | null;
  fetch_error: string | null;
  corporate_action_flag: boolean;
}

// Staleness thresholds tied to PRICE-02's ~3-hour scheduled refresh cadence
// (not arbitrary numbers): a price fetched inside the last ~30 minutes is
// well within one refresh cycle ("fresh"); one that has missed roughly one
// full cycle (up to 6h old) is "stale"; one older than that has missed two
// or more cycles and is "very-stale".
const FRESH_MS = 30 * 60 * 1000; // 30 min
const STALE_MS = 6 * 60 * 60 * 1000; // 6h (~2 missed 3h cycles)

/**
 * Single price_cache read used by BOTH the holdings P&L path and the watchlist
 * path, so the two can never drift into different column sets or error
 * handling. Returns rows keyed by instrument_id.
 */
async function readPriceCache(
  supabase: SupabaseClient,
  instrumentIds: string[]
): Promise<Map<string, PriceCacheRow>> {
  if (instrumentIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('price_cache')
    .select('instrument_id, price, change_pct, updated_at, fetch_error, corporate_action_flag')
    .in('instrument_id', instrumentIds);
  if (error) throw new Error(`Failed to load price cache: ${error.message}`);

  return new Map((data ?? []).map((r) => [(r as PriceCacheRow).instrument_id, r as PriceCacheRow]));
}

/**
 * getPricedWatchlist — watchlist rows joined to their cached prices
 * (Phase 3 success criterion 1, "held AND watched tickers show real prices").
 *
 * Read-only, so the caller's cookie-bound RLS-scoped client is correct here;
 * no admin client. Reuses computeStaleness so the watchlist badge can never
 * disagree with the holdings badge about what "stale" means.
 */
export async function getPricedWatchlist(
  supabase: SupabaseClient,
  accountId: string
): Promise<PricedWatchlistItem[]> {
  const items = await getWatchlist(supabase, accountId);
  const priceById = await readPriceCache(
    supabase,
    items.map((i) => i.instrumentId)
  );
  const now = Date.now();

  return items.map((item) => {
    const row = priceById.get(item.instrumentId);
    return {
      ...item,
      // null (not 0) when never fetched — the UI renders an em-dash, never a
      // fabricated price.
      price: row?.price ?? null,
      changePct: row?.change_pct ?? null,
      staleness: computeStaleness(row, now),
      corporateActionFlag: row?.corporate_action_flag ?? false,
    };
  });
}

function computeStaleness(row: PriceCacheRow | undefined, now: number): StalenessInfo {
  if (!row) return { level: 'pending', asOf: null };

  // updated_at is only ever advanced on a SUCCESSFUL fetch (see 03-04's
  // recordPriceFetchFailure, which updates fetch_error only) — so when
  // price is non-null, updated_at is genuinely "as of" the last known-good
  // price, even if the MOST RECENT attempt since then failed.
  const hasLastKnownPrice = row.price !== null && row.updated_at !== null;

  if (row.fetch_error) {
    return { level: 'error', asOf: hasLastKnownPrice ? row.updated_at : null };
  }
  if (!hasLastKnownPrice) return { level: 'pending', asOf: null };

  const ageMs = now - new Date(row.updated_at as string).getTime();
  if (ageMs < FRESH_MS) return { level: 'fresh', asOf: row.updated_at };
  if (ageMs < STALE_MS) return { level: 'stale', asOf: row.updated_at };
  return { level: 'very-stale', asOf: row.updated_at };
}

export async function getPortfolioPnL(
  supabase: SupabaseClient,
  accountId: string,
  baseCurrency: Currency
): Promise<PortfolioPnLResult> {
  const holdings = await getHoldings(supabase, accountId);
  const instrumentIds = holdings.map((h) => h.instrumentId);

  const priceRows: PriceCacheRow[] = Array.from(
    (await readPriceCache(supabase, instrumentIds)).values()
  );

  // Single row for the one FX pair this app tracks today. maybeSingle (not
  // single) because the row may genuinely not exist yet (pre-migration, or
  // never-yet-refreshed) — that is an honest "FX unavailable" state, not an
  // error to throw on.
  const { data: fxRow, error: fxError } = await supabase
    .from('fx_cache')
    .select('rate, updated_at, fetch_error')
    .eq('pair', 'USD_INR')
    .maybeSingle();
  if (fxError) throw new Error(`Failed to load FX cache: ${fxError.message}`);

  const fxRate: number | null = (fxRow?.rate as number | null) ?? null;
  const fxFetchError: string | null = (fxRow?.fetch_error as string | null) ?? null;

  const priceByInstrument = new Map(priceRows.map((row) => [row.instrument_id, row]));
  const now = Date.now();

  const enriched: PricedHolding[] = holdings.map((holding) => {
    const priceRow = priceByInstrument.get(holding.instrumentId);
    const price = priceRow?.price ?? null;
    const changePct = priceRow?.change_pct ?? null;

    const pnl = calculateHoldingPnL(
      { quantity: holding.quantity, avgCost: holding.avgCost, currency: holding.currency },
      price,
      changePct
    );

    return {
      ...holding,
      ...pnl,
      // Keep the pre-existing optional Holding fields populated too (some
      // presentational code may still read these directly).
      currentPrice: price ?? undefined,
      dayChangePercent: pnl.dayChangePct ?? undefined,
      totalChangePercent: pnl.unrealizedPnLPct ?? undefined,
      staleness: computeStaleness(priceRow, now),
      corporateActionFlag: priceRow?.corporate_action_flag ?? false,
    };
  });

  // See PortfolioPnLResult.fxUnavailable doc comment: a non-base-currency
  // holding with no cached FX rate must not be silently converted at 1.
  const hasNonBaseCurrencyHolding = holdings.some((h) => h.currency !== baseCurrency);
  const fxUnavailable = fxRate === null && hasNonBaseCurrencyHolding;

  // When FX is unavailable, exclude non-base holdings from the cross-
  // currency aggregate entirely (their own row still shows real native
  // numbers) rather than pass a fxRate:1 fallback that would silently
  // mis-total them.
  const holdingsForTotal = fxUnavailable ? enriched.filter((h) => h.currency === baseCurrency) : enriched;
  const effectiveFxRate = fxRate ?? 1; // only ever multiplies same-currency (identity) amounts when fxUnavailable

  const portfolioTotal = calculatePortfolioTotals(holdingsForTotal, baseCurrency, effectiveFxRate);

  return {
    holdings: enriched,
    portfolioTotal,
    fxRate,
    fxFetchError,
    fxUnavailable,
  };
}
