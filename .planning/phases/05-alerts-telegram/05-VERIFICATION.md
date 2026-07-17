---
phase: 05-alerts-telegram
verified: 2026-07-16T00:00:00Z
status: gaps_found
score: 8/8 must-haves verified (static); 4/4 requirements code-complete, live verification deferred
re_verification: false

gaps:
  - truth: "Users receive reliable per-ticker price alerts on Telegram"
    status: partial
    reason: "Code-complete and static-verified, but live behavior unproven — DEFERRED pending Telegram bot token creation and migration push consent"
    artifacts: []
    missing:
      - "Telegram bot token (TELEGRAM_BOT_TOKEN) — requires BotFather bot creation"
      - "Migration push consent and execution (20260716221450_alerts_telegram.sql not yet applied to live DB)"
      - "Live end-to-end verification (05-09 checkpoint deferred)"

human_verification:
  - test: "Bot provisioning"
    expected: "Message @BotFather → /newbot → supply name and `bot`-suffixed username → capture token into TELEGRAM_BOT_TOKEN"
    why_human: "Requires manual interaction with Telegram BotFather; token is a secret that must not be committed"
  - test: "Migration push"
    expected: "supabase link + supabase db push (selective) of 20260715230011_csv_import.sql + 20260716221450_alerts_telegram.sql ONLY (not price_refresh_cron.sql)"
    why_human: "Requires explicit user consent; must not auto-apply cron migration before deployment"
  - test: "Live Telegram linking (ALRT-01)"
    expected: "Real `/start` click-through via TelegramLinkCard → checkTelegramLink polling → chat_id capture → linked state; expired/reused token does not re-link"
    why_human: "Requires real bot token and live DB; handshake interaction is user-visible behavior"
  - test: "Live alert creation + display (ALRT-02)"
    expected: "Create real price alert on held/priced ticker → alert persists and shows current price vs threshold; duplicate (same ticker+direction) rejected"
    why_human: "Requires live DB and real prices; display accuracy cannot be verified statically"
  - test: "Live trigger + cooldown (ALRT-03)"
    expected: "Real threshold crossing → enqueues exactly one notifications_outbox row → delivers ONE Telegram message; second refresh inside cooldown window sends NO repeat"
    why_human: "Requires live price data, live DB, and Telegram delivery; cooldown behavior is runtime-dependent"
  - test: "Live outbox retry/dead-letter (ALRT-05)"
    expected: "Blocked bot (403) marks row failed and revokes telegram_links; retryable failure (429, 5xx) stays pending with bumped attempts; `POST /api/notifications/dispatch` with bearer secret delivers pending row"
    why_human: "Requires live Telegram API interaction; retry/dead-letter behavior cannot be tested without real failures"
  - test: "Dispatch route guard"
    expected: "`POST /api/notifications/dispatch` returns 401 without correct NOTIFY_DISPATCH_SECRET; returns 200 with it"
    why_human: "Requires running server; guard behavior is HTTP-level and cannot be verified from static code alone"
  - test: "Webhook activation (deploy-gated)"
    expected: "Live `setWebhook` + `getWebhookInfo` against public HTTPS deploy; fresh `/start` binding via webhook instead of dev poll"
    why_human: "Requires deployed public URL; Telegram cannot reach localhost, so webhook cannot be tested locally"

---

# Phase 5: Alerts + Telegram Verification Report

**Phase Goal:** Users receive reliable per-ticker price alerts on Telegram through a retryable outbox that later phases reuse.

**Verified:** 2026-07-16

**Status:** gaps_found (static verification complete, live verification deferred)

