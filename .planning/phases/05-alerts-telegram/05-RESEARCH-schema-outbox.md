# Phase 5: Alerts + Telegram — Research (Slice: Schema + Outbox/Dispatch)

**Researched:** 2026-07-16
**Domain:** Postgres schema design (Supabase RLS house style), transactional-outbox dispatch architecture, alert evaluation semantics
**Confidence:** HIGH on project patterns (read from actual code/migrations); HIGH on Telegram rate limits (official FAQ fetched); MEDIUM on `retry_after` field shape (official docs, not re-verified this session)
**Scope note:** This is one of three parallel research files for Phase 5. It covers ONLY schema + outbox/dispatch. The Telegram bot handshake mechanics (webhook vs polling, /start deep-link flow) and the alerts UI are sibling files' scope — this file defines only the tables and the write-ownership boundaries they must respect.

No `05-CONTEXT.md` exists yet (`.planning/phases/05-alerts-telegram/` was empty at research time), so there are no locked user decisions to copy — everything below is a recommendation for the planner, constrained by the house patterns cited.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ALRT-01 | Telegram link via bot `/start` handshake; chat id captured, allowlisted | `telegram_links` DDL (user-keyed, token handshake columns, closed UPDATE posture = allowlist enforcement); RLS matrix row |
| ALRT-02 | Per-ticker threshold up/down alerts | `price_alerts` DDL (instrument_id FK, direction CHECK, UNIQUE per direction); drop-and-replace plan for the legacy Phase 1 `alerts` table |
| ALRT-03 | Cooldown so a triggered alert does not repeat every refresh | Level+cooldown prescription (`last_triggered_at` + per-alert `cooldown_minutes`, default 1440); edge-detection explicitly deferred with rationale |
| ALRT-05 | Outbox written + dispatched separately; failure retries next run, never lost | `notifications_outbox` DDL (generic kind/payload/dedupe_key), enqueue-first ordering, claim RPC with `FOR UPDATE SKIP LOCKED`, piggyback dispatch on the existing refresh cadence |
</phase_requirements>

## Summary

The project already has every pattern Phase 5 needs — nothing here requires new invention, only assembly. The house gives us: account-ownership RLS via the exact EXISTS-subquery shape (`transactions`, `import_batches` — read from migrations), closed shared-table write posture with service-role-only writes (`price_cache`/`fx_cache` per `rls_fixes` + `price_fx_schema`), SECURITY DEFINER RPCs as controlled write paths (`find_or_create_instrument`, 04-01), a destructive re-key precedent for empty legacy tables (`watchlist_instrument_identity.sql` dropped `holdings` and re-keyed `watchlist_items`), and a dual-entry orchestration precedent where a secret-guarded route and an auth-gated Server Action both call one function with an admin client (`refreshAllPrices`, read from `refresh-service.ts` / `prices.ts` / `route.ts`).

Three new tables in ONE new migration: `telegram_links` (user-keyed, handshake token, chat_id written only by system code — that closed posture IS the allowlist), `price_alerts` (replacing the empty legacy Phase 1 `alerts` table, instrument_id-keyed with cooldown state), and `notifications_outbox` (payload-generic with `kind` + `payload jsonb` + `dedupe_key`, explicitly designed so Phases 6/7 enqueue without schema changes). Dispatch is a `dispatchOutbox(admin)` function with its own secret-guarded route, ALSO called at the tail of both existing price-refresh entry points — so "retries on the next run" is literally the next 3-hourly refresh or the next "Refresh now" click, with zero new cron infrastructure (no new held-back cron migration in Phase 5).

