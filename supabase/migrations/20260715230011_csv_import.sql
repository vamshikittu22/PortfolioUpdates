-- Phase 4: CSV import — batch tracking, symbol-mapping persistence, per-row
-- idempotency, and a controlled instrument-creation path. NEW migration; does
-- NOT edit any existing migration. Assumes Phase 2's investment_accounts/
-- instruments/transactions and Phase 3's price_fx_schema are already applied
-- (they sort earlier by timestamp).

-- ── import_batches: one row per committed import (audit trail + idempotency anchor) ──
CREATE TABLE IF NOT EXISTS public.import_batches (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID REFERENCES public.investment_accounts(id) ON DELETE CASCADE NOT NULL,
    broker TEXT NOT NULL CHECK (broker IN ('groww', 'robinhood')),
    file_name TEXT NOT NULL,
    file_hash TEXT NOT NULL,          -- sha256 hex; powers the "already imported on DATE" banner. Deliberately NOT unique (see 04-RESEARCH Pattern 2).
    row_count INT NOT NULL,
    imported_count INT NOT NULL DEFAULT 0,
    skipped_count INT NOT NULL DEFAULT 0,
    duplicate_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

-- Account-ownership RLS — the EXACT EXISTS-subquery shape from the transactions
-- migration (04-RESEARCH Pitfall 7: a subtly different subquery fails only at runtime).
CREATE POLICY "Users can view import_batches for their accounts" ON public.import_batches FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = public.import_batches.account_id AND user_id = auth.uid())
);
CREATE POLICY "Users can insert import_batches for their accounts" ON public.import_batches FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = account_id AND user_id = auth.uid())
);
CREATE POLICY "Users can update import_batches for their accounts" ON public.import_batches FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = public.import_batches.account_id AND user_id = auth.uid())
);
CREATE POLICY "Users can delete import_batches for their accounts" ON public.import_batches FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = public.import_batches.account_id AND user_id = auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_import_batches_account_id ON public.import_batches(account_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_account_filehash ON public.import_batches(account_id, file_hash);

-- ── symbol_mappings: remembered broker-symbol → instrument resolutions (auto-applied on re-import) ──
CREATE TABLE IF NOT EXISTS public.symbol_mappings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID REFERENCES public.investment_accounts(id) ON DELETE CASCADE NOT NULL,
    broker TEXT NOT NULL CHECK (broker IN ('groww', 'robinhood')),
    broker_symbol TEXT NOT NULL,
    instrument_id UUID REFERENCES public.instruments(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (account_id, broker, broker_symbol)
);

ALTER TABLE public.symbol_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view symbol_mappings for their accounts" ON public.symbol_mappings FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = public.symbol_mappings.account_id AND user_id = auth.uid())
);
CREATE POLICY "Users can insert symbol_mappings for their accounts" ON public.symbol_mappings FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = account_id AND user_id = auth.uid())
);
CREATE POLICY "Users can update symbol_mappings for their accounts" ON public.symbol_mappings FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = public.symbol_mappings.account_id AND user_id = auth.uid())
);
CREATE POLICY "Users can delete symbol_mappings for their accounts" ON public.symbol_mappings FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = public.symbol_mappings.account_id AND user_id = auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_symbol_mappings_lookup ON public.symbol_mappings(account_id, broker, broker_symbol);

-- ── transactions: import provenance + per-row idempotency backstop ──
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS import_row_hash TEXT;

-- Partial unique index: two imported rows with the same normalized identity in the
-- same account cannot both exist (idempotent re-import). Manual transactions
-- (import_row_hash IS NULL) are entirely unaffected — the index is partial.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_transactions_import_row_hash
  ON public.transactions(account_id, import_row_hash)
  WHERE import_row_hash IS NOT NULL;

-- Why file_hash is NOT unique: enforcement lives at the row level where duplication
-- actually matters (the partial index above); a unique file hash would break the
-- orphan-batch compensation edge case (batch row written, transaction insert failed
-- then rolled back) and adds nothing the row constraint doesn't already guarantee.
-- The file hash powers only the "this exact file was imported on DATE" banner.

-- ── find_or_create_instrument: controlled write path into the closed instruments table ──
-- The instruments migration deliberately creates NO authenticated write policy (writes
-- are service-role only) and 04-RESEARCH forbids the admin client in import Server
-- Actions (Phase 2 discipline). A SECURITY DEFINER function is the standard Supabase
-- pattern for exactly this: it runs as the function owner (bypassing RLS for its single,
-- validated insert) while the caller stays an ordinary authenticated user. It validates
-- every input against the same CHECK domains the table enforces, derives
-- price_source_symbol by the seed-data / Phase-3 Yahoo convention, and is idempotent via
-- ON CONFLICT (isin, exchange). This is a controlled write path, NOT a permissive policy —
-- the table's RLS posture stays closed.
CREATE OR REPLACE FUNCTION public.find_or_create_instrument(
    p_isin TEXT,
    p_symbol TEXT,
    p_exchange TEXT,
    p_display_name TEXT,
    p_currency TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
    v_price_source_symbol TEXT;
BEGIN
    -- Validate inputs against the instruments table's own CHECK domains — fail loudly,
    -- never fabricate. ISIN is the project's hardest-to-reverse identity decision.
    IF p_isin !~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$' THEN
        RAISE EXCEPTION 'Invalid ISIN: %', p_isin;
    END IF;
    IF p_exchange NOT IN ('NSE','BSE','NASDAQ','NYSE','OTHER') THEN
        RAISE EXCEPTION 'Invalid exchange: %', p_exchange;
    END IF;
    IF p_currency NOT IN ('INR','USD') THEN
        RAISE EXCEPTION 'Invalid currency: %', p_currency;
    END IF;

    -- Already present? Return it (idempotent; handles the dual-listing (isin,exchange) key).
    SELECT id INTO v_id FROM public.instruments WHERE isin = p_isin AND exchange = p_exchange;
    IF v_id IS NOT NULL THEN
        RETURN v_id;
    END IF;

    -- Derive price_source_symbol by the same convention as the seed data / Phase 3:
    --   NSE → SYMBOL.NS,  BSE → SYMBOL.BO,  US (NASDAQ/NYSE/OTHER) → SYMBOL
    v_price_source_symbol := CASE p_exchange
        WHEN 'NSE' THEN p_symbol || '.NS'
        WHEN 'BSE' THEN p_symbol || '.BO'
        ELSE p_symbol
    END;

    INSERT INTO public.instruments (isin, symbol, exchange, display_name, asset_type, currency, price_source_symbol)
    VALUES (p_isin, p_symbol, p_exchange, p_display_name, 'stocks', p_currency, v_price_source_symbol)
    ON CONFLICT (isin, exchange) DO NOTHING
    RETURNING id INTO v_id;

    -- ON CONFLICT DO NOTHING skips RETURNING when a concurrent insert won the race — re-read.
    IF v_id IS NULL THEN
        SELECT id INTO v_id FROM public.instruments WHERE isin = p_isin AND exchange = p_exchange;
    END IF;

    RETURN v_id;
END;
$$;

-- Only authenticated users may call it; PUBLIC (anon) may not. The function's own body
-- is the trust boundary — it will only ever insert a fully-validated instrument row.
REVOKE ALL ON FUNCTION public.find_or_create_instrument(TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_or_create_instrument(TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;