**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Static Verification)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Schema creates price_alerts table with account-ownership RLS + one-per-direction UNIQUE constraint + cooldown state | ✓ VERIFIED | Migration 20260716221450 defines price_alerts with four account-ownership EXISTS-subquery RLS policies (SELECT/INSERT/UPDATE/DELETE) and UNIQUE(account_id, instrument_id, direction); cooldown_minutes and last_triggered_at columns present |
| 2 | telegram_links table is user-keyed with closed UPDATE posture (NO authenticated UPDATE) allowing service-role-only chat_id/status writes | ✓ VERIFIED | Migration defines telegram_links with user_id PRIMARY KEY, SELECT/INSERT/DELETE policies for authenticated users, ZERO UPDATE policy; no authenticated user can call the UPDATE statement |
| 3 | notifications_outbox is payload-generic with NO authenticated write policies (service-role write only) and dedupe_key partial unique index | ✓ VERIFIED | Migration defines notifications_outbox with kind+payload+dedupe_key columns, one SELECT policy (read own), ZERO INSERT/UPDATE policies; partial unique index `uniq_notifications_outbox_dedupe` on dedupe_key WHERE dedupe_key IS NOT NULL |
| 4 | claim_due_notifications SECURITY DEFINER function uses FOR UPDATE SKIP LOCKED, revoked from anon/authenticated, available to system/service-role only | ✓ VERIFIED | Migration defines claim_due_notifications as SECURITY DEFINER plpgsql function with FOR UPDATE SKIP LOCKED inside WHERE clause; REVOKE statements explicitly deny PUBLIC, anon, authenticated; function signature in comments matches call site |
| 5 | parseStartPayload parses `/start <token>` message text to 43-char base64url token, rejects bare `/start` and malformed payloads | ✓ VERIFIED | src/lib/telegram/parse-start-payload.ts implements exact regex `/^[A-Za-z0-9_-]{1,64}$/` per Telegram deep-link charset spec; pure function, no I/O; test:telegram passes all case groups |
| 6 | evaluateAlerts fires iff alert is active AND price exists AND price did not fail fetch AND price crosses threshold in direction AND cooldown elapsed | ✓ VERIFIED | src/lib/alerts/evaluate.ts implements six-check cascade (isActive, instrument exists, price not null, fetchError null, direction comparison strict, cooldown elapsed); pure function, injected now; test:alerts PASS with 15 case groups covering all boundaries |
| 7 | computeAlertDedupeKey returns deterministic cooldown-window bucket key identical across re-runs in same window, different in next window | ✓ VERIFIED | src/lib/alerts/evaluate.ts computes `price_alert:{id}:{floor(epoch_seconds/(cooldownMinutes*60))}` per ALRT-05 spec; test:alerts PASS confirms bucket idempotency |
| 8 | dispatchOutbox claims due rows via SKIP-LOCKED RPC, resolves linked chats, sends sequentially per-chat (never Promise.all), records outcomes honestly (sent/retried/failed) and revokes link on blocked/chat-not-found | ✓ VERIFIED | src/lib/notifications/outbox.ts implements claimed/sent/retried/failed accounting; sequential send loop with classifySendError mapping (429→retryable with API-provided retry_after, 403/400/blocked→failed+revoke, 5xx/network→retried); enqueueNotifications uses upsert with ignoreDuplicates on dedupe_key for idempotent enqueue |
| 9 | buildPriceAlertMessage HTML-escapes &, <, > (never MarkdownV2) and truncates to ≤4096 chars | ✓ VERIFIED | src/lib/telegram/build-message.ts implements escapeHtml with three entity mappings and message truncation at 4096; test:telegram PASS |
| 10 | classifySendError maps 429→retryable(with retry_after), 403/400/chat-not-found→permanent, 5xx/network→retryable with case-insensitive description substring matching | ✓ VERIFIED | src/lib/telegram/classify-send-error.ts implements exact taxonomy per 05-02 spec; test:telegram PASS |
| 11 | redeemStartToken validates token existence, expiry, status='pending', idempotently binds chat_id via compare-and-set UPDATE WHERE status='pending', handles race conditions and constraint violations | ✓ VERIFIED | src/lib/telegram/redeem.ts implements exact flow per 05-06 spec; idempotency via compare-and-set UPDATE with eq filters; 23505 constraint violation mapped to friendly error |
| 12 | Price-refresh entry points (cron route + Server Action) run evaluateAndEnqueueAlerts then dispatchOutbox at TAIL after refreshAllPrices, failure-isolated so Telegram outage never fails refresh | ✓ VERIFIED | src/app/api/prices/refresh/route.ts and src/server-actions/prices.ts both import and call evaluateAndEnqueueAlerts + dispatchOutbox in try/catch after refreshAllPrices; failure captured in alertsResult, never thrown |
| 13 | Alert CRUD (create/update/toggle/delete) uses cookie-bound client (never admin), calls requireAuthedContext (getUser + getAccountId), RLS-scopes writes, handles 23505 duplicate, revalidates /alerts | ✓ VERIFIED | src/server-actions/alerts.ts implements all four mutations with identical pattern: createClient → getUser → getAccountId → cookie-bound mutation → revalidatePath; 23505 mapped to friendly duplicate message |
| 14 | getPriceAlerts joins alerts to instruments and price_cache, cookie-bound, returns honest null price when unpriced | ✓ VERIFIED | src/lib/alerts/read.ts implements join on instrument_id and price_cache with left joins; cookie-bound client; null price mapping confirmed |
| 15 | Telegram linking (generateTelegramLink, checkTelegramLink, unlinkTelegram) are cookie-bound Server Actions; generateTelegramLink creates pending link + renders t.me deep link; checkTelegramLink polls getTelegramUpdates + parses + redeems; unlinkTelegram deletes link | ✓ VERIFIED | src/server-actions/telegram.ts implements all three as Server Actions; generateTelegramLink calls admin.createTelegramLink; checkTelegramLink uses getTelegramUpdates + parseStartPayload + redeemStartToken; all revalidate /alerts |
| 16 | /alerts page is auth-guarded async Server Component reading getPriceAlerts + getTelegramLink (no mock, no fabricated alerts) | ✓ VERIFIED | src/app/(dashboard)/alerts/page.tsx is async RSC with auth.getUser guard, calls getPriceAlerts + getTelegramLink in Promise.all, renders TelegramLinkCard + AlertsTable |
| 17 | AlertsTable, AlertFormDialog, TelegramLinkCard are real components calling CRUD Server Actions, never placeholder renders | ✓ VERIFIED | All three components call their respective Server Actions with inline error surfaces; AlertFormDialog integrates real instrument search; TelegramLinkCard implements state machine (unlinked → link shown → linked) |
| 18 | POST /api/notifications/dispatch is secret-guarded before Supabase, calls dispatchOutbox(admin) | ✓ VERIFIED | src/app/api/notifications/dispatch/route.ts guards with isAuthorizedRefreshRequest before createAdminClient; returns DispatchSummary JSON |
| 19 | POST /api/telegram/webhook verifies X-Telegram-Bot-Api-Secret-Token header before Supabase, parses /start update, redeems token | ✓ VERIFIED | src/app/api/telegram/webhook/route.ts checks secret header before createAdminClient; parses update JSON; calls redeemStartToken if token + chatId present; always returns 200 |
| 20 | RLS isolation test extends to price_alerts (account-owned), telegram_links (owner can SELECT/INSERT/DELETE, zero UPDATE by anyone), notifications_outbox (no authenticated INSERT) | ✓ VERIFIED | scripts/rls-isolation-test.ts has 33+ matches for the three tables; comments document checks 7-9 as Phase 5 (05-01) coverage; telegram_links UPDATE-affects-zero-rows proof present |

