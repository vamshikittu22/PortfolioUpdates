# Phase 5: Alerts + Telegram — Codebase Integration Research

**Researched:** 2026-07-16
**Domain:** Existing-codebase integration surface (one of three parallel research docs; siblings cover Telegram Bot API and outbox/alert-engine design)
**Confidence:** HIGH — every claim below was read directly from the working tree at commit 776f393

> No `05-CONTEXT.md` exists (`.planning/phases/05-alerts-telegram/` was empty at research time), so there are no user-locked decisions to constrain this doc. Scope comes from ROADMAP.md's Phase 5 section and REQUIREMENTS.md ALRT-01/02/03/05.

## Summary

Phase 5 plugs into a codebase with unusually clean seams. The price pipeline has exactly one orchestration point (`refreshAllPrices` in `src/lib/prices/refresh-service.ts`) called from exactly two entry points (secret-guarded cron route, auth-gated Server Action) — alert evaluation slots in there, but **the pipeline does not currently expose per-instrument old→new price pairs**, which crossing detection needs (see Integration Point 1 for the two honest options). The UI already has a live `/alerts` page, an `AlertsTable` component, and an `AlertItem` type — all mock-era placeholders that must be **rebuilt, not created** (collision warnings below). Server Action, secret-guard, fetch-wrapper, test-script, and deferred-verification conventions are all firmly established with named precedents; the planner's job is to follow them, and this doc lists each with file:line cites.

**Primary recommendation:** Hook alert evaluation inside `refreshAllPrices` (it alone knows which instruments just got fresh prices), extend its pre-upsert `price_cache` read to also select `price` so old→new pairs exist, and treat `/alerts` + `AlertItem` + `AlertsTable` as rewrite targets rather than green-field files.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ALRT-01 | Telegram link via bot `/start` handshake (chat id captured, allowlisted) | Integration Points 4 & 5 (webhook route follows `/api/prices/refresh` secret-guard precedent; proxy.ts already exempts `/api/*` from login redirects); Integration Point 2 (where linking UI lives) |
| ALRT-02 | Per-ticker price alerts (threshold up/down) | Integration Points 2 & 3 (rebuild `/alerts` page as auth-guarded Server Component shell + client islands; Server Action conventions; reuse `searchInstrumentsAction` for ticker selection) |
| ALRT-03 | Telegram message on trigger, with cooldown | Integration Point 1 (exact hook point in `refreshAllPrices`, available data shapes, the missing old-price gap) |
| ALRT-05 | Outbox written + dispatched separately, retry on failure | Integration Points 1, 4, 6 (admin-client write pattern, pg_cron scheduling precedent and its deploy-gating caveat, fetch-wrapper error taxonomy for recording delivery failures) |
</phase_requirements>

---

## Integration-Point Map

### 1. Price pipeline hook point (ALRT-03, ALRT-05)

**The flow today:**

- `refreshAllPrices(admin)` — `src/lib/prices/refresh-service.ts:68` — is the ONLY place `price_cache`/`fx_cache` are ever written (file header, lines 1-13). It accepts a `SupabaseClient` and never constructs one; "which client" stays at the call site.
- Entry point A: `POST /api/prices/refresh` — `src/app/api/prices/refresh/route.ts:11-27`. Guard first (`isAuthorizedRefreshRequest` against `process.env.PRICE_REFRESH_SECRET`, line 13), only then `createAdminClient()` → `refreshAllPrices` (line 18). Unauthorized requests never touch Supabase.
- Entry point B: `refreshPricesNow` Server Action — `src/server-actions/prices.ts:15-37`. Cookie-bound `getUser()` gate (lines 18-22), then the same `refreshAllPrices(createAdminClient())` in-process (line 30), then `revalidatePath('/')` + `revalidatePath('/holdings')` (lines 31-32).

**What data exists at the moment prices land:**

