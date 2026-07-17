# Phase 7: Daily Digest — Research

**Researched:** 2026-07-17
**Domain:** Existing-codebase integration (outbox/P&L/Telegram composition) + once-daily scheduling
**Confidence:** HIGH — every codebase claim is from a direct read of the cited file in this repo; the only external claim (pg_cron runs in UTC) matches the pg_cron docs and the already-authored `price_refresh_cron.sql` precedent

## Summary

Phase 7 is almost entirely composition of subsystems that already exist and were built with this phase explicitly in mind. The outbox schema pre-enumerates `daily_digest` in both the SQL CHECK (`supabase/migrations/20260716221450_alerts_telegram.sql:91`) and the TS union (`src/lib/notifications/types.ts:8`) — **zero outbox migration is needed**. The `telegram_links` migration comment (alerts_telegram.sql:48-51) literally names Phase 7's DGST-02 as the reason links are user-level. The dispatcher is 100% kind-agnostic (payload.text pre-rendered at enqueue — the "Phase 6/7 reuse guarantee", alerts_telegram.sql:92-95), so the digest only needs a pure message builder, a per-user compose step, an enqueue with a date-bucketed dedupe key, and a `dispatchOutbox` tail.

The three genuinely new pieces are: (1) a `digest_preferences` user-level table (a column on `telegram_links` is ruled out — see Q1); (2) a deploy-gated once-daily pg_cron migration cloning `price_refresh_cron.sql` plus a secret-guarded `/api/digest/run` route cloning `/api/notifications/dispatch`, with an auth-gated `sendTestDigest` Server Action as the locally-verifiable path; (3) a NARROW read seam over Phase 6's summarized news (`getDailyDigestNews`) that queries the Phase-6 tables by name only (never imports `src/lib/news/*`, which does not exist yet) and degrades honestly to a portfolio-only digest when the tables/columns are absent or empty — which also covers the phase-6-not-yet-executed window.

**Primary recommendation:** One preferences migration + one separate deploy-gated cron migration; pure TDD'd composition in `src/lib/digest/{types,compose}.ts`; orchestration in `src/lib/digest/run.ts` cloning `sweep.ts`'s enqueue-first shape; toggle + send-test UI on `/alerts` beside `TelegramLinkCard` (the settings page is client-only mock-era localStorage UI — wrong home, see Q6).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DGST-01 | Once per day, compose portfolio snapshot (total value, day P&L, top movers) + the day's summarized portfolio news into a single Telegram digest | Snapshot source: `getPortfolioPnL` returns `PortfolioTotal.totalCurrentValue/totalDayChange` + per-holding `dayChangePct` (Q3); news seam: Phase 6 tables per `06-01-PLAN.md` contract (Q4); once-daily: pg_cron clone of `price_refresh_cron.sql` + IST-date-bucketed outbox dedupe key (Q2, Q5); single message: `buildPriceAlertMessage` HTML precedent + 4096 truncation (Q3) |
| DGST-02 | User can enable/disable the digest; digest respects their linked Telegram account | New `digest_preferences` user-level table with own-row RLS (Q1); "respects linked account" = sweep filters to `telegram_links.status='linked'` users AND dispatch re-resolves chat at send time (outbox.ts:83-98 already does the latter); UI toggle on `/alerts` beside TelegramLinkCard (Q6) |
</phase_requirements>

*(No CONTEXT.md exists for Phase 7 — `.planning/phases/07-daily-digest/` was empty at research time. No user constraints to carry.)*

## Q1: Digest preference storage — LOCKED: new user-level `digest_preferences` table

Three candidates examined; two ruled out by direct evidence:

1. **Column on `telegram_links` — REJECTED.**
   - `generateTelegramLink` regenerates a token via deliberate DELETE+INSERT (`src/server-actions/telegram.ts:57-73`), and `unlinkTelegram` deletes the row (telegram.ts:134). A preference stored there is silently lost every time the user re-links — a fabricated "disabled" state.
   - `telegram_links` deliberately has **NO authenticated UPDATE policy** (alerts_telegram.sql:76-81: "deliberate, this is the allowlist boundary"). A user toggling a digest flag would need UPDATE; adding one would weaken the allowlist boundary that keeps `chat_id`/`status='linked'` service-role-only.