**Score:** 20/20 static observable truths verified

---

## Required Artifacts (All Present & Substantive)

| Artifact | Expected | Status | Evidence |
|----------|----------|--------|----------|
| `supabase/migrations/20260716221450_alerts_telegram.sql` | Single migration file with DDL for price_alerts, telegram_links, notifications_outbox, claim_due_notifications RPC, RLS policies, indices | ✓ VERIFIED | File exists; grep confirms 1 DROP TABLE (alerts), 1 CREATE TABLE price_alerts, 1 CREATE TABLE telegram_links, 1 CREATE TABLE notifications_outbox, 1 SECURITY DEFINER function, 8 CREATE POLICY statements, 3 FOR UPDATE SKIP LOCKED, 2 REVOKE statements |
| `scripts/rls-isolation-test.ts` | Extended to cover three tables with account-ownership and closed-posture proofs | ✓ VERIFIED | File exists, 272 lines; grep shows 33 matches for the three table names; two-user isolation assertions present |
| `src/lib/telegram/types.ts` | Shared Telegram domain types | ✓ VERIFIED | File exists, 58 lines; declares TelegramUpdate type used by api.ts |
| `src/lib/telegram/parse-start-payload.ts` | parseStartPayload(text) → token \| null | ✓ VERIFIED | File exists, 23 lines, pure function; exports parseStartPayload |
| `src/lib/telegram/link-token.ts` | generateLinkToken + isValidLinkTokenShape | ✓ VERIFIED | File exists; exports both functions |
| `src/lib/telegram/build-message.ts` | escapeHtml + buildPriceAlertMessage | ✓ VERIFIED | File exists; exports both functions; HTML escape patterns present |
| `src/lib/telegram/classify-send-error.ts` | classifySendError(errorCode, description, retryAfter) → { kind, retryAfterSeconds? } | ✓ VERIFIED | File exists; exports classifySendError with exact signature |
| `src/lib/telegram/api.ts` | sendTelegramMessage + getTelegramUpdates + getTelegramMe raw-fetch wrappers | ✓ VERIFIED | File exists, 200+ lines; reads TELEGRAM_BOT_TOKEN env var (never NEXT_PUBLIC_); returns discriminated-union result envelopes |
| `src/lib/telegram/read.ts` | getTelegramLink(supabase, userId) → link status for RSC | ✓ VERIFIED | File exists; cookie-bound, returns TelegramLinkView |
| `src/lib/telegram/redeem.ts` | redeemStartToken(admin, token, chatId) → RedeemResult | ✓ VERIFIED | File exists, 87 lines; admin-only; idempotent via compare-and-set; 23505 handling present |
| `src/lib/alerts/types.ts` | Shared alert domain types (AlertDirection, AlertEvalRow, PriceSnapshot, TriggeredAlert) | ✓ VERIFIED | File exists; exports AlertDirection = 'above' \| 'below' |
| `src/lib/alerts/evaluate.ts` | evaluateAlerts + computeAlertDedupeKey + isCooldownElapsed | ✓ VERIFIED | File exists, 107 lines; pure functions; six-check cascade in evaluateAlerts |
| `src/lib/alerts/read.ts` | getPriceAlerts(supabase, accountId) → PriceAlertView[] | ✓ VERIFIED | File exists; joins price_alerts + instruments + price_cache; cookie-bound |
| `src/lib/alerts/sweep.ts` | evaluateAndEnqueueAlerts(admin) → { triggered, enqueued } | ✓ VERIFIED | File exists, 150+ lines; loads alerts + price_cache; pure-evaluates; pre-renders payload.text; enqueue-first + stamp last_triggered_at |
| `src/lib/notifications/types.ts` | NotificationKind, EnqueueRow, OutboxRow, DispatchSummary, TelegramUpdate types | ✓ VERIFIED | File exists, 58 lines; exports DispatchSummary = { claimed, sent, retried, failed } |
| `src/lib/notifications/outbox.ts` | enqueueNotifications + dispatchOutbox + re-export DispatchSummary | ✓ VERIFIED | File exists, 160+ lines; enqueueNotifications calls upsert with ignoreDuplicates; dispatchOutbox claims + resolves + sends sequentially + records outcomes |
| `src/server-actions/alerts.ts` | createPriceAlert, updatePriceAlert, togglePriceAlert, deletePriceAlert (all cookie-bound RLS-scoped) + re-export searchInstrumentsAction | ✓ VERIFIED | File exists, 200+ lines; all four mutations present; requireAuthedContext helper; 23505 friendly error mapping; revalidatePath calls |
| `src/server-actions/telegram.ts` | generateTelegramLink, checkTelegramLink, unlinkTelegram Server Actions (all cookie-bound) | ✓ VERIFIED | File exists; all three as Server Actions; revalidatePath calls |
| `src/app/(dashboard)/alerts/page.tsx` | Auth-guarded async Server Component reading getPriceAlerts + getTelegramLink | ✓ VERIFIED | File exists, 49 lines; async RSC with auth.getUser guard; Promise.all reads both; renders TelegramLinkCard + AlertsTable + explanation card |
| `src/components/dashboard/AlertsTable.tsx` | Real table for price alerts (direction/threshold/current price/status, edit/toggle/delete) | ✓ VERIFIED | File exists, 200+ lines; renders PriceAlertView; calls togglePriceAlert, deletePriceAlert; useTransition + inline error handling |
| `src/components/dashboard/AlertFormDialog.tsx` | Create/edit alert dialog with real-instrument search | ✓ VERIFIED | File exists, 300+ lines; mode: add/edit; calls searchInstrumentsAction; calls createPriceAlert/updatePriceAlert; debounced search |
| `src/components/dashboard/TelegramLinkCard.tsx` | Telegram link/unlink handshake UI (state machine) | ✓ VERIFIED | File exists, 250+ lines; calls generateTelegramLink, checkTelegramLink, unlinkTelegram; state machine (unlinked → link shown → linked) |
| `src/app/api/notifications/dispatch/route.ts` | Secret-guarded POST dispatch lever | ✓ VERIFIED | File exists, 24 lines; isAuthorizedRefreshRequest guard before createAdminClient; calls dispatchOutbox |
| `src/app/api/telegram/webhook/route.ts` | Secret-header-guarded POST webhook route | ✓ VERIFIED | File exists, 34 lines; X-Telegram-Bot-Api-Secret-Token header check before createAdminClient; parseStartPayload + redeemStartToken calls |

