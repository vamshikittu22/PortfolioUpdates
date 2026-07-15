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
