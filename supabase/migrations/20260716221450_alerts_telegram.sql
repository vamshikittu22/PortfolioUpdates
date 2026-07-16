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

-- ── telegram_links: one per USER (not per account) ──
-- ALRT-01 says "link their Telegram account"; Phase 7's DGST-02 says the digest
-- "respects their linked Telegram account." Both are user-level concerns — one
-- row per user, one chat per user (the house profiles-table shape, not the
-- account-pivot shape).
CREATE TABLE IF NOT EXISTS public.telegram_links (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    -- Telegram chat ids exceed 32 bits (Bot API: "may have more than 32 significant
    -- bits... at most 52 significant bits") — BIGINT, never INT. 52 bits also fits
    -- JS number's 53-bit mantissa, so supabase-js round-trips it safely.
    chat_id BIGINT,                          -- NULL until the /start handshake completes
    link_token TEXT UNIQUE NOT NULL,         -- random secret; user sends /start <token> to the bot
    token_expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'linked', 'revoked')) DEFAULT 'pending',
    linked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- A chat may back at most one user — prevents one Telegram chat hijacking or
    -- shadowing another user's link. Postgres treats NULLs as distinct in unique
    -- constraints, so many pending (NULL) rows coexist — no partial index needed.
    CONSTRAINT telegram_links_chat_unique UNIQUE (chat_id)
);

ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;

-- User may see their own link status, create a pending link, and unlink.
CREATE POLICY "Users can view their own telegram link" ON public.telegram_links FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own telegram link" ON public.telegram_links FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own telegram link" ON public.telegram_links FOR DELETE USING (auth.uid() = user_id);
-- NO authenticated UPDATE policy — deliberate, this is the allowlist boundary.
-- chat_id/status='linked' are written ONLY by the system (service role) when a
-- /start <token> update arrives from Telegram. A user can therefore never point
-- their alerts at an arbitrary chat_id; the only path to 'linked' is proving
-- control of the chat by sending the token from it. Regenerating a token =
-- DELETE + INSERT via a Server Action (both covered by the policies above).

-- ── notifications_outbox: generic, system-owned, Phase 6/7-ready ──
CREATE TABLE IF NOT EXISTS public.notifications_outbox (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    -- Recipient is a USER, resolved to a chat_id at DISPATCH time via telegram_links.
    -- (Not stored as chat_id at enqueue: if the user unlinks between enqueue and
    -- dispatch, the row fails honestly instead of messaging a revoked chat.)
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    -- All three roadmapped kinds enumerated NOW so Phases 6/7 need no migration.
    kind TEXT NOT NULL CHECK (kind IN ('price_alert', 'news_alert', 'daily_digest')),
    -- Payload contract (enforced in TS, not SQL): payload.text is the fully
    -- pre-rendered message; everything else is audit metadata (alert_id,
    -- instrument_id, price, threshold, ...). Pre-rendering at enqueue is what
    -- keeps the dispatcher 100% kind-agnostic — the Phase 6/7 reuse guarantee.
    payload JSONB NOT NULL,
    dedupe_key TEXT,                          -- NULL allowed (e.g. one-off digests); unique when present
    status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')) DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notifications_outbox ENABLE ROW LEVEL SECURITY;

-- User may read their own notification history (honest observability; future UI).
CREATE POLICY "Users can view their own notifications" ON public.notifications_outbox FOR SELECT USING (auth.uid() = user_id);
-- NO authenticated write policies — writes are service-role only, the exact
-- closed posture of price_cache/fx_cache per the Phase 1 rls_fixes precedent.
-- Do NOT add a permissive write policy.

-- Idempotent enqueue: same partial-unique-index-as-backstop philosophy as
-- Phase 4's uniq_transactions_import_row_hash.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notifications_outbox_dedupe
  ON public.notifications_outbox(dedupe_key) WHERE dedupe_key IS NOT NULL;

-- The dispatcher's working set: due pending rows only.
CREATE INDEX IF NOT EXISTS idx_notifications_outbox_due
  ON public.notifications_outbox(next_attempt_at) WHERE status = 'pending';

-- ── claim_due_notifications: atomic claim with FOR UPDATE SKIP LOCKED ──
-- Why needed at all: two dispatchers CAN run concurrently in this project — the
-- pg_cron-driven refresh route and a user's "Refresh now" Server Action overlap
-- freely. Telegram has no idempotency key on sendMessage, so a double-claim is a
-- double message to the user's phone. supabase-js cannot express
-- SELECT ... FOR UPDATE SKIP LOCKED, so this must be a Postgres function — the
-- 04-01 find_or_create_instrument precedent for exactly this ("supabase-js can't
-- do it, a validated function can").
--
-- Atomically claims up to p_limit due pending rows: bumps attempts and pushes
-- next_attempt_at out by exponential backoff AT CLAIM TIME (pessimistic bump),
-- so a concurrent dispatcher skips them (SKIP LOCKED now, next_attempt_at after
-- commit). A dispatcher crash after claiming simply means the row retries after
-- the backoff — at-least-once, never lost, no 'sending' limbo state.
-- Rows that have exhausted attempts are dead-lettered first, honestly.
CREATE OR REPLACE FUNCTION public.claim_due_notifications(p_limit INT DEFAULT 25)
RETURNS SETOF public.notifications_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Poison handling: anything out of attempts becomes terminal 'failed'.
    UPDATE public.notifications_outbox
       SET status = 'failed',
           last_error = COALESCE(last_error, '') || ' [max attempts exhausted]'
     WHERE status = 'pending' AND attempts >= 8;

    RETURN QUERY
    UPDATE public.notifications_outbox o
       SET attempts = o.attempts + 1,
           -- 2^attempts minutes, capped at 6h: 1m, 2m, 4m, 8m, ... 6h. With the
           -- 3-hourly refresh cadence, most retries effectively mean "next run".
           next_attempt_at = NOW() + LEAST(POWER(2, o.attempts) * INTERVAL '1 minute', INTERVAL '6 hours')
     WHERE o.id IN (
           SELECT id FROM public.notifications_outbox
            WHERE status = 'pending' AND next_attempt_at <= NOW() AND attempts < 8
            ORDER BY created_at
            LIMIT p_limit
            FOR UPDATE SKIP LOCKED
     )
    RETURNING o.*;
END;
$$;

-- System-only: callable by the service role, never by browsers/users. This is
-- stricter than find_or_create_instrument (which authenticated users may call)
-- because claiming is purely a dispatcher concern.
REVOKE ALL ON FUNCTION public.claim_due_notifications(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_due_notifications(INT) FROM anon, authenticated;