**Score:** 25/25 artifacts verified (all exist, all substantive, all wired)

---

## Key Link Verification (Wiring Completeness)

| From | To | Via | Status | Evidence |
|------|----|----|--------|----------|
| price_alerts table | investment_accounts | REFERENCES + EXISTS-subquery RLS | ✓ WIRED | Migration has REFERENCES foreign key + four RLS policies use EXISTS subqueries checking investment_accounts.user_id = auth.uid() |
| telegram_links (UPDATE) | Service-role only | NO authenticated UPDATE policy | ✓ WIRED | Migration creates SELECT/INSERT/DELETE policies for authenticated users, ZERO UPDATE policy — the closed-UPDATE allowlist closure IS present |
| notifications_outbox (INSERT) | Service-role only | NO authenticated INSERT policy | ✓ WIRED | Migration creates SELECT policy only; no INSERT or UPDATE policies for authenticated users |
| claim_due_notifications RPC | notifications_outbox | SKIP-LOCKED claim | ✓ WIRED | Migration defines function with FOR UPDATE SKIP LOCKED in WHERE clause; REVOKE from anon/authenticated present |
| buildPriceAlertMessage | HTML parse_mode | Entity escape (only &, <, >) | ✓ WIRED | src/lib/telegram/build-message.ts implements escapeHtml with three mappings, never MarkdownV2 |
| evaluateAlerts | computeAlertDedupeKey | Triggered alert dedupe key | ✓ WIRED | src/lib/alerts/sweep.ts calls both; computeAlertDedupeKey used to create dedupe_key for enqueue |
| sweep (evaluateAndEnqueueAlerts) | evaluate + enqueue + message builder | Composition: evaluate → build → enqueue | ✓ WIRED | src/lib/alerts/sweep.ts imports evaluateAlerts, buildPriceAlertMessage, enqueueNotifications; calls in sequence per triggered alert |
| dispatchOutbox | sendTelegramMessage + classifySendError | Claim → resolve → send sequentially → classify → record | ✓ WIRED | src/lib/notifications/outbox.ts claims due rows, resolves chats, sends per-row with classifySendError mapping; sequential for-loop, never Promise.all |
| price refresh entry points | evaluateAndEnqueueAlerts + dispatchOutbox | Tail composition after refreshAllPrices | ✓ WIRED | Both src/app/api/prices/refresh/route.ts and src/server-actions/prices.ts call evaluateAndEnqueueAlerts + dispatchOutbox in try/catch after refreshAllPrices; failure-isolated |
| alert CRUD Server Actions | requireAuthedContext | Cookie-bound client + getUser + getAccountId | ✓ WIRED | src/server-actions/alerts.ts defines requireAuthedContext helper; all four mutations call it; RLS authorizes write |
| AlertsTable | deletePriceAlert + togglePriceAlert | useTransition dispatch | ✓ WIRED | Imports and calls both; inline error handling; revalidation after action completes |
| AlertFormDialog | createPriceAlert + updatePriceAlert + searchInstrumentsAction | useTransition dispatch | ✓ WIRED | Imports and calls all three; mode-specific (add calls create, edit calls update); debounced search |
| TelegramLinkCard | generateTelegramLink + checkTelegramLink + unlinkTelegram | useTransition state machine | ✓ WIRED | Imports and calls all three; state transitions on success; revalidation triggers parent re-render |
| /alerts page | getPriceAlerts + getTelegramLink | Promise.all async reads | ✓ WIRED | Imports and awaits both in parallel; passes results to components |
| webhook route | redeemStartToken | Secret header guard → parse → redeem | ✓ WIRED | Checks TELEGRAM_WEBHOOK_SECRET header; parses update JSON; calls redeemStartToken(admin, token, chatId) |

