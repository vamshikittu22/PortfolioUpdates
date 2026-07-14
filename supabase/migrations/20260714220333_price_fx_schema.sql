-- Phase 3: FX rate cache + price_cache re-keying for instrument identity and honest
-- failure/staleness states. New migration — does not edit any existing migration
-- (Phase 1's initial_schema/rls_fixes, or Phase 2's instruments/transactions/
-- watchlist/seed migrations, which this phase depends on and assumes already applied
-- in the same environment).

CREATE TABLE IF NOT EXISTS public.fx_cache (
    pair TEXT PRIMARY KEY, -- e.g. 'USD_INR' (from_to convention: rate multiplies FROM into TO)
    rate NUMERIC CHECK (rate IS NULL OR rate > 0), -- NULL = never successfully fetched
    fetch_error TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.fx_cache ENABLE ROW LEVEL SECURITY;

-- Shared, read-only reference table — same pattern as price_cache/news_items/instruments:
-- any authenticated user may SELECT. No authenticated write policy is created; writes
-- are service-role only (src/utils/supabase/admin.ts), matching the Phase 1 rls_fixes
-- precedent of closing shared-table write holes. Do NOT add a permissive write policy.
CREATE POLICY "Authenticated users can view fx cache" ON public.fx_cache
  FOR SELECT TO authenticated USING (TRUE);


-- price_cache: re-key from bare symbol (Phase 1) to instrument_id (Phase 2 identity —
-- the same company on two exchanges, e.g. INFY on NSE vs NYSE, must get distinct rows).
-- Table has never held live data (no Supabase instance has ever been started for this
-- project — see .planning/STATE.md), so this identity change is safe without a
-- backfill step.

ALTER TABLE public.price_cache
  ADD COLUMN IF NOT EXISTS instrument_id UUID REFERENCES public.instruments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS fetch_error TEXT,
  ADD COLUMN IF NOT EXISTS corporate_action_flag BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.price_cache ALTER COLUMN instrument_id SET NOT NULL;

-- price/source become nullable: a row can now represent "instrument is tracked but has
-- never been successfully priced" (price NULL) as a state distinct from "priced once,
-- now stale" (price present, old updated_at) and "last refresh attempt failed"
-- (fetch_error set). NULL means "pending", never a fabricated 0.
ALTER TABLE public.price_cache ALTER COLUMN price DROP NOT NULL;
ALTER TABLE public.price_cache ALTER COLUMN source DROP NOT NULL;

ALTER TABLE public.price_cache DROP CONSTRAINT IF EXISTS price_cache_pkey;
ALTER TABLE public.price_cache ADD PRIMARY KEY (instrument_id);

-- Keep `symbol` as a non-unique indexed column for display/debug lookups — it is no
-- longer the key. `change_pct` (already present, nullable, from Phase 1) is reused as
-- the day-change-percent field; no duplicate column is added for it.
CREATE INDEX IF NOT EXISTS idx_price_cache_symbol ON public.price_cache(symbol);

-- No new price_cache RLS policy is added here: the Phase 1 SELECT policy
-- ("Authenticated users can view price cache") already covers reads, and the Phase 1
-- rls_fixes migration already dropped the permissive authenticated write policy. Writes
-- (whether pg_cron-triggered or user "refresh now"-triggered) go through the
-- service-role admin client only — see plan 03-04.