The honest atomicity boundary is per-statement (supabase-js has no cross-call transactions — same finding as 04-RESEARCH). The design absorbs this the same way Phase 4 did: a partial unique index (`dedupe_key`) is the idempotency backstop, and write ordering (enqueue outbox row FIRST, then update `last_triggered_at`) guarantees never-lost at the cost of a dedupe-suppressed duplicate — which matches ALRT-05's wording ("never lost") exactly. Concurrent dispatchers are real here (pg_cron refresh + user's Refresh-now can overlap), so row claiming uses a small `claim_due_notifications` Postgres function with `FOR UPDATE SKIP LOCKED` — service-role-only, following the 04-01 RPC precedent.

**Primary recommendation:** One migration (3 tables + 1 claim function), pure-TS alert evaluation TDD'd like `ingest.ts`, enqueue-first writes with deterministic dedupe keys, dispatch piggybacked on the existing refresh flow plus a standalone secret-guarded route.

## Proposed DDL Sketches

### Migration file: `supabase/migrations/<ts>_alerts_telegram.sql` (single new file, edits no existing migration — house rule)

#### 1. Drop the legacy `alerts` table, create `price_alerts`

The Phase 1 `initial_schema.sql` created an `alerts` table keyed by free-text `symbol` with alert types (`sentiment_change`, `news_spike`) that belong to Phase 6+, no cooldown state, and the older single-`FOR ALL`-policy style. It is EMPTY on the live DB — verified by reading `src/app/(dashboard)/alerts/page.tsx`, which passes `alerts={[]}` and has no write path anywhere in the app (STATE.md: the fabricated `badge: 3` was removed in 3e6d0e5). Precedent for drop-and-replace of an empty superseded table: `20260714160803_watchlist_instrument_identity.sql` dropped `public.holdings` outright and destructively re-keyed `watchlist_items` for exactly this situation. Follow it.

```sql
-- Legacy Phase 1 alerts table: symbol-keyed, no cooldown state, never written
-- (Alerts UI renders an honest empty state — no data exists live). Superseded
-- by instrument-identity price_alerts below; same precedent as dropping
-- holdings in the watchlist re-key migration.
DROP TABLE IF EXISTS public.alerts;

CREATE TABLE IF NOT EXISTS public.price_alerts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID REFERENCES public.investment_accounts(id) ON DELETE CASCADE NOT NULL,
    instrument_id UUID REFERENCES public.instruments(id) ON DELETE CASCADE NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('above', 'below')),
    threshold NUMERIC NOT NULL CHECK (threshold > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    cooldown_minutes INT NOT NULL DEFAULT 1440 CHECK (cooldown_minutes >= 60),
    last_triggered_at TIMESTAMPTZ,           -- cooldown anchor; written ONLY by the evaluator (service role)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (account_id, instrument_id, direction)  -- at most one 'above' + one 'below' per instrument per account
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
```

Notes for the planner:
- `UNIQUE (account_id, instrument_id, direction)` makes the Server Action an upsert-or-reject and prevents alert spam. If the sibling UI research wants multiple thresholds per direction, relax to `UNIQUE (account_id, instrument_id, direction, threshold)` — decide once, in this migration.
- `last_triggered_at` lives on the alert row (not a separate table) — the cooldown is per-alert state, and the evaluator writes it with the admin client, which bypasses RLS, so no extra policy is needed. Users CAN technically update it via the UPDATE policy (their own row, self-harm only); not worth a column-level restriction.
- The migration ALTERs a live-applied schema (Phase 1+2 migrations ARE applied to project `ozkorwkhtamyaavuphhm` per STATE.md), so the `DROP TABLE` comment must state the emptiness argument, as the watchlist migration did. Also note: `rls_fixes.sql` created `idx_alerts_account_id`; it drops with the table — no action needed.
- Live-apply is consent-gated per house process (03-01/04-01 precedent) — this migration sits in the repo until the phase's live checkpoint. CAUTION carried from STATE.md: a blanket `supabase db push` would also apply the deliberately-held-back `price_refresh_cron.sql` — push selectively.

#### 2. `telegram_links` — one per USER (not per account)