**Score:** 15/15 key links verified (all wired, no orphaned artifacts)

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| ALRT-01 | 05-06 | User can link their Telegram account via /start handshake (chat id captured, allowlisted) | Code-complete/static-verified | src/lib/telegram/redeem.ts redeemStartToken implements idempotent token binding; src/server-actions/telegram.ts generateTelegramLink + checkTelegramLink; src/app/api/telegram/webhook/route.ts webhook entry point; TelegramLinkCard UI state machine; 05-09 summary records live behavior deferred (no bot token) |
| ALRT-02 | 05-07 | User can set price alerts (threshold up/down) per ticker | Code-complete/static-verified | src/server-actions/alerts.ts createPriceAlert, updatePriceAlert, togglePriceAlert, deletePriceAlert all present; src/lib/alerts/read.ts getPriceAlerts; AlertFormDialog + AlertsTable UI complete; real instrument search integrated; 05-09 summary records live persistence + duplicate detection unproven |
| ALRT-03 | 05-03, 05-05 | System sends Telegram message when price alert triggers, with cooldown so it does not repeat every refresh | Code-complete/static-verified | src/lib/alerts/evaluate.ts isCooldownElapsed + level comparison logic; src/lib/alerts/sweep.ts integrates into price refresh; buildPriceAlertMessage pre-renders; dispatchOutbox sends after refresh; test:alerts PASS on cooldown semantics; 05-09 summary records live trigger + delivery + cooldown suppression unproven |
| ALRT-05 | 05-04 | Notifications written to outbox and dispatched separately, failure retries on next run instead of being lost | Code-complete/static-verified | src/lib/notifications/outbox.ts enqueueNotifications (ignoreDuplicates) + dispatchOutbox (claim → send → classify → retry/fail); 05-04 must-haves document retry taxonomy (429 honors retry_after, 5xx retried, 403/blocked failed+revoked, no-chat failed); src/app/api/notifications/dispatch/route.ts standalone dispatch lever; 05-09 summary records live retry/dead-letter behavior unproven |

