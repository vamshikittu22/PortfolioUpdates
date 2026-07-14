-- Phase 2: watchlist entries keyed by instrument identity (ISIN+exchange) instead
-- of a free-text symbol, and drop the Phase 1 holdings snapshot table now that
-- holdings are derived from public.transactions (see derive-holdings.ts, plan 02-02).
--
-- Safe to do destructively: per .planning/STATE.md, Phase 1 ran in CODE-ONLY /
-- DEFER-VERIFICATION mode — no live Supabase was ever started, so no production
-- data exists in either table being altered/dropped here.

DROP TABLE IF EXISTS public.holdings;

ALTER TABLE public.watchlist_items
  ADD COLUMN instrument_id UUID REFERENCES public.instruments(id) ON DELETE RESTRICT;

-- No backfill needed (see note above — table is empty). New rows must always
-- set instrument_id going forward.
ALTER TABLE public.watchlist_items
  ALTER COLUMN instrument_id SET NOT NULL;

ALTER TABLE public.watchlist_items DROP COLUMN IF EXISTS symbol;
ALTER TABLE public.watchlist_items DROP COLUMN IF EXISTS name;

ALTER TABLE public.watchlist_items DROP CONSTRAINT IF EXISTS watchlist_items_account_id_symbol_key;
ALTER TABLE public.watchlist_items
  ADD CONSTRAINT watchlist_items_account_id_instrument_id_key UNIQUE (account_id, instrument_id);

CREATE INDEX IF NOT EXISTS idx_watchlist_items_instrument_id ON public.watchlist_items(instrument_id);
