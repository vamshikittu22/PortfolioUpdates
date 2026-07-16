-- Phase 5: Alerts + Telegram — price alerts, Telegram links, notifications outbox.
-- NEW migration; edits NO existing migration (house rule: 20260714220333 header).
-- Assumes Phase 1/2/3 migrations are applied (they sort earlier by timestamp).

-- Legacy Phase-1 alerts table: symbol-keyed, no cooldown, never written (the
-- /alerts page renders alerts={[]}, no write path exists). Superseded by the
-- instrument-identity price_alerts below. Same drop-and-replace precedent as
-- 20260714160803_watchlist_instrument_identity.sql dropping holdings.
DROP TABLE IF EXISTS public.alerts;

CREATE TABLE IF NOT EXISTS public.price_alerts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID REFERENCES public.investment_accounts(id) ON DELETE CASCADE NOT NULL,
    instrument_id UUID REFERENCES public.instruments(id) ON DELETE CASCADE NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('above', 'below')),
    threshold NUMERIC NOT NULL CHECK (threshold > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    cooldown_minutes INT NOT NULL DEFAULT 1440 CHECK (cooldown_minutes >= 60),
    last_triggered_at TIMESTAMPTZ,          -- cooldown anchor; written ONLY by the evaluator (service role)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (account_id, instrument_id, direction)
);

ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;

-- The EXACT four-policy EXISTS-subquery shape from transactions/import_batches
-- (04-RESEARCH Pitfall 7: a subtly different subquery fails only at runtime).
CREATE POLICY "Users can view price_alerts for their accounts" ON public.price_alerts FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = public.price_alerts.account_id AND user_id = auth.uid())
);
CREATE POLICY "Users can insert price_alerts for their accounts" ON public.price_alerts FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = account_id AND user_id = auth.uid())
);
CREATE POLICY "Users can update price_alerts for their accounts" ON public.price_alerts FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = public.price_alerts.account_id AND user_id = auth.uid())
);
CREATE POLICY "Users can delete price_alerts for their accounts" ON public.price_alerts FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = public.price_alerts.account_id AND user_id = auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_price_alerts_account_id ON public.price_alerts(account_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_instrument_id ON public.price_alerts(instrument_id);
-- Evaluator sweep: only active alerts matter.
CREATE INDEX IF NOT EXISTS idx_price_alerts_active ON public.price_alerts(instrument_id) WHERE is_active;
