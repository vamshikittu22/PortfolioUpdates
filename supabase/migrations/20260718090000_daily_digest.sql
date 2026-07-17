-- Phase 7: Daily Digest — user-level opt-in preference (DGST-02).
-- NEW migration; edits NO existing migration (house rule: 20260714220333 header).
-- Assumes Phase 1-6 migrations are applied (they sort earlier by timestamp).
--
-- Why a NEW table, not a column on an existing one (two alternatives considered
-- and REJECTED — do not "fix" this into either):
--   1. telegram_links.digest_enabled — REJECTED. telegram_links rows are DELETE'd
--      and re-INSERT'd on every re-link (see generateTelegramLink in
--      src/server-actions/telegram.ts: "cookie-bound DELETE+INSERT of a fresh
--      pending row"), so a column there would silently reset to its default on
--      every re-link — an honesty bug, not a storage convenience. The table also
--      deliberately has NO authenticated UPDATE policy at all (alerts_telegram.sql
--      :76-81 — "this is the allowlist boundary"); adding one just for this column
--      would puncture that closure for the whole table.
--   2. account_settings.digest_enabled — REJECTED. account_settings is an
--      account-scoped, mock-era table. Every digest concern (ALRT-01's Telegram
--      link, DGST-02's opt-in) is USER-level in this schema, matching
--      telegram_links (user_id PK, not account_id).
-- digest_preferences is therefore its own user-keyed table, same shape as
-- telegram_links (user_id PK -> auth.users), and survives Telegram re-linking
-- untouched because it is a wholly separate row.

CREATE TABLE IF NOT EXISTS public.digest_preferences (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,   -- opt-in: no row == disabled (honest default, DGST-02)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.digest_preferences ENABLE ROW LEVEL SECURITY;

-- Own-row policies, same shape as telegram_links (alerts_telegram.sql:73-75) PLUS
-- an UPDATE policy — allowed here, unlike telegram_links, because a plain boolean
-- preference has no allowlist boundary to protect: toggling it IS the point, and
-- there is no chat_id/status field a malicious update could hijack.
CREATE POLICY "Users can view their own digest preferences" ON public.digest_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own digest preferences" ON public.digest_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own digest preferences" ON public.digest_preferences FOR UPDATE USING (auth.uid() = user_id);
-- NO DELETE policy — the toggle is an upsert (enabled: true/false), never a row
-- delete; "no row" and "row with enabled=false" are both valid disabled states,
-- but the app only ever needs to write the latter via upsert.

-- The digest sweep (07-03/07-04) reads this table with the service role, which
-- bypasses RLS entirely — no additional service-role policy is needed for that.

-- Do NOT touch notifications_outbox in any way: its kind CHECK already enumerates
-- 'daily_digest' (alerts_telegram.sql:90-91 — "All three roadmapped kinds
-- enumerated NOW so Phases 6/7 need no migration"). Extending it here would be
-- wrong by construction.
