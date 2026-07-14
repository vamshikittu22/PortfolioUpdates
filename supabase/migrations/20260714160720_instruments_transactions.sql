-- Phase 2: Instrument master (ISIN + exchange identity) + transactions ledger.
-- Roadmap decision: instrument identity = ISIN + exchange (e.g. INFY on NSE vs
-- NYSE are distinct rows). Holdings are DERIVED from this ledger in application
-- code (src/lib/portfolio/derive-holdings.ts, plan 02-02) — there is no holdings
-- snapshot table (the Phase 1 one is dropped in the next migration).

CREATE TABLE IF NOT EXISTS public.instruments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    isin TEXT NOT NULL,
    symbol TEXT NOT NULL,
    exchange TEXT NOT NULL CHECK (exchange IN ('NSE', 'BSE', 'NASDAQ', 'NYSE', 'OTHER')),
    display_name TEXT NOT NULL,
    asset_type TEXT NOT NULL CHECK (asset_type IN ('stocks', 'etf', 'crypto')) DEFAULT 'stocks',
    currency TEXT NOT NULL CHECK (currency IN ('INR', 'USD')),
    price_source_symbol TEXT NOT NULL, -- e.g. 'INFY.NS', 'TATASTEEL.BO', 'AAPL'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (isin, exchange)
);

ALTER TABLE public.instruments ENABLE ROW LEVEL SECURITY;

-- Shared, read-only reference table (same pattern as price_cache/news_items):
-- any authenticated user may SELECT. No authenticated INSERT/UPDATE/DELETE
-- policy is created — writes are service-role only. This is intentional, not
-- an oversight; do not add a permissive write policy here.
CREATE POLICY "Authenticated users can view instruments" ON public.instruments
  FOR SELECT TO authenticated USING (TRUE);

CREATE INDEX IF NOT EXISTS idx_instruments_symbol_exchange ON public.instruments(symbol, exchange);
CREATE INDEX IF NOT EXISTS idx_instruments_isin ON public.instruments(isin);


CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID REFERENCES public.investment_accounts(id) ON DELETE CASCADE NOT NULL,
    instrument_id UUID REFERENCES public.instruments(id) ON DELETE RESTRICT NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('BUY', 'SELL', 'SPLIT', 'BONUS')),
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    price NUMERIC CHECK (price IS NULL OR price >= 0), -- NULL for SPLIT/BONUS (no cash flow)
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT price_required_for_buy_sell CHECK (
      (transaction_type IN ('BUY','SELL') AND price IS NOT NULL) OR
      (transaction_type IN ('SPLIT','BONUS') AND price IS NULL)
    )
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view transactions for their accounts" ON public.transactions FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = public.transactions.account_id AND user_id = auth.uid())
);
CREATE POLICY "Users can insert transactions for their accounts" ON public.transactions FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = account_id AND user_id = auth.uid())
);
CREATE POLICY "Users can update transactions for their accounts" ON public.transactions FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = public.transactions.account_id AND user_id = auth.uid())
);
CREATE POLICY "Users can delete transactions for their accounts" ON public.transactions FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = public.transactions.account_id AND user_id = auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON public.transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_instrument_id ON public.transactions(instrument_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_instrument ON public.transactions(account_id, instrument_id);