- Instruments-to-fetch are discovered across ALL users' transactions + watchlist items (`discoverInstrumentIds`, refresh-service.ts:43-57) — admin client required, RLS-scoped client would undercount.
- The instrument select pulls only `id, price_source_symbol` (refresh-service.ts:89-92). **`currency` is NOT selected** — if alert messages need the instrument's currency or display symbol, extend this select or join at evaluation time. Full instrument column set (snake_case): `id, isin, symbol, exchange, display_name, asset_type, currency, price_source_symbol` (see the mapping in `src/server-actions/import.ts:80-95`).
- Successful fetches accumulate in `upsertRows` with shape `{ instrument_id, symbol, price, change_pct, source, fetch_error: null, corporate_action_flag, updated_at }` (refresh-service.ts:129-161), upserted at lines 168-173 with `onConflict: 'instrument_id'`.
- `price_cache` schema: PK `instrument_id`, nullable `price`/`change_pct`/`source`, `fetch_error`, `corporate_action_flag`, `updated_at` (`supabase/migrations/20260714220333_price_fx_schema.sql:30-50`). NULL price = "never successfully priced", never a fabricated 0.

**CRITICAL GAP — no old prices:** The pre-upsert read selects only `instrument_id, updated_at` (refresh-service.ts:99-103, used solely for the 60s dedup guard `shouldSkipRefresh`, `src/lib/prices/ingest.ts:73-80`). `RefreshSummary` (refresh-service.ts:20-28) returns only counts + timestamp — **no per-instrument prices at all**. So neither entry point can do crossing detection ("price moved from below threshold to above") from the return value. Two honest options for the planner:

