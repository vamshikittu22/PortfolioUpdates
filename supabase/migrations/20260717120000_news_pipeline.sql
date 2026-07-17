-- Phase 6: News Pipeline + Summarization — extends news_items, adds news_item_instruments.
-- NEW migration; edits NO existing migration (house rule: 20260714220333 / 20260716221450 headers).
-- Assumes Phase 1-5 migrations are applied (they sort earlier by timestamp).

-- ── news_items: ALTER only — do NOT drop/recreate ──
-- news_items is applied live with ZERO rows (Phase 1 mock-era, symbol-keyed).
-- ADD COLUMN is safe without a backfill — same argument 20260714220333 made for
-- re-keying price_cache. This migration does NOT touch news_items' RLS policies:
-- the closed posture (authenticated SELECT USING(TRUE); NO authenticated write
-- policy — the hole 20260714032957_rls_fixes.sql deliberately closed) stays
-- byte-for-byte intact. Do NOT add a permissive write policy here.
ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS title_hash TEXT,                 -- NEWS-02 normalized-title dedup key (sha256, set by the ingest writer)
  ADD COLUMN IF NOT EXISTS summary_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (summary_status IN ('pending', 'summarized', 'degraded')),  -- NEWS-04/05 state
  ADD COLUMN IF NOT EXISTS summarized_at TIMESTAMPTZ;       -- when the summary was written; a 'summarized' row is NEVER re-summarized (NEWS-04)

-- NEWS-02 dedup backstop: url is already UNIQUE (initial_schema.sql); title_hash
-- is the second dedup key. Partial-unique so pre-existing/future NULL title_hash
-- rows never collide — same philosophy as uniq_notifications_outbox_dedupe
-- (alerts_telegram.sql) and uniq_transactions_import_row_hash (csv_import.sql).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_news_items_title_hash
  ON public.news_items(title_hash) WHERE title_hash IS NOT NULL;

-- ── news_item_instruments: article <-> instrument join, FK-integrity identity ──
-- Fixes the same pre-Phase-2-identity flaw price_cache was re-keyed for:
-- affected_symbols TEXT[] is bare symbols (INFY-NSE vs INFY-NYSE indistinguishable).
-- This join table is the only shape that supports "one article, many instruments"
-- with FK integrity, per Phase 6 research recommendation.
CREATE TABLE IF NOT EXISTS public.news_item_instruments (
    news_item_id UUID REFERENCES public.news_items(id) ON DELETE CASCADE NOT NULL,
    instrument_id UUID REFERENCES public.instruments(id) ON DELETE CASCADE NOT NULL,
    matched_via TEXT,                        -- optional provenance: 'symbol' | 'company-name' (honest audit of the match rule; nullable)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (news_item_id, instrument_id)
);

ALTER TABLE public.news_item_instruments ENABLE ROW LEVEL SECURITY;

-- Closed posture, deliberate — copied byte-for-byte from news_items' shape.
-- Authenticated SELECT is allowed (portfolio-filtered feed reads); there is NO
-- authenticated write policy. Writes (linking an article to instruments) are
-- service-role only, exactly like price_cache/news_items/notifications_outbox.
-- Do NOT add a permissive write policy.
CREATE POLICY "Authenticated users can view news_item_instruments" ON public.news_item_instruments FOR SELECT USING (TRUE);

-- Helper index: the read path filters by the user's held/watched instrument_ids.
-- The composite PK (news_item_id, instrument_id) already covers news_item_id lookups.
CREATE INDEX IF NOT EXISTS idx_news_item_instruments_instrument_id ON public.news_item_instruments(instrument_id);