2. **Column on `account_settings` — REJECTED.** It is account-scoped mock-era furniture (unused `refresh_interval_*` knobs, initial_schema.sql:175-182), while every digest-adjacent concern in this codebase is USER-level: the outbox recipient (`notifications_outbox.user_id`), `telegram_links.user_id` PK, and the migration comment that names Phase 7: "Phase 7's DGST-02 says the digest 'respects their linked Telegram account.' Both are user-level concerns" (alerts_telegram.sql:48-51).
3. **New `digest_preferences` table — CHOSEN.** Shape mirrors `telegram_links`' user-level profile shape:

```sql
CREATE TABLE IF NOT EXISTS public.digest_preferences (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,   -- opt-IN; no row == disabled (honest default)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

RLS: own-row SELECT/INSERT/UPDATE (`auth.uid() = user_id`, the telegram_links policy shape at alerts_telegram.sql:73-75). UPDATE **is** allowed here, unlike telegram_links — a plain boolean preference is user-owned data with no allowlist/security boundary; toggling is the entire point. No DELETE policy needed (toggle = upsert). The sweep reads it with the admin client (cross-user, `sweep.ts` rationale).

**Semantics:** no row OR `enabled=false` → no digest. `enabled=true` AND `telegram_links.status='linked'` → digest. Enabled-but-unlinked users are SKIPPED with an honest counter in the run summary (never enqueue a row that must fail; note `dispatchOutbox` would fail it honestly anyway at outbox.ts:105-113 — the skip is politeness + observability, the dispatch-time re-check is the hard guarantee DGST-02's "respects their linked account" rides on).

## Q2: Once-per-day idempotency — dedupe key, NO CHECK-constraint migration needed

**Verified directly:** the `kind` CHECK already enumerates all three kinds — `CHECK (kind IN ('price_alert', 'news_alert', 'daily_digest'))` (alerts_telegram.sql:91), commented "All three roadmapped kinds enumerated NOW so Phases 6/7 need no migration" (line 90). The TS union matches (`src/lib/notifications/types.ts:8`). **The Phase 7 migration does NOT touch `notifications_outbox`.**

**Dedupe key shape:** `daily_digest:{userId}:{YYYY-MM-DD}` with the date computed in IST (Q5). The partial unique index `uniq_notifications_outbox_dedupe` (alerts_telegram.sql:116-117) + `enqueueNotifications`' `{ onConflict: 'dedupe_key', ignoreDuplicates: true }` upsert (outbox.ts:49-51) makes a second same-day enqueue a silent no-op — the same crash-recovery/idempotency backstop the alert sweep documents (sweep.ts:15-23). A cron double-fire, an overlapping manual run, or a retry after a crash between enqueue and dispatch can never double-send the digest.

**Test digest exemption:** `dedupe_key TEXT` is nullable, commented "NULL allowed (e.g. one-off digests)" (alerts_telegram.sql:97) — the migration author anticipated exactly this. `sendTestDigest` enqueues with `dedupeKey: null` so a test send always goes out even after the real daily digest already sent.

## Q3: Portfolio snapshot composition — total value, day P&L, top movers

**Source of truth:** `getPortfolioPnL(supabase, accountId, baseCurrency)` (`src/lib/prices/get-portfolio-pnl.ts:169-243`). Verified admin-client-safe for the cross-user sweep: every query it makes is explicitly scoped — `getHoldings` filters `.eq('account_id', accountId)` (`src/lib/supabase/portfolio.ts:74-81`), `readPriceCache` filters `.in('instrument_id', ids)`, fx_cache is a single-pair read — so passing `createAdminClient()` with an explicit accountId returns exactly one account's data, RLS bypass notwithstanding (same pattern as the sweep reading `price_alerts` cross-user).

Per-user resolution chain for the sweep (all admin-client): `digest_preferences.user_id` → `investment_accounts` `.eq('user_id', userId).single()` for `id` + `base_currency` (the dashboard reads `base_currency` the same way, `src/app/(dashboard)/page.tsx:31-36`, defaulting `'INR'`) → `getPortfolioPnL(admin, accountId, baseCurrency)`.

| Digest field | Exact source |
|---|---|
| Total value | `PortfolioPnLResult.portfolioTotal.totalCurrentValue` (base currency) |
| Day P&L | `portfolioTotal.totalDayChange` (signed; derived per holding from `price_cache.change_pct` via `calculateHoldingPnL`, pnl-calculator.ts:74-75) |
| Top movers | From `result.holdings: PricedHolding[]` — see definition below |
| FX honesty | `fxUnavailable: true` → non-base holdings are EXCLUDED from totals (get-portfolio-pnl.ts:224-232); the digest MUST carry the same visible note the dashboard shows (page.tsx:67-74), never silently mis-total |

**Top movers — LOCKED definition:** among `holdings.filter(h => h.status === 'priced' && h.dayChangePct !== null)`, sort by `Math.abs(dayChangePct)` descending, take top 3. Render `ticker` (note: the display symbol field on `Holding` is `ticker`, `src/lib/types.ts:51`) + signed `dayChangePct`. Pending/null-priced holdings are excluded honestly (never a fabricated 0%); zero priced holdings → the movers section is omitted, not faked. This is a pure function (`selectTopMovers`) — TDD it.

**Message builder:** clone `buildPriceAlertMessage`'s style (`src/lib/telegram/build-message.ts`): HTML parse_mode ONLY (legacy V2 markdown would require escaping `.` and `-` in every price), `escapeHtml` (3 entities, `&` first) on every externally-sourced string — tickers AND news headlines/summaries. **Truncation pitfall specific to the digest:** `buildPriceAlertMessage` uses a naive `slice(0, 4096)` — safe for a one-line alert, but a multi-item digest sliced mid-`<b>` tag would 400 with "can't parse entities". The digest builder must append news items whole-item-at-a-time while the running length stays ≤ 4096 (plus a defensive final slice that tests prove never fires) — this is the core TDD case.

**Empty/degraded states (house fail-loudly rule):** zero holdings → honest "No holdings yet" line, totals omitted (never ₹0 fabricated as a real value... actually 0 for an empty portfolio IS true — render it, but with the empty-state wording); all holdings pending (no prices ever fetched) → "prices pending" wording instead of a fabricated total; `fxUnavailable` → the exclusion note; no news → "No summarized portfolio news today."

## Q4: Phase 6 news seam — narrow, table-level, honestly degrading

Phase 6 is planned concurrently and NOT executed. The ONLY stable contracts to depend on:

1. **The outbox API** — exists NOW (`src/lib/notifications/{types,outbox}.ts`).
2. **Phase 6's schema contract** — from the sibling agent's committed-to shape in `.planning/phases/06-news-pipeline/06-01-PLAN.md` (+ 06-RESEARCH-codebase.md Q1): `news_items` gains `title_hash`, `summary_status TEXT CHECK IN ('pending','summarized','degraded')`, `summarized_at`; existing columns `headline`, `summary`, `url`, `source`, `published_at` remain; new join table `news_item_instruments(news_item_id, instrument_id, matched_via, created_at)` FK'd to `instruments`. Both tables: authenticated SELECT, service-role write.

**Seam — LOCKED:** one function, `getDailyDigestNews(admin, instrumentIds: string[], sinceIso: string)` in `src/lib/digest/news.ts` (Phase 7 owns this file; Phase 6 owns `src/lib/news/*` — disjoint):

- Queries by TABLE NAME only (`news_items` joined through `news_item_instruments` on the user's held ∪ watched instrument ids, `summary_status = 'summarized'`, `published_at >= sinceIso`, newest first, LIMIT ~5). **Never imports from `src/lib/news/`** — that directory does not exist yet and a TS import would break `tsc` until Phase 6 executes. A runtime table query cannot break the build.
- Returns `{ items: DigestNewsItem[]; degraded: boolean }`. On a Postgres undefined-table/undefined-column error (codes `42P01`/`42703` — the exact signature of "Phase 6 migration not applied yet") it returns `{ items: [], degraded: true }` instead of throwing. Any other error also degrades (with the error captured in the run summary) — a news problem must NEVER kill the portfolio digest, the same failure-isolation rationale as the refresh tail's inner try/catch (`src/app/api/prices/refresh/route.ts:23-27` per 06-RESEARCH Q4).
- "The day's news" window — LOCKED: `sinceIso = now − 24h`. Simpler than IST-midnight bucketing, matches a once-daily cadence exactly, and is self-healing if the cron fires late.
- Instrument scope: held ∪ watched ids (the `discoverInstrumentIds` union precedent, refresh-service.ts:43-57, but per-user: `getPortfolioPnL(...).holdings[].instrumentId` ∪ `getWatchlist(admin, accountId)[].instrumentId`).

The digest renders `degraded || items.length === 0` as the honest "No summarized portfolio news today." line — one rendering path covers both "Phase 6 not live yet" and "quiet news day".

## Q5: IST timezone handling + pg_cron schedule

- **IST is fixed UTC+5:30, no DST.** The pure date-bucket function needs no timezone database: `istDateKey(now) = new Date(now.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)`. Deterministic, injectable `now`, trivially TDD-able (boundary case: 18:30:00Z is the IST midnight rollover — 18:29Z buckets to day D, 18:30Z to day D+1).
- The UI already pins IST for display: `DISPLAY_TIME_ZONE = 'Asia/Kolkata'` in `TelegramLinkCard.tsx:27-28` (StalenessBadge hydration-bug lesson) — reuse that convention for any digest timestamps rendered in the UI; the message itself renders the IST date string from `istDateKey`.
- **pg_cron runs in UTC/GMT** (pg_cron documented behavior; Supabase managed pg_cron does not change it — MEDIUM-HIGH confidence, consistent with `price_refresh_cron.sql` writing `'0 */3 * * *'` with no timezone clause). **Schedule — LOCKED: `'15 3 * * *'` = 03:15 UTC = 08:45 IST daily**, deliberately 15 minutes after the 03:00 UTC price-refresh cron tick (`'0 */3 * * *'`, price_refresh_cron.sql:23) so the digest composes from prices at most ~15 minutes old.
- The cron migration is a structural clone of `price_refresh_cron.sql`: `cron.schedule('daily-digest-0845-ist', '15 3 * * *', net.http_post(url := current_setting('app.settings.digest_run_url', true), Authorization Bearer current_setting('app.settings.digest_run_secret', true)))`. Settings are set ONCE by an operator via `ALTER DATABASE`, never in git. **Authored-but-NEVER-applied-locally** — same deploy-gate and the same STATE.md CAUTION: every future `supabase db push` must stay selective (this file joins `price_refresh_cron.sql` on the hold-back list; the preferences migration joins the consent-gated apply list with csv_import/alerts_telegram/news_pipeline).