1. **Extend the pre-upsert select to include `price`** — then inside `refreshAllPrices` (or a function it calls after the upsert at line 173, before/after `refreshFx` at line 176) both old and new prices exist per instrument, enabling true crossing detection for exactly the instruments that were fetched this cycle.
2. **Make alert state carry the memory instead** — evaluate `new price vs threshold` plus a per-alert armed/last-triggered state and cooldown (which ALRT-03 requires anyway). Then no old price is needed and dedup-skipped instruments are naturally excluded (their price didn't change).

Either way, the natural hook is **inside `refreshAllPrices` or a sibling function invoked from it**, not in the two callers — the callers would have to re-read `price_cache` and would duplicate the hook in two places (route + action) with drift risk. The admin client is already in hand there, which alert evaluation needs regardless (alerts span all users; the cron path has no user session at all).

**Dedup interaction:** instruments refreshed <60s ago are skipped (`instrumentsSkippedDedup`) and produce no new price this cycle. Failed fetches update `fetch_error` only and never clobber a good price (`recordPriceFetchFailure`, refresh-service.ts:190-216) — alert evaluation must not treat a failure row as a price change.

**Read-side precedent:** `src/lib/prices/get-portfolio-pnl.ts` is the read-only glue (cookie-bound client, RLS-scoped) — `readPriceCache` (lines 101-114) and `computeStaleness` (lines 149-167) show the house style for consuming `price_cache` rows and never fabricating values. An alerts page showing "current price vs threshold" should reuse this style (or these functions).

### 2. UI surfaces (ALRT-01, ALRT-02)

**`/alerts` page ALREADY EXISTS and is a rewrite target:** `src/app/(dashboard)/alerts/page.tsx` — a static, synchronous Server Component (no auth fetch) rendering `<AlertsTable alerts={[]} />` (line 30), a dead "Delivery Settings" button (lines 23-26), and three marketing cards (Price Alerts / Sentiment Shifts / Volume Spikes, lines 33-46). Header comment (line 5): "Phase 5 (ALRT-*) is not live yet — no mock store, no fabricated alerts."

**`AlertsTable` ALREADY EXISTS:** `src/components/dashboard/AlertsTable.tsx` — `'use client'`, consumes `AlertItem[]`, has a dead "Create Alert" button (lines 20-22), and renders delivery icons for `'Push' | 'Email' | 'In-App'` (lines 66-69) — **no Telegram delivery concept exists**. Its type unions include `sentiment_change`/`news_spike` (Phase 6 territory). This is mock-era scaffolding; Phase 5 owns `price_above`/`price_below` + Telegram only.

**Nav:** "Alerts" item already in `navigationItems` (`src/app/(dashboard)/layout.tsx:58`), with the badge deliberately absent — comment at lines 56-57: "No badge until a real alerts count exists (Phase 5/6)." Commit `3e6d0e5` removed the old hardcoded badge; the `badge?: number` field on `SidebarItem` (layout.tsx:47) remains and is renderable everywhere (desktop lines 156-163, mobile lines 339-341, drawer 444-448) if Phase 5 wants a real count. **No other alert dead code exists** — `grep -ri telegram src/` returns nothing; `AlertItem` is consumed only by AlertsTable.

**Settings page:** `src/app/(dashboard)/settings/page.tsx` exists but is a `'use client'` page for AI provider keys only, backed by localStorage + `/api/settings/keys` (`src/hooks/use-settings.ts:36-52`). That keys route writes to `.env.local` via `fs` and is explicitly marked as a deferred hack (`src/app/api/settings/keys/route.ts:6-7`). **Do NOT put Telegram linking through that route** — a chat id is per-user data and belongs in the DB behind RLS, not in a global env file. Natural homes for Telegram linking UI: the `/alerts` page itself (its dead "Delivery Settings" button is the obvious anchor) or a new section on `/settings`; either fits, but `/alerts` keeps Phase 5 to one page rewrite.

**House page pattern to copy (holdings/page.tsx:19-39):** Server Component, `await createClient()` → `auth.getUser()` → `if (!user) return null` → `getAccountId(supabase, user.id)` → server-side data fetch → render, with `'use client'` islands for interactivity (`HoldingFormDialog`, `RefreshPricesButton` embedded at lines 71-89). The em-dash pending pattern: a `—` with a title attr when data honestly doesn't exist yet (holdings/page.tsx:136-139). `StalenessBadge` (`src/components/dashboard/StalenessBadge.tsx`) is the precedent for a single shared status badge: no `'use client'` (purely presentational, usable from either side, lines 9-11), pinned `en-IN` / `Asia/Kolkata` formatting to avoid hydration mismatch (lines 18-35 — copy this if alert rows show timestamps).

**Client island interaction pattern to copy (RefreshPricesButton.tsx:22-63):** `useTransition` + inline error `<p>` (never swallowed), calls the Server Action directly, relies on the action's own `revalidatePath` — no manual `router.refresh()`.

### 3. Server Action conventions — what `src/server-actions/alerts.ts` must look like (ALRT-02)

The pattern, verbatim from `src/server-actions/portfolio.ts:1-32` and copied by `src/server-actions/import.ts:38-46`:

1. `'use server'` at the top; file-level comment naming the requirements it serves.
2. **Define a local copy of `requireAuthedContext`** (portfolio.ts:24-32): `createClient()` (cookie-bound, `@/utils/supabase/server`) → `auth.getUser()` → throw `Error('Unauthorized')` if null → `getAccountId(supabase, user.id)` (`src/lib/supabase/portfolio.ts:54`). It is deliberately duplicated per server-action file today, not shared — import.ts's header says "copy the requireAuthedContext cookie-bound pattern". Follow the copy precedent (or extract — but that's a deviation to call out in the plan, not silently do).
3. **NEVER import `@/utils/supabase/admin` in a user-facing Server Action** (portfolio.ts:6-7, import.ts:8-10, and the warning block in `src/utils/supabase/admin.ts:4-19`). User CRUD on alert rows goes through the cookie-bound client so RLS applies. (The webhook route and outbox dispatcher are NOT user-facing Server Actions — they legitimately use the admin client, like `/api/prices/refresh` does.)
4. Return shape for mutations: `type ActionResult = { success: true } | { success: false; error: string }` (portfolio.ts:22). Expected/recoverable failures return `{ success: false, error }`; invalid programmatic input throws (e.g. `assertValidBuySell`, portfolio.ts:34-37). Map known Postgres codes to friendly messages — `23505` → "Already on watchlist" precedent at portfolio.ts:288-291. Richer results use a subsystem discriminated union à la `ImportResult` (`src/lib/import/types.ts:120-122`, `{ ok: true, ... } | { ok: false; error }`).
5. `revalidatePath(...)` for EVERY page that renders the data, before returning success (portfolio.ts:12-14; every action revalidates `/`, `/holdings`, `/news`). Alert actions must revalidate `/alerts` (and `/` if a dashboard/nav count ever renders alert data).
6. Ticker selection: reuse `searchInstrumentsAction` (portfolio.ts:312-319) — the PORT-06 rule is "search the real ISIN+exchange master, never accept a free-text ticker", and per-ticker alerts (ALRT-02) fall squarely under it. The debounced-search UI precedent is `SymbolMappingSection`/`HoldingFormDialog`.

