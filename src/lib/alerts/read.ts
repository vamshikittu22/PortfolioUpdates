/**
 * ALRT-02 — read-only data access for the user-facing alerts list. Mirrors
 * the read-only, cookie-bound, never-fabricate style of
 * `src/lib/prices/get-portfolio-pnl.ts`: accepts an already-constructed
 * cookie-bound `SupabaseClient` (RLS-scoped) — NEVER the admin client.
 *
 * Joins `price_alerts` to instrument display data AND the current cached
 * price (`price_cache`) in a bounded number of queries (no N+1 — the
 * getHoldings precedent), returning UI-ready rows for the RSC that renders
 * `/alerts` (05-08's scope).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Currency, Exchange } from '@/lib/types';

export interface PriceAlertView {
  id: string;
  instrumentId: string;
  ticker: string;
  name: string;
  exchange: Exchange;
  currency: Currency;
  direction: 'above' | 'below';
  threshold: number;
  isActive: boolean;
  cooldownMinutes: number;
  lastTriggeredAt: string | null;
  currentPrice: number | null;
}

interface InstrumentDisplayRow {
  symbol: string;
  display_name: string;
  exchange: Exchange;
  currency: Currency;
}

interface PriceAlertRow {
  id: string;
  instrument_id: string;
  direction: 'above' | 'below';
  threshold: number;
  is_active: boolean;
  cooldown_minutes: number;
  last_triggered_at: string | null;
  instruments: InstrumentDisplayRow | InstrumentDisplayRow[] | null;
}

/**
 * Supabase nests a to-one FK relation as a single object, but depending on
 * client/type inference it can surface as a one-element array — normalize
 * both shapes to a single row (or null). Same idea as
 * `src/lib/supabase/portfolio.ts`'s `firstInstrument`.
 */
function firstInstrument(
  value: InstrumentDisplayRow | InstrumentDisplayRow[] | null
): InstrumentDisplayRow | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * getPriceAlerts — the account's alerts joined to instrument display data
 * and their current cached price, in UI-ready shape.
 *
 * `currentPrice` is honestly `null` when the instrument has never been
 * priced (price_cache has no row, or its `price` column is itself null) —
 * never a fabricated 0. The RSC/UI renders an em-dash in that case, matching
 * the discipline in `get-portfolio-pnl.ts`.
 */
export async function getPriceAlerts(
  supabase: SupabaseClient,
  accountId: string
): Promise<PriceAlertView[]> {
  const { data, error } = await supabase
    .from('price_alerts')
    .select(
      `id, instrument_id, direction, threshold, is_active, cooldown_minutes, last_triggered_at,
      instruments ( symbol, display_name, exchange, currency )`
    )
    .eq('account_id', accountId)
    .order('created_at');
  if (error) throw new Error(`Failed to load price alerts: ${error.message}`);

  const rows = (data ?? []) as unknown as PriceAlertRow[];

  const instrumentIds = Array.from(new Set(rows.map((r) => r.instrument_id)));
  const priceById = new Map<string, number | null>();
  if (instrumentIds.length > 0) {
    const { data: priceRows, error: priceError } = await supabase
      .from('price_cache')
      .select('instrument_id, price')
      .in('instrument_id', instrumentIds);
    if (priceError) throw new Error(`Failed to load price cache: ${priceError.message}`);
    for (const row of priceRows ?? []) {
      priceById.set(row.instrument_id as string, (row.price as number | null) ?? null);
    }
  }

  const views: PriceAlertView[] = [];
  for (const row of rows) {
    const instrument = firstInstrument(row.instruments);
    if (!instrument) continue; // instrument_id is NOT NULL FK; guard is type-safety only
    views.push({
      id: row.id,
      instrumentId: row.instrument_id,
      ticker: instrument.symbol,
      name: instrument.display_name,
      exchange: instrument.exchange,
      currency: instrument.currency,
      direction: row.direction,
      threshold: row.threshold,
      isActive: row.is_active,
      cooldownMinutes: row.cooldown_minutes,
      lastTriggeredAt: row.last_triggered_at,
      // price ?? null when never fetched — never a fabricated number.
      currentPrice: priceById.get(row.instrument_id) ?? null,
    });
  }

  return views;
}
