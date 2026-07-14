import type { SupabaseClient } from '@supabase/supabase-js';
import type { Holding, Instrument, Transaction, WatchlistItem } from '@/lib/types';
import { deriveHoldings } from '@/lib/portfolio/derive-holdings';

// Read-only data access layer for the portfolio domain (PORT-01/02/03/05/06).
//
// Every function here accepts an already-constructed Supabase client. Callers
// MUST pass the cookie-bound server client from `@/utils/supabase/server` —
// NEVER the admin client from `@/utils/supabase/admin`, which bypasses RLS and
// must never touch user-facing reads (see that file's own warning comment).
// RLS alone does the authorization here; there is no duplicate permission
// check in this file (per 02-RESEARCH.md's "Don't Hand-Roll" guidance).

// Row shapes as returned by Supabase's nested select() joins. This project has
// no generated `Database` types yet, so the client is untyped (`any` rows);
// these interfaces narrow the shape locally for this file only.
interface InstrumentRow {
  id: string;
  isin: string;
  symbol: string;
  exchange: Instrument['exchange'];
  display_name: string;
  currency: Instrument['currency'];
  price_source_symbol: string | null;
}

interface TransactionRow {
  id: string;
  instrument_id: string;
  transaction_type: Transaction['transactionType'];
  quantity: number;
  price: number | null;
  transaction_date: string;
  instruments: InstrumentRow | InstrumentRow[] | null;
}

interface WatchlistRow {
  id: string;
  instrument_id: string;
  added_at: string;
  instruments: InstrumentRow | InstrumentRow[] | null;
}

/**
 * Supabase nests a to-one FK relation as a single object, but depending on
 * client/type inference it can surface as a one-element array — normalize
 * both shapes to a single row (or null).
 */
function firstInstrument(value: InstrumentRow | InstrumentRow[] | null): InstrumentRow | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function getAccountId(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('investment_accounts')
    .select('id')
    .eq('user_id', userId)
    .single();
  if (error || !data) throw new Error('Could not resolve investment account');
  return data.id as string;
}

/**
 * getHoldings — loads every transaction for an account (joined to instrument
 * display data in one query, no N+1 — see 02-RESEARCH.md Pitfall 2), then
 * delegates the BUY/SELL/SPLIT/BONUS aggregation to the tested `deriveHoldings`
 * from plan 02-02. This function does NOT re-implement that math.
 *
 * Pricing fields (currentPrice, dayChangePercent, totalChangePercent) are
 * intentionally left undefined here — Phase 3 (PRICE-*) fills those in. The
 * UI must show an honest "pending" state, never a fabricated number.
 */
export async function getHoldings(supabase: SupabaseClient, accountId: string): Promise<Holding[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select(
      `id, instrument_id, transaction_type, quantity, price, transaction_date,
      instruments ( id, isin, symbol, exchange, display_name, currency, price_source_symbol )`
    )
    .eq('account_id', accountId);
  if (error) throw new Error(`Failed to load transactions: ${error.message}`);

  const rows = (data ?? []) as unknown as TransactionRow[];

  // Map DB rows -> Transaction[] shape and reuse the plan 02-02 aggregation.
  const transactions: Transaction[] = rows.map((row) => ({
    id: row.id,
    accountId,
    instrumentId: row.instrument_id,
    transactionType: row.transaction_type,
    quantity: row.quantity,
    price: row.price,
    transactionDate: row.transaction_date,
  }));

  const derived = deriveHoldings(transactions);

  // Build the instrument display lookup from the SAME query result — do not
  // issue a second query per instrument.
  const instrumentById = new Map<string, InstrumentRow>();
  for (const row of rows) {
    const instrument = firstInstrument(row.instruments);
    if (instrument) instrumentById.set(row.instrument_id, instrument);
  }

  const holdings: Holding[] = [];
  for (const [instrumentId, { quantity, avgCost }] of derived) {
    const instrument = instrumentById.get(instrumentId);
    if (!instrument) continue; // should not happen: every txn's instrument was joined above
    holdings.push({
      instrumentId,
      ticker: instrument.symbol,
      name: instrument.display_name,
      exchange: instrument.exchange,
      currency: instrument.currency,
      quantity,
      avgCost,
    });
  }

  return holdings;
}

export async function getWatchlist(supabase: SupabaseClient, accountId: string): Promise<WatchlistItem[]> {
  const { data, error } = await supabase
    .from('watchlist_items')
    .select(
      `id, instrument_id, added_at,
      instruments ( id, isin, symbol, exchange, display_name, currency )`
    )
    .eq('account_id', accountId)
    .order('added_at', { ascending: false });
  if (error) throw new Error(`Failed to load watchlist: ${error.message}`);

  const rows = (data ?? []) as unknown as WatchlistRow[];

  return rows.reduce<WatchlistItem[]>((acc, row) => {
    const instrument = firstInstrument(row.instruments);
    if (!instrument) return acc; // instrument_id is NOT NULL FK; guard is type-safety only
    acc.push({
      id: row.id,
      instrumentId: row.instrument_id,
      ticker: instrument.symbol,
      name: instrument.display_name,
      exchange: instrument.exchange,
      currency: instrument.currency,
      addedAt: row.added_at,
    });
    return acc;
  }, []);
}

/**
 * searchInstruments — powers the "pick a real instrument" mutation boundary
 * (PORT-06): the UI must search this master list rather than accept a
 * free-text ticker. Read-only, shared reference table (RLS: authenticated
 * SELECT-only).
 */
export async function searchInstruments(supabase: SupabaseClient, query: string): Promise<Instrument[]> {
  if (!query.trim()) return [];
  const { data, error } = await supabase
    .from('instruments')
    .select('id, isin, symbol, exchange, display_name, asset_type, currency, price_source_symbol')
    .or(`symbol.ilike.%${query}%,display_name.ilike.%${query}%`)
    .limit(20);
  if (error) throw new Error(`Instrument search failed: ${error.message}`);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    isin: row.isin,
    symbol: row.symbol,
    exchange: row.exchange,
    displayName: row.display_name,
    assetType: row.asset_type,
    currency: row.currency,
    priceSourceSymbol: row.price_source_symbol ?? '',
  }));
}