### 4. Env/secret conventions (ALRT-01, ALRT-03)

- `.env.local` currently holds (names only): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `YOUTUBE_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `HUGGINGFACE_API_KEY`, `PRICE_REFRESH_SECRET`. **There is no `.env.example`.** `TELEGRAM_BOT_TOKEN` (and a webhook secret, e.g. `TELEGRAM_WEBHOOK_SECRET`) go in `.env.local`, server-only, never `NEXT_PUBLIC_`-prefixed (admin.ts:23 comment is the precedent for that rule).
- **Secret-guard pattern to replicate:** a PURE predicate, unit-tested, where an empty/unset expected secret ALWAYS denies — `isAuthorizedRefreshRequest` (`src/lib/prices/ingest.ts:88-94`): "prevents an unconfigured secret from silently becoming an open endpoint." Tested in `scripts/price-pnl-test.ts`. The Telegram webhook validator should be the same shape (note: Telegram delivers its secret in the `X-Telegram-Bot-Api-Secret-Token` header set via `setWebhook`, not `Authorization: Bearer` — sibling research doc's territory, but the predicate style transfers directly).
- **Guard BEFORE touching Supabase:** route.ts:6-15 — the check happens before `createAdminClient()` is ever called.
- **Proxy already clears the path for a webhook route:** `src/proxy.ts:42-57` — `/api/*` paths are NEVER redirected to `/login` (this was a live-verified bug fix: the pg_cron POST was being 307'd to /login even with the correct secret). A `POST /api/telegram/webhook` (or similar) will reach its handler; it authenticates itself via the secret header + admin client, exactly like `/api/prices/refresh`. The proxy matcher (proxy.ts:73-84) covers all non-static paths, so the session-refresh still runs harmlessly on webhook requests.
- **Cron secret provisioning precedent** (for an outbox-dispatch cron, ALRT-05): `supabase/migrations/20260714220438_price_refresh_cron.sql:12-19` — pg_cron + pg_net read the URL and secret from Postgres custom settings (`current_setting('app.settings...', true)`), set ONCE by an operator via `ALTER DATABASE`, never hardcoded in a migration. Unset settings make the job fail loudly, not silently.
- **Server-only fetch wrapper house style** (`src/lib/prices/fetch-prices.ts`, `src/lib/prices/fx-rates.ts`) — a `sendTelegramMessage` wrapper must mirror it:
  - Discriminated-union result: `{ price, changePct, fetchError: null } | { price: null, changePct: null, fetchError: string }` (fetch-prices.ts:19-21); FX equivalent at fx-rates.ts:33.
  - Everything try/caught; non-OK → `` `HTTP ${res.status}` ``; unparseable body → `'Malformed response from …'`; thrown error → `err.message` (fetch-prices.ts:35-57).
  - Batch never throws as a whole — one bad item resolves to a per-item error result (`Promise.allSettled` + defensive fallback, fetch-prices.ts:66-96).
  - Never fabricate a value on failure; the caller preserves last-known-good state (fx-rates.ts:20-30 explicitly rejects the fallback-to-1 anti-pattern).
  - **Honest note: neither wrapper sets a fetch timeout/AbortSignal** — "timeout" is NOT part of the existing house style, despite what one might assume. If the planner wants timeouts on Telegram calls (reasonable for an outbox dispatcher), that is a new addition, not a convention to copy.
  - Response parsing lives in a separate pure, unit-testable function (`parseYahooChartResponse` in ingest.ts vs the fetch in fetch-prices.ts — "owns ONLY how we get the bytes", fetch-prices.ts:1-15).

### 5. Test + verification conventions (all ALRT-*)

- **Existing npm test scripts (collision list, package.json:10-14):** `test:rls`, `test:derive-holdings`, `test:price-pnl`, `test:import-primitives`, `test:import-parse`. All run via `tsx scripts/<name>-test.ts`. Names like `test:alerts`, `test:outbox`, `test:telegram` are free.
- **Script style** (`scripts/price-pnl-test.ts:1-42` header is the canonical statement): PURE unit test — no database, no network, no env vars; `node:assert/strict`; `console.log('PASS')` + `process.exit(0)` on success, throw/non-zero on failure; "Do NOT weaken these assertions to make the script pass" comment. Exception: `scripts/rls-isolation-test.ts` hits the live DB (and currently honest-fails on the unapplied import migration). Phase 5's pure logic (crossing/cooldown predicates, webhook-secret predicate, outbox state transitions) should get this treatment; anything needing the live DB joins the deferred bucket.
- **"Static verified" means:** `npx tsc --noEmit` clean + the relevant `npm run test:*` passing + plan-specified grep gates + (for UI plans) `npm run build` clean. See 04-07-SUMMARY.md's "Honestly verified NOW" table for the exemplar.
- **Deferral checkpoint style** (`.planning/phases/04-csv-import/04-07-SUMMARY.md`): a phase-closing `checkpoint:human-verify` plan; if the user defers, the SUMMARY records mode DEFERRED with (a) an honest-state table of what WAS re-verified now, (b) the exact deferred item list, (c) a resume path, and (d) requirements deliberately NOT upgraded past code-complete/static-verified. Phase 5 will need the same: live Telegram delivery requires a deployed public URL for the webhook (or a polling workaround — sibling doc's call), and per MEMORY/STATE.md this machine has **no Docker and no linked live Supabase**.
- **Migration state caution (STATE.md STILL OPEN items 1, 2, 6):** `20260714220438_price_refresh_cron.sql` and `20260715230011_csv_import.sql` are authored but deliberately NOT pushed. Any Phase 5 migration (alerts table, telegram_links, notifications_outbox, optional dispatch cron) joins that unpushed queue, and a **blanket `supabase db push` would also apply the held-back cron migration** — plans must repeat the "push selectively / with consent" warning. A Phase 5 outbox-dispatch cron job is deploy-gated for the identical reason the price cron is (Supabase cloud pg_net cannot reach localhost).

### 6. Existing types + naming conventions (ALRT-02)

- **`src/lib/types.ts`** — shared domain types: camelCase interfaces (`instrumentId`, `priceSourceSymbol`), string-literal unions for enums (`TransactionType`, types.ts:10), nullable fields documented with honesty comments ("null for SPLIT/BONUS", types.ts:30). DB rows are snake_case and mapped manually in the data layer (e.g. `display_name` → `displayName`, import.ts:85-95).
- **`AlertItem` (types.ts:96-103) is mock-era and MUST be evolved or replaced:** `type: 'price_above' | 'price_below' | 'sentiment_change' | 'news_spike'` (last two are Phase 6's ALRT-04/NEWS territory), `threshold: string` (not a number), `delivery: 'Email' | 'Push' | 'In-App'` (Telegram absent), no `instrumentId`, no cooldown/last-triggered, no account ownership. Its own doc comment (types.ts:82-83) says it exists so the UI can "pass an honest empty array until Phase 5/6 lands a real source for this shape." Only consumer: `AlertsTable.tsx:5`.
- **Subsystem type-file precedent:** `src/lib/import/types.ts:1-6` — a declarations-only file per subsystem so every module shares one vocabulary and drift is "structurally impossible." Phase 5's alert/outbox machinery types belong in an analogous `src/lib/alerts/types.ts` (or similar), importing shared primitives (`Currency`, `Exchange`) from `@/lib/types` the way import/types.ts:8 does; whatever shape the UI renders can live in or re-export through `src/lib/types.ts`.
- **Pure-logic module layout precedent:** `src/lib/prices/` — pure logic (`ingest.ts`, `pnl-calculator.ts`) separated from network wrappers (`fetch-prices.ts`, `fx-rates.ts`) separated from Supabase orchestration (`refresh-service.ts`, `get-portfolio-pnl.ts`). `src/lib/alerts/` (evaluation predicates, cooldown math — pure) + a Telegram send wrapper + an orchestration file mirrors this exactly and keeps everything unit-testable under the scripts/*-test.ts regime.

---

## Conventions Checklist for the Planner

- [ ] Server Actions: `'use server'`, local `requireAuthedContext` copy, cookie-bound client only, `ActionResult` shape, Postgres-code → friendly-message mapping, `revalidatePath('/alerts')` on every mutation (portfolio.ts pattern).
- [ ] Webhook/cron routes: pure secret predicate (empty secret ⇒ deny), guard before any Supabase call, admin client only after guard, `NextResponse.json` error shapes (route.ts pattern). `/api/*` is already exempt from proxy login redirects (proxy.ts:54).
- [ ] Admin client (`createAdminClient`) ONLY in the webhook route, outbox dispatcher, and refresh-cycle evaluation — never in user-facing Server Actions or reads.
- [ ] Fetch wrappers: discriminated-union results, never throw for a batch, never fabricate, `HTTP ${status}` / malformed / caught-message error taxonomy; parsing in a separate pure function. (No timeout precedent exists — adding one is a conscious new decision.)
- [ ] New tables: new timestamped migration under `supabase/migrations/` (never edit an existing one — 20260714220333 header states this), RLS enabled, account-ownership policies for user tables (import migration precedent), no permissive write policies on shared/service-written tables (outbox writes = service-role only, like price_cache).
- [ ] UI: rebuild `/alerts` as async auth-guarded Server Component shell (holdings/page.tsx:19-27 pattern) + client islands; `useTransition` + inline error; em-dash for honestly-absent data; shared badge components without `'use client'`; pinned `en-IN`/`Asia/Kolkata` for any rendered timestamps (StalenessBadge lesson — real hydration bug, verified live 2026-07-15).
- [ ] Types: subsystem `src/lib/alerts/types.ts` declarations-only file; camelCase app types mapped from snake_case rows in the data layer; replace/evolve mock-era `AlertItem` and delete what nothing consumes (governing rule: "a feature is not done until its mock module is deleted", ROADMAP.md).
- [ ] Tests: pure `tsx scripts/<name>-test.ts` + `node:assert/strict` + registered npm script; static verification = tsc + tests + greps + build; live Telegram/cron behavior goes to a phase-closing human-verify checkpoint, recorded DEFERRED-honestly if blocked (04-07-SUMMARY.md template).
- [ ] Commits: per-task commits (per MEMORY.md), plain `git commit` (gsd-tools commit is broken on Windows).

## Collision Warnings

| Collision | Detail |
|-----------|--------|
| **Route `/alerts` exists** | `src/app/(dashboard)/alerts/page.tsx` — plans must EDIT/rewrite it, not create it. Its "Delivery Settings" dead button and Phase-6 marketing cards (Sentiment Shifts / Volume Spikes) are inherited decisions to keep, rework, or remove. |
| **Component `AlertsTable` exists** | `src/components/dashboard/AlertsTable.tsx` — dead "Create Alert" button, `Push/Email/In-App` delivery icons, Phase 6 type branches. Rewrite target. |
| **Type `AlertItem` exists** | `src/lib/types.ts:96-103` — name is taken; evolving it in place changes AlertsTable's props. Plan the type change and component change together. |
| **Nav item "Alerts" exists** | layout.tsx:58 — do NOT add a second one. `badge` field is available for a real count (3e6d0e5 removed the fabricated one; don't reintroduce a hardcoded number). |
| **npm script names taken** | `test:rls`, `test:derive-holdings`, `test:price-pnl`, `test:import-primitives`, `test:import-parse`. |
| **`requireAuthedContext` defined twice already** | portfolio.ts:24 and import.ts:38 — a third copy in alerts.ts follows precedent; importing across server-action files does not. |
| **Unpushed migration queue** | csv_import + price_refresh_cron are pending; blanket `supabase db push` applies the deliberately-held-back cron job (STATE.md item 1/6). Phase 5 migrations inherit this caution verbatim. |
| **Two sibling research docs** | Written concurrently as `05-RESEARCH-*.md` in this same directory — this doc deliberately does NOT cover Telegram Bot API specifics or outbox/schema design; do not duplicate. Orchestrator commits; known git-index race hazard, no git run here. |
| **`/api/settings/keys` env-file writer** | Do not route Telegram data through it — chat ids are per-user DB data, and that route is a flagged deferred hack (keys/route.ts:6-7). |

## Open Questions

1. **Old-price availability for crossing detection** — extend `refreshAllPrices`'s pre-upsert select to include `price` (minimal diff, gives true old→new pairs) vs. purely stateful per-alert evaluation (armed/cooldown state, no pipeline change). Recommendation: decide jointly with the sibling alert-engine research; note the cooldown requirement (ALRT-03) forces per-alert state either way, which weakens the case for touching the select at all.
2. **Where evaluation runs relative to `revalidatePath`** — `refreshPricesNow` revalidates `/` and `/holdings` (prices.ts:31-32); if alert rows render trigger status, `/alerts` needs revalidation from the refresh path too — but the cron route calls `refreshAllPrices` outside any request-render context. Verify `revalidatePath` behavior from a Route Handler in this Next.js version (`node_modules/next/dist/docs/` per AGENTS.md) before relying on it there.
3. **Telegram linking UI home** — `/alerts` "Delivery Settings" anchor vs `/settings` section. No existing convention forces either; `/alerts` minimizes surface area (one page rewrite instead of two).
4. **Webhook local verifiability** — webhook delivery needs a public URL (deploy-gated exactly like the price cron); whether a `getUpdates` polling fallback is worth building for local dev is the Telegram-API sibling doc's question, but the DEFERRED-checkpoint machinery (04-07 pattern) is ready either way.

## Sources

### Primary (HIGH confidence — all read directly from the working tree, 2026-07-16)
- `src/lib/prices/refresh-service.ts`, `src/lib/prices/ingest.ts`, `src/lib/prices/fetch-prices.ts`, `src/lib/prices/fx-rates.ts`, `src/lib/prices/get-portfolio-pnl.ts`
- `src/app/api/prices/refresh/route.ts`, `src/server-actions/prices.ts`, `src/server-actions/portfolio.ts`, `src/server-actions/import.ts`
- `src/app/(dashboard)/alerts/page.tsx`, `src/components/dashboard/AlertsTable.tsx`, `src/app/(dashboard)/layout.tsx`, `src/app/(dashboard)/holdings/page.tsx`, `src/app/(dashboard)/settings/page.tsx`, `src/components/dashboard/StalenessBadge.tsx`, `src/components/dashboard/RefreshPricesButton.tsx`
- `src/lib/types.ts`, `src/lib/import/types.ts`, `src/lib/supabase/portfolio.ts`, `src/utils/supabase/admin.ts`, `src/proxy.ts`, `src/hooks/use-settings.ts`, `src/app/api/settings/keys/route.ts`
- `supabase/migrations/20260714220333_price_fx_schema.sql`, `supabase/migrations/20260714220438_price_refresh_cron.sql`
- `package.json`, `scripts/` listing, `scripts/price-pnl-test.ts`
- `.planning/phases/04-csv-import/04-07-SUMMARY.md`, `.planning/STATE.md` (STILL OPEN), `.planning/ROADMAP.md` (Phase 5), `.planning/REQUIREMENTS.md` (ALRT-*)
- `git show --stat 3e6d0e5`; `.env.local` key NAMES only (values not read)

## Metadata

**Confidence breakdown:**
- Pipeline hook points: HIGH — full source read, gap (no old prices) verified at the exact select
- UI surfaces / collisions: HIGH — every named file read end-to-end
- Conventions: HIGH — each cited to the file that states it as a rule, not inferred
- Open Question 2 (revalidatePath from Route Handler): LOW — flagged for planner verification against `node_modules/next/dist/docs/` (this Next.js version has breaking changes per AGENTS.md; not verified here)

**Research date:** 2026-07-16
**Valid until:** any commit touching `src/lib/prices/`, `src/server-actions/`, or the alerts page invalidates the relevant sections — re-check cites after Phase 5 wave 1