ALRT-01 says "link their Telegram account"; Phase 7's DGST-02 says the digest "respects their linked Telegram account." Both are user-level concerns. The house user-level table is `profiles` (`id UUID REFERENCES auth.users(id) PRIMARY KEY`) — follow that shape, not the account-pivot shape. One row per user, one chat per user.

```sql
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
    -- shadowing another user's link. Partial: NULLs (pending links) don't collide.
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
```

Notes:
- The allowlist requirement (ALRT-01 "chat id captured, allowlisted") is satisfied structurally: dispatch resolves recipients ONLY through `telegram_links WHERE status = 'linked' AND chat_id IS NOT NULL`. There is no separate allowlist table — the closed UPDATE posture makes this table the allowlist. Optionally add a defense-in-depth env allowlist (`TELEGRAM_ALLOWED_CHAT_IDS`) checked in the handshake handler for this single-user app; planner's call, not schema.
- Who writes `chat_id`: the Telegram update handler (sibling research's scope — webhook route or polling), which runs with the admin client behind a Telegram-side secret (webhook `secret_token`) or as a server-only poller. Schema-side, all this file needs to guarantee is: no authenticated write can set `chat_id`. It does.
- `UNIQUE (chat_id)`: Postgres treats NULLs as distinct in unique constraints, so many pending (NULL) rows coexist — no partial index needed.

#### 3. `notifications_outbox` — generic, system-owned, Phase 6/7-ready

```sql
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
```

Status semantics (keep exactly three — resist adding 'sending'):
- `pending` — awaiting dispatch OR awaiting retry (`next_attempt_at` in the future). Retryable failures STAY `pending` with `attempts` bumped and `last_error` recorded — this is what makes "retries next run" automatic.
- `sent` — delivered (Telegram API returned ok). Terminal.
- `failed` — dead-letter: permanent Telegram error (403 bot-blocked, 400 chat-not-found) or `attempts` exhausted. Terminal, kept for inspection, never auto-deleted or auto-retried. This is the poison-message answer.

A `sending` state is unnecessary because claiming bumps `next_attempt_at` forward (see claim function below) — a crash mid-send self-heals into a retry after the backoff window, with no stuck-state sweeper needed.

#### 4. `claim_due_notifications` — atomic claim with `FOR UPDATE SKIP LOCKED`

Why needed at all: two dispatchers CAN run concurrently in this project — the pg_cron-driven refresh route and a user's "Refresh now" Server Action overlap freely (the 60s `shouldSkipRefresh` guard dedups price FETCHES per instrument, not whole runs — read from `ingest.ts`/`refresh-service.ts`). Telegram has no idempotency key on `sendMessage`, so a double-claim is a double message to the user's phone. supabase-js cannot express `SELECT ... FOR UPDATE SKIP LOCKED`, so this must be a Postgres function — the 04-01 `find_or_create_instrument` precedent for exactly this ("supabase-js can't do it, a validated function can").

```sql
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
```

(Called via the admin client, `SECURITY DEFINER` is belt-and-braces rather than load-bearing; keep it plus the REVOKEs so the grant posture is self-documenting, matching 04-01's comment style.)

## Dispatch Architecture Decision

### Decision: piggyback on the refresh flow AND expose a standalone secret-guarded route — no new cron migration in Phase 5

**Shape (all in `src/lib/notifications/`):**

1. `enqueueNotifications(admin, rows)` — thin insert with `ON CONFLICT (dedupe_key) DO NOTHING` semantics (supabase-js: `.upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true })`).
2. `dispatchOutbox(admin)` — the ONLY code that talks to the Telegram send API:
   - `claim_due_notifications(25)` via `admin.rpc(...)`
   - batch-resolve recipients: `telegram_links WHERE user_id IN (...) AND status = 'linked' AND chat_id IS NOT NULL`
   - per row: `sendMessage(chat_id, payload.text)` →
     - success → `status='sent', sent_at=now(), last_error=null`
     - HTTP 429 → leave `pending`, overwrite `next_attempt_at = now() + parameters.retry_after` seconds (honest, API-provided), record `last_error`
     - 403 (bot blocked) / 400 (chat not found) → `status='failed'`, record `last_error`; optionally flip the `telegram_links` row to `revoked` (recommended — keeps the allowlist honest)
     - network/5xx → leave `pending` (claim already bumped backoff), record `last_error`
     - no linked chat → `status='failed'`, `last_error='no linked telegram chat'` (honest, visible; do not retry what can't succeed)
   - returns a `DispatchSummary` (claimed/sent/retried/failed) mirroring `RefreshSummary`'s shape.
3. Route `POST /api/notifications/dispatch` — clones the `/api/prices/refresh` structure exactly (read from `route.ts`): reuse the pure `isAuthorizedRefreshRequest(authHeader, process.env.NOTIFY_DISPATCH_SECRET ?? '')` predicate BEFORE any Supabase construction. Separate secret env var (`NOTIFY_DISPATCH_SECRET`), same guard function — its empty-secret-always-rejects property is already TDD'd.
4. Piggyback: at the tail of BOTH existing refresh entry points (the refresh route and `refreshPricesNow`), after `refreshAllPrices` returns: run `evaluateAndEnqueueAlerts(admin)` then `dispatchOutbox(admin)`, each wrapped so their failure NEVER fails the price refresh response (record and report in the JSON summary instead). Do NOT modify `refreshAllPrices` itself — it is Phase 3's proven-live single write path for price_cache/fx_cache (STATE.md cleared-item 10); keep its contract untouched and compose at the call sites, or introduce a `refreshAndNotify(admin)` wrapper both entry points call. Planner picks; composing at call sites is the smaller diff (2 files), a wrapper avoids drift between them.

**Why this beats the alternatives:**

- *"Retries on the next run" becomes literal with zero new infrastructure.* The next run IS the next 3-hourly pg_cron refresh (once deployed) or the next manual "Refresh now" / manual dispatch-route curl (locally, today). Nothing new to schedule, nothing new to hold back.
- *No second held-back cron migration.* `price_refresh_cron.sql` is already a deploy-gated foot-gun sitting in the migrations dir (STATE.md STILL-OPEN items 1–2, and the "blanket db push" caution). A `notifications_dispatch_cron.sql` would double that hazard for zero local benefit — locally it can never fire anyway (no public URL). If, at deploy time, alert latency independent of price refresh is wanted, add the cron THEN, pointing at the standalone dispatch route that already exists. Phase 7's digest needs its own daily cron regardless — that's the natural moment.
- *The standalone route is still essential*: it is the manual retry lever ("a message failed, dispatch now without waiting 3h / re-fetching prices"), the local verification path for the phase checkpoint, and the future cron target. It also lets Phase 6 (news ingest job) and Phase 7 (digest composer) enqueue rows and then trigger dispatch without touching the price pipeline.
- *Latency is right by construction*: alerts are evaluated against prices fetched milliseconds earlier in the same request, then dispatched in the same request — a triggered alert reaches Telegram within seconds of the refresh that caused it.
- Batch cap 25 per claim bounds serverless invocation duration (Telegram global limit ~30 msg/s, ≤20/min per group, ~1/s per chat — for this single-user app volumes are trivially inside all of these; the cap is for function-duration hygiene, and STATE.md already flags Vercel Hobby duration as a deploy-time verification item).

### Atomicity: the honest boundary and the enqueue-first rule

**Honest statement:** every supabase-js call is its own transaction; there is no way to wrap "update `last_triggered_at`" and "insert outbox row" in one transaction from TS (same constraint 04-04 faced, which it solved with a compensating delete). The classic same-transaction outbox is available only by pushing the whole evaluation into a plpgsql RPC.

**Prescription — enqueue-first, dedupe-backstopped (no RPC needed for the write pair):**

1. INSERT the outbox row FIRST (with deterministic `dedupe_key`, `ignoreDuplicates`).
2. THEN update `price_alerts.last_triggered_at` (a compare-and-set: `.update({last_triggered_at: nowIso}).eq('id', alertId)` — plain update is fine since the evaluator is the only writer of this column).

Failure analysis (this ordering is chosen because ALRT-05 says "never lost"):
- Crash between 1 and 2 → next run re-evaluates (cooldown still open), re-attempts enqueue, hits `uniq_notifications_outbox_dedupe` → suppressed → retries the `last_triggered_at` update. Nothing lost, no duplicate message.
- Reverse ordering would risk the opposite: cooldown stamped, enqueue lost → alert silently swallowed for a whole cooldown window. Rejected.

**Deterministic dedupe_key:** `price_alert:{alert_id}:{floor(epoch_seconds / (cooldown_minutes*60))}` — the cooldown-window bucket. Identical across re-runs within one window (that's what makes the crash-recovery above dedupe correctly) and naturally different in the next window (allowing the next legitimate fire). Known imperfection: a crossing straddling a bucket boundary can fire in two adjacent windows ~back-to-back once; acceptable, document in code. Phase 6 news alerts will use `news_alert:{user_id}:{news_item_url_hash}`; Phase 7 digest `daily_digest:{user_id}:{YYYY-MM-DD}` — the column design already accommodates both, which is the payload-generic guarantee this phase must deliver.

**Alternative considered — single set-based `evaluate_price_alerts()` RPC** (one INSERT...SELECT + UPDATE in one true transaction): genuinely atomic and race-free, but it moves threshold/cooldown/message-rendering logic into SQL, unreachable by the house TDD style (pure TS modules + `node:assert/strict` scripts — `ingest.ts`, `derive-holdings.ts`, `pnl-calculator.ts` all chose TS purity). The enqueue-first + dedupe design achieves the same net guarantees with testable TS. Use the RPC route only if the planner decides duplicate suppression must be airtight rather than backstopped.

**Ordering guarantees (honest):** claim orders by `created_at`, so first-attempt dispatch is approximately FIFO; a retried row can deliver after a younger row. For price alerts/news/digest this is irrelevant — do not build per-chat sequencing. Documented, not engineered.

## Alert Evaluation: Where and How

### Where: a separate evaluation pass reading `price_cache`, immediately after `refreshAllPrices`, in the same request

- NOT inside `refreshAllPrices`' per-instrument loop: that function is the proven-live single write path for price/fx (Decisions log, 03-04) and its contract ("accepts admin client, writes caches, returns summary") should stay frozen. Evaluation composes AFTER it at the two call sites (or via one wrapper — see above).
- Evaluation reads `price_cache` (not the in-flight fetch results) so it also works when invoked standalone, and so its inputs are exactly what the user's dashboard shows — one source of truth.
- Module layout mirroring Phase 3 (read from `src/lib/prices/`): `src/lib/alerts/evaluate.ts` — PURE, zero I/O: `evaluateAlerts(alerts: AlertRow[], prices: Map<instrumentId, {price: number|null}>, now: Date) → TriggeredAlert[]` — TDD'd via `scripts/` + `node:assert/strict` like `test:price-pnl`. `src/lib/alerts/sweep.ts` — orchestration: loads active alerts + relevant price_cache rows with the admin client, calls the pure function, enqueue-first writes. Rules the pure function must encode: `price === null` never triggers (never alert on a fabricated/pending price — house cardinal rule); `fetch_error` set but stale price present → still evaluate against the stale price? NO — recommend: skip instruments whose latest refresh attempt failed (`fetch_error IS NOT NULL`), because alerting on a knowingly-stale number contradicts the honesty discipline; document as a boundary in the test.

### Cooldown semantics: level + cooldown (prescribed), NOT edge detection — here's why, concretely

**Prescribed rule:** fire iff `is_active AND price is beyond threshold (direction-wise) AND (last_triggered_at IS NULL OR now - last_triggered_at > cooldown_minutes)`. Default `cooldown_minutes = 1440` (24h), per-alert override, floor 60 (≥ refresh cadence, so "does not repeat every refresh" holds by construction — refresh is 3-hourly).

**Why not edge detection ("only fire on crossing"):** it requires the previous OBSERVED price, which does not exist in this schema — `price_cache` upserts clobber the prior price (read from `refresh-service.ts`), and Yahoo's `previousClose` (which `parseYahooChartResponse` does return) is the previous trading-day close, not the price at the last evaluation — using it would mean day-boundary edge detection, silently missing intraday re-crossings and firing on gap-opens that never crossed during observation. True edge detection needs new state (`last_evaluated_price` per alert, written every sweep for every active alert — N extra writes per run). ALRT-03's literal requirement — "a cooldown so it does not repeat on every refresh" — is fully satisfied by level+cooldown with zero new state beyond `last_triggered_at`. With the 24h default, a persistently-breached threshold re-notifies at most daily, which for a personal portfolio app is arguably a feature (a standing reminder), not a bug.

**Explicitly rejected third option:** one-shot auto-disarm (`is_active=false` after firing). It's the common brokerage UX but contradicts the requirement's cooldown wording; if the UI sibling research wants it, it composes cleanly later (`cooldown` handles repeat suppression now; a "disarm after fire" boolean is a additive column, not a redesign).

## RLS Matrix (table × client × operation)

Client legend (all read from actual code): **cookie** = `@/utils/supabase/server` `createClient()` in Server Actions/RSC (RLS enforced); **admin** = `@/utils/supabase/admin` `createAdminClient()` (bypasses RLS; per `admin.ts`'s warning + `prices.ts` precedent: only in server-only code behind an auth gate or secret guard, never to "make a user query work").

| Table | Operation | Client | Where | Policy backing |
|---|---|---|---|---|
| price_alerts | SELECT own | cookie | alerts page RSC / Server Action | account-ownership EXISTS (SELECT) |
| price_alerts | INSERT/UPDATE/DELETE own (CRUD) | cookie | Server Actions (`requireAuthedContext` pattern from `portfolio.ts`) | account-ownership EXISTS (I/U/D) |
| price_alerts | SELECT all + UPDATE `last_triggered_at` | admin | evaluator sweep (refresh flow / dispatch route) | bypasses RLS (evaluator must see ALL users' alerts — same cross-user rationale as `discoverInstrumentIds`) |
| telegram_links | SELECT own / INSERT own pending / DELETE own | cookie | settings Server Action (generate token, show status, unlink) | `auth.uid() = user_id` policies |
| telegram_links | UPDATE (`chat_id`, `status`, `linked_at`) | admin ONLY | Telegram update handler (secret-guarded route — sibling research's scope) | none — deliberately closed; this closure IS the allowlist |
| telegram_links | SELECT linked recipients | admin | `dispatchOutbox` recipient resolution | bypasses RLS |
| notifications_outbox | SELECT own | cookie | (future notification-history UI; also honest verification) | `auth.uid() = user_id` SELECT policy |
| notifications_outbox | INSERT (enqueue) | admin | evaluator sweep (P5), news matcher (P6), digest composer (P7) | none — closed, service-role only (rls_fixes posture) |
| notifications_outbox | claim + status updates | admin | `dispatchOutbox` via `claim_due_notifications` RPC + `.update()` | RPC revoked from anon/authenticated; RLS bypassed |
| claim_due_notifications (fn) | EXECUTE | admin (service_role) only | `dispatchOutbox` | REVOKE from PUBLIC/anon/authenticated |

Precedent nuance the planner should know (read from code, contradicts a common simplification): the blanket rule "Server Actions never use the admin client" is Phase 2's rule for USER-OWNED data. Phase 3's `refreshPricesNow` Server Action (`src/server-actions/prices.ts`) explicitly constructs the admin client after its own `getUser()` gate, because `price_cache`/`fx_cache` have no authenticated write policy — with a comment justifying it. Phase 5 follows the same split: alert/link CRUD = cookie client (RLS does the work); evaluator/dispatcher/system writes = admin client behind `getUser()` (piggyback path in `refreshPricesNow`) or a secret guard (routes).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Concurrent row claiming | app-level advisory locks / status='sending' + sweeper | `FOR UPDATE SKIP LOCKED` in one plpgsql function | Postgres-native, one statement, no stuck-state janitor; claim-time backoff bump makes crashes self-healing |
| Duplicate-send suppression | "check then insert" in TS | partial unique index on `dedupe_key` + `ignoreDuplicates` upsert | exact Phase 4 `import_row_hash` philosophy — the DB is the backstop, races included |
| Retry timing after Telegram 429 | fixed sleep/guess | `parameters.retry_after` from the 429 response body | the API tells you the honest wait; fabricating one violates house discipline |
| Message queue | Redis/BullMQ/etc. | the outbox table itself | single-user scale, no extra infra exists (no Docker), and the roadmap explicitly reuses this table in P6/P7 |

## Common Pitfalls

1. **`chat_id` as INT/JS-unsafe handling** — Telegram ids exceed 32 bits (up to 52 significant bits per Bot API docs). Use BIGINT; 52 bits round-trips through JS numbers safely, but never `parseInt` from a truncated source. *(MEDIUM-HIGH: official Bot API field docs, not re-fetched this session.)*
2. **Stamping cooldown before enqueue** — silently swallows an alert for a whole cooldown window on partial failure. Enqueue-first is the rule; it's directly derived from ALRT-05's "never lost."
3. **Evaluating against fabricated/failed prices** — `price IS NULL` rows and `fetch_error`-flagged rows must be excluded by the pure evaluator; encode as explicit test cases.
4. **Adding a permissive write policy to `notifications_outbox` "to make the Server Action work"** — the exact hole `rls_fixes.sql` closed on price_cache. System writes go through the admin client, full stop.
5. **A second held-back cron migration** — doubles the "blanket `supabase db push` applies the wrong thing" hazard already flagged in STATE.md. Phase 5 needs no cron; dispatch rides the refresh cadence.
6. **Letting dispatch failure fail the price refresh** — the piggybacked evaluate+dispatch must be wrapped; a Telegram outage must never make `/api/prices/refresh` return 500 (pg_cron would then record price refresh as failing when prices actually succeeded).
7. **RLS subquery drift** — copy the EXISTS shape verbatim from `import_batches` (04-RESEARCH Pitfall 7: subtly different subqueries fail only at runtime). Extend `scripts/rls-isolation-test.ts` for all three new tables, as 04-01 did.
8. **Testing `claim_due_notifications` concurrency locally** — impossible without a live DB (no Docker). The function's SQL is reviewable statically; live SKIP LOCKED behavior joins the phase checkpoint's deferred list, matching the 03-06/04-07 precedent. Say so honestly in the plan.

## Open Questions (for planner / user)

1. **One alert per (instrument, direction) or many?** DDL above says one (UNIQUE constraint). If the UI research wants stacked thresholds (alert at 100, another at 110), relax the constraint NOW — it's a one-line difference in this migration vs. a new migration later.
2. **Default cooldown value** — 24h prescribed here; genuinely a taste decision (user discussion candidate). Floor of 60 min is the structural part (must exceed refresh cadence... actually cadence is 180 min; a 60-min floor still can't repeat every refresh since evaluation only runs at refresh time — the floor is belt-and-braces).
3. **On Telegram 403 (user blocked the bot): auto-revoke the link?** Recommended yes (flip `telegram_links.status='revoked'`), keeps the allowlist honest; but it means a user who unblocks must re-handshake. Minor UX call.
4. **`NOTIFY_DISPATCH_SECRET` vs reusing `PRICE_REFRESH_SECRET`** — separate var prescribed (independent rotation, least privilege); reuse would be one less env entry. Trivial either way; decide in the plan, add to `.env.local` labeled-placeholder discipline.
5. **Does the evaluator run for ALL users' alerts in one sweep?** Yes as designed (admin client, cross-user — same as `discoverInstrumentIds`' rationale). Single-user today, but the code shouldn't assume it.

## Sources

### Primary (HIGH confidence — actual project files read this session)
- `supabase/migrations/20260714032952_initial_schema.sql` — legacy `alerts` table shape, `profiles` user-keyed pattern, `investment_accounts` pivot, older FOR-ALL policy style
- `supabase/migrations/20260714032957_rls_fixes.sql` — closed-write posture for shared tables; RLS-subquery index discipline
- `supabase/migrations/20260714160720_instruments_transactions.sql` — the canonical four-policy EXISTS-subquery account-ownership shape
- `supabase/migrations/20260714160803_watchlist_instrument_identity.sql` — drop/re-key precedent for empty superseded tables
- `supabase/migrations/20260714220333_price_fx_schema.sql` — nullable-price honesty pattern; "do NOT add a permissive write policy" comment style
- `supabase/migrations/20260714220438_price_refresh_cron.sql` — deploy-gated cron precedent + settings-not-secrets pattern
- `supabase/migrations/20260715230011_csv_import.sql` — SECURITY DEFINER RPC precedent, partial-unique-index idempotency backstop, grant/revoke posture
- `src/lib/prices/refresh-service.ts`, `src/lib/prices/ingest.ts` — orchestration shape, `shouldSkipRefresh` scope (per-instrument, not per-run), `isAuthorizedRefreshRequest` reuse target
- `src/app/api/prices/refresh/route.ts` — secret-guard-before-Supabase route pattern to clone
- `src/server-actions/prices.ts` — the auth-gated-Server-Action-with-admin-client precedent (nuances the "never admin in actions" rule)
- `src/server-actions/portfolio.ts` — `requireAuthedContext` cookie-client CRUD pattern
- `src/utils/supabase/admin.ts` — admin-client usage contract (warning comment)
- `src/app/(dashboard)/alerts/page.tsx` — confirms `alerts={[]}`, no live coupling to legacy table
- `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md` — phase scope, live-DB state, deploy-gated cautions, ALRT-0x wording

### Secondary (HIGH/MEDIUM — external, fetched this session)
- https://core.telegram.org/bots/faq — rate limits verified 2026-07-16: ~1 msg/s per chat, ≤20 msg/min per group, ~30 msg/s bulk; 429 on breach (HIGH — official, fetched)
- https://core.telegram.org/bots/api — `ResponseParameters.retry_after` on 429; chat id "up to 52 significant bits" BIGINT guidance (MEDIUM-HIGH — official docs, from training knowledge of a stable API surface, not re-fetched; verify field name during implementation)
- PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED` (postgresql.org/docs — locking clause): standard queue-claim idiom since PG 9.5 (HIGH — stable core feature)

## Metadata

**Confidence breakdown:**
- Schema/RLS design: HIGH — every shape is copied from a migration already applied or authored in this repo
- Dispatch architecture: HIGH — composition of proven in-repo patterns; the only novel SQL (`claim_due_notifications`) uses a decades-stable Postgres idiom, though its live concurrency behavior is checkpoint-deferred like all live verification in this project
- Cooldown prescription: HIGH on mechanism, MEDIUM on the 24h default (taste, flagged as open question)
- Telegram API details: HIGH on rate limits (fetched), MEDIUM-HIGH on `retry_after`/chat-id-width (official but not re-fetched)

**Research date:** 2026-07-16
**Valid until:** ~30 days (Postgres/house patterns stable; Telegram Bot API surface stable; re-check nothing unless the Bot API changelog says otherwise)