**Score:** 4/4 requirements mapped, all code-complete/static-verified, all live verification deferred (no bot token, no migration consent)

---

## Anti-Patterns Scan

| File | Pattern | Severity | Finding |
|------|---------|----------|---------|
| src/lib/telegram/*.ts, src/lib/alerts/*.ts, src/lib/notifications/*.ts | TODO/FIXME/XXX/HACK | ✓ CLEAN | No code stubs; only 2 matches (legitimate .env placeholder comments in api.ts) |
| src/app/api, src/server-actions, src/components | console.log-only implementations | ✓ CLEAN | No logging-only stubs; only error console.error calls present |
| src/lib/alerts, src/lib/telegram, src/lib/notifications | Empty returns (null/{}/[]) | ✓ CLEAN | Only legitimate guard-clause nulls in parseStartPayload and sweep helper; no placeholder returns |
| supabase/migrations/20260716221450_alerts_telegram.sql | Migration integrity | ✓ CLEAN | One DROP TABLE (old legacy alerts), never DROP of any other table; all creates are new tables; no modifications to existing migrations |
| All test files | Test coverage | ✓ VERIFIED | scripts/telegram-logic-test.ts (205 lines) + scripts/alerts-eval-test.ts (272 lines); both run PASS; npm run test:telegram + npm run test:alerts both green |

**Antis-patterns:** None found

---

## Static Verification Results

| Check | Result | Evidence |
|-------|--------|----------|
| TypeScript compilation | ✓ PASS | `npx tsc --noEmit` — clean, no errors |
| Build | ✓ PASS | `npm run build` — clean; `/alerts`, `/api/notifications/dispatch`, `/api/telegram/webhook` routes listed in build output |
| test:telegram | ✓ PASS | "all case groups passed (parse-start-payload/link-token/build-message/classify-send-error correct)" |
| test:alerts | ✓ PASS | "all 15 case groups passed (evaluateAlerts level+cooldown trigger rule, null/failed-price exclusion, strict direction boundaries, computeAlertDedupeKey cooldown-window bucket)" |
| test:import-parse | ✓ PASS | Regression check — Phase 4 pure import layer untouched |
| Migration file syntax | ✓ VERIFIED | SQL reviewed for balanced DDL, correct RLS shapes, closed write postures, SKIP-LOCKED syntax, REVOKE statements |
| RLS isolation test typechecks | ✓ VERIFIED | `npx tsc --noEmit` includes scripts/rls-isolation-test.ts; no type errors |
| No fabricated data | ✓ VERIFIED | All components render honest empty states (no `alerts={[]}` mock); /alerts page only shows real data or null |
| Mock module cleanup | ✓ VERIFIED | Old AlertItem type rewritten to PriceAlertView; old mock scaffold replaced with real Server Components |

---

## Deferred Items (Live Verification Blocked)

Per 05-09-SUMMARY.md, the following are explicitly deferred (recorded honestly, not fabricated):

1. **Telegram bot token** — TELEGRAM_BOT_TOKEN placeholder in .env.local; requires BotFather interaction
2. **Migration push** — 20260716221450_alerts_telegram.sql authored but not applied to live DB (both migrations are unpushed; selective push required to avoid applying price_refresh_cron.sql prematurely)
3. **RLS isolation live run** — `npm run test:rls` fails with "Could not find table 'public.import_batches'" (proves migrations genuinely unapplied; tests cannot run without live DB)
4. **Live Telegram linking handshake** — real `/start` click-through, chat_id capture, expired/reused token behavior
5. **Live alert trigger + cooldown** — real threshold crossing, message delivery, cooldown suppression on second refresh
6. **Live outbox retry/dead-letter** — real failure scenarios (403 blocked, 429 rate-limit, 5xx transient), retry backoff, dead-lettering
7. **Dispatch route guard live proof** — NOTIFY_DISPATCH_SECRET header guard under running server
8. **Webhook activation** — live `setWebhook` against deployed public HTTPS URL (cannot test from localhost; Telegram cannot reach it)

All deferred items are documented in 05-09-SUMMARY.md's "Deferred Items" section with exact resume path.

---

## Summary

### What Was Verified

**Static verification (code-only, no live services):**
- Schema: three new tables (price_alerts, telegram_links, notifications_outbox) with correct RLS postures (account-ownership EXISTS-subqueries, closed UPDATE on telegram_links, closed write on notifications_outbox), BIGINT chat_id, dedupe_key partial index, SKIP-LOCKED claim function
- Pure logic: Telegram message parsing, token generation, HTML escaping, error classification; alert evaluation with level+cooldown + null/failed-price exclusion; deterministic dedupe key
- Data layer: enqueue-first idempotent outbox, claim+resolve+send+classify+retry sequential dispatch, redeemStartToken idempotent binding
- CRUD: alert create/update/toggle/delete with cookie-bound RLS-scoped mutations; Telegram linking Server Actions
- Integration: alert evaluation + dispatch piggybacked onto both price-refresh entry points (cron route + Server Action), failure-isolated
- UI: /alerts page as auth-guarded async RSC; AlertsTable, AlertFormDialog, TelegramLinkCard as real components calling Server Actions
- API routes: POST /api/notifications/dispatch (secret-guarded), POST /api/telegram/webhook (header-guarded)
- Tests: test:telegram PASS (pure Telegram logic); test:alerts PASS (pure alert evaluation + cooldown + dedupe)
- Build: npm run build PASS; tsc PASS; no type errors

**Wiring verified:**
- Price refresh → alerts evaluation + dispatch (both entry points)
- Alert sweep → pure evaluator + outbox + message builder
- Outbox dispatch → Telegram API + error classification + link revocation
- Telegram redeem → admin idempotent compare-and-set
- Alert CRUD → RLS-scoped cookie-bound mutations
- UI → Server Actions (all calls present)
- RLS isolation test → covers all three new tables (price_alerts account-owned, telegram_links no UPDATE, notifications_outbox no authenticated INSERT)

### What Was NOT Verified (Deferred)

**Live behavior (blocked on bot token + migration consent):**
- Real Telegram bot interaction (no TELEGRAM_BOT_TOKEN)
- Live DB migration apply (no supabase link; migrations unpushed)
- Real `/start` handshake, chat_id capture, token expiry
- Real price threshold crossing, message delivery, cooldown suppression
- Real retry/dead-letter behavior, link revocation on 403
- Webhook activation (requires public HTTPS deploy)

Per standing user direction, all live verification is recorded honestly as deferred in 05-09-SUMMARY.md rather than fabricated as passing.

---

## Overall Status

**Status:** gaps_found

**Gap:** Live verification deferred (no bot token, no migration consent). All code is static-verified, complete, and wired correctly. The phase's 8 executable plans (05-01 through 05-08) are complete; the 9th plan (05-09, the live checkpoint) explicitly deferred its 9-step verification and recorded the deferral honestly.

**Requirements Status:** 
- ALRT-01 (link handshake) — Code-complete/static-verified, live behavior deferred
- ALRT-02 (per-ticker alerts) — Code-complete/static-verified, live persistence deferred
- ALRT-03 (trigger + cooldown) — Code-complete/static-verified, live behavior deferred
- ALRT-05 (retry + dead-letter) — Code-complete/static-verified, live behavior deferred

All four requirements are code-complete, all substantive wiring in place, all pure logic tested, all UI/API routes present. Live end-to-end verification blocked only by external dependencies (bot token, DB migration consent, deployment infrastructure).

**Score:** 20/20 observable truths verified (static) + 25/25 artifacts verified + 15/15 key links verified (all wired) = 60/60 static checks passed

**Recommendations for Resume:**
1. User creates Telegram bot via BotFather; captures TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET into .env.local
2. User grants migration-push consent
3. Re-run `/gsd:execute-phase 5` to execute 05-09-PLAN.md's 9-step live verification checkpoint
4. Path: supabase login → supabase link → supabase db push (selective: only 20260715230011_csv_import.sql + 20260716221450_alerts_telegram.sql; never price_refresh_cron.sql until deployment) → npm run test:rls → live handshake/trigger/retry tests → deploy → webhook activation

---

_Verified: 2026-07-16_
_Verifier: Claude (gsd-verifier)_