## Q6: Where the toggle lives + trigger-path inventory

**Settings page is the WRONG home:** `src/app/(dashboard)/settings/page.tsx` is a `'use client'` page backed by `useSettings` (localStorage AI-provider keys) — no server read, no Supabase, mock-era. Retrofitting a server-read preference into it is out of scope.

**LOCKED: the digest card goes on `/alerts`**, directly under `TelegramLinkCard` — the page is already an auth-guarded RSC doing parallel Phase-5 reads (`src/app/(dashboard)/alerts/page.tsx:31-34`), already Telegram-centric, and TelegramLinkCard (05-08) is the exact structural precedent: a `'use client'` card + `useTransition` + Server Actions + inline `{ ok:false, error }` surfacing + parent-RSC-revalidate flip. `/alerts` is currently CLEAN in git (the five dirty files are HoldingFormDialog/HoldingsTable/portfolio.ts×2/types.ts + untracked LotEditDialog — none on Phase 7's path); still commit with explicit pathspecs per house rule.

**Trigger paths (three, mirroring Phase 3/5 exactly):**

| Path | Guard | When |
|---|---|---|
| `POST /api/digest/run` | `isAuthorizedRefreshRequest(authHeader, process.env.DIGEST_RUN_SECRET ?? '')` BEFORE `createAdminClient()` — structural clone of `/api/notifications/dispatch/route.ts` (27 lines) | pg_cron daily (deploy-gated); manual curl lever |
| `sendTestDigest()` Server Action | cookie `getUser()` gate, THEN admin client (the `checkTelegramLink`/`refreshPricesNow` auth-gate-then-admin precedent, telegram.ts:84-91) | local verification, per-user, `dedupeKey: null` |
| Route tail | after `runDailyDigest(admin)` → `dispatchOutbox(admin)` so digests deliver on the same run (the 05-05 piggyback shape) | both paths |

New env var: `DIGEST_RUN_SECRET` — labeled placeholder in gitignored `.env.local`, self-generated (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`), one secret per route for independent rotation (the `NOTIFY_DISPATCH_SECRET` rationale). **NEVER a realistic-format secret in any committed file** (standing rule after the GitHub secret-scanning incident) — docs/examples use defanged placeholders like `your-digest-run-secret`.

## Don't Hand-Roll (codebase-internal)

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Telegram delivery | Direct `sendTelegramMessage` from digest code | `enqueueNotifications` → `dispatchOutbox` | Sole sending path; retries/429/403-revoke live there (outbox.ts) |
| Secret guard | New predicate | `isAuthorizedRefreshRequest` from `@/lib/prices/ingest` | Pure, tested, empty-secret-denies; used by both guarded routes |
| Admin client | Inline `createClient(url, serviceKey)` | `createAdminClient()` from `@/utils/supabase/admin` | server-only guard; constructed at call site, PASSED into lib fns |
| HTML escaping | New escaper | `escapeHtml` from `@/lib/telegram/build-message` | 3-entity, order-correct, tested |
| P&L math | Re-deriving totals/day-change | `getPortfolioPnL` + `PortfolioTotal` | Already handles pending prices, fxUnavailable exclusion, native subtotals |
| Account/watchlist reads | New queries | `getAccountId`/`getHoldings`/`getWatchlist` from `@/lib/supabase/portfolio` | Explicitly account-scoped (admin-safe); file is DIRTY — import, never edit |
| FK-relation normalization | Ad-hoc array checks | the `firstOf` pattern (sweep.ts:57-60) | Supabase object-or-array to-one quirk |

## Common Pitfalls

1. **Extending the outbox kind CHECK** — already done in Phase 5; a Phase 7 migration touching `notifications_outbox` is wrong by construction (alerts_telegram.sql:90-91).
2. **Storing the digest flag on `telegram_links`** — lost on re-link (DELETE+INSERT), and toggling would require the deliberately-absent UPDATE policy (Q1).
3. **Naive `slice(0, 4096)` on a multi-tag message** — can cut inside an HTML entity/tag → Telegram 400 "can't parse entities". Whole-item news truncation with a tested budget (Q3).
4. **Importing `src/lib/news/*`** — does not exist until Phase 6 executes; breaks `tsc` today. The seam queries tables by name and degrades on 42P01/42703 (Q4).
5. **Letting a news/per-user failure kill the sweep** — per-user try/catch (fetchPrices `allSettled` spirit; sequential loop like dispatchOutbox), news errors degrade to portfolio-only. Report honest counters, never fabricate.
6. **`'use server'` bare re-exports** — silently zeroes the module's client exports; only `npm run build` catches it (alerts.ts precedent). Declare real async wrappers in `src/server-actions/digest.ts`.
7. **Applying the cron migration locally** — schedules a job that silently fails from localhost (STATE.md STILL-OPEN item 1). Author it; NEVER apply until a public deploy exists. Selective-push CAUTION carried forward.
8. **Enqueueing for unlinked users** — dispatch fails them honestly, but the sweep should skip-and-count instead (Q1); the test action should return "Telegram not linked" inline instead of a doomed enqueue.
9. **package.json ownership** — one plan per wave owns it; sibling Phase 6 agent is taking `test:news-*`; Phase 7 uses `test:digest-*` (`test:digest-compose`).
10. **Shared-doc git races** — a parallel Phase 6 agent is running NOW: stage ONLY `.planning/phases/07-daily-digest/` paths, explicit pathspecs, `git show HEAD --stat` after every commit, retry on index.lock.

## Open Questions

1. **Exact Phase 6 column names at execution time** — the seam is written against 06-01-PLAN.md's authored contract (`summary_status`/`summarized_at`/`news_item_instruments`). If Phase 6's executed schema drifts, `getDailyDigestNews` degrades honestly rather than crashing, and the 07 checkpoint re-verifies news inclusion after Phase 6 is live. Risk: LOW (contract is committed in the sibling's plan; degradation covers drift).
2. **pg_cron timezone** — MEDIUM-HIGH confidence UTC (pg_cron default; Supabase docs describe schedules in UTC). If a deploy-time check shows otherwise, only the cron expression string changes — isolated to the deploy-gated migration that is never applied locally anyway.

## Sources

### Primary (HIGH confidence — all direct reads of this repo)
- `supabase/migrations/20260716221450_alerts_telegram.sql` (kind CHECK line 91; telegram_links user-level rationale 48-51; nullable dedupe_key 97; partial unique index 116-117; no-UPDATE-policy boundary 76-81)
- `supabase/migrations/20260714220438_price_refresh_cron.sql` (deploy-gated cron precedent, app.settings pattern)
- `supabase/migrations/20260714032952_initial_schema.sql` (account_settings shape 175-187)
- `src/lib/notifications/{types,outbox}.ts` (EnqueueRow contract; dispatch chat resolution + revoke)
- `src/lib/alerts/sweep.ts` (enqueue-first ordering, firstOf, admin-client rationale)
- `src/lib/prices/get-portfolio-pnl.ts` + `src/lib/prices/pnl-calculator.ts` (PortfolioTotal, dayChangePct, fxUnavailable)
- `src/lib/supabase/portfolio.ts` (getAccountId/getHoldings/getWatchlist account-scoping — exports only, dirty file)
- `src/lib/telegram/{build-message,read,types}.ts`, `src/server-actions/telegram.ts` (escapeHtml, 4096, DELETE+INSERT relink, auth-gate-then-admin)
- `src/app/api/notifications/dispatch/route.ts` (guard-before-admin clone target)
- `src/app/(dashboard)/{alerts,settings}/page.tsx`, `src/app/(dashboard)/page.tsx` (toggle home; base_currency read), `src/components/dashboard/TelegramLinkCard.tsx` (card + IST display precedent)
- `.planning/phases/06-news-pipeline/06-01-PLAN.md` + `06-RESEARCH-codebase.md` (Phase 6 schema contract + integration surface)
- `package.json` (taken test script names), `.planning/{STATE,ROADMAP,REQUIREMENTS}.md`, `05-09-PLAN.md` (DEFERRED checkpoint template)

### Secondary (MEDIUM confidence)
- pg_cron schedules evaluated in UTC/GMT — pg_cron documented default, consistent with the repo's own cron migration; flagged in Open Questions.

## Metadata

**Confidence breakdown:**
- Outbox/dedupe/idempotency: HIGH — CHECK and index read directly; no migration needed is verified, not assumed
- Preferences storage decision: HIGH — both rejections grounded in read code (DELETE+INSERT relink; absent UPDATE policy)
- P&L/movers composition: HIGH — types and scoping verified including admin-client safety
- Phase 6 seam: MEDIUM-HIGH — contract from the sibling's authored plan, not executed code; mitigated by honest degradation
- Scheduling: HIGH for the pattern (house precedent), MEDIUM-HIGH for UTC semantics

**Research date:** 2026-07-17
**Valid until:** Phase 7 planning/execution (invalidated if Phase 6's executed schema diverges from 06-01-PLAN.md)
