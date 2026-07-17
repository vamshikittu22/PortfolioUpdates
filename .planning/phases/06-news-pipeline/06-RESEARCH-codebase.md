# Phase 6: News Pipeline + Summarization — Codebase Integration Research

**Researched:** 2026-07-16
**Domain:** Existing-codebase integration surface (one of three parallel research slices; external stack/API research covered elsewhere)
**Confidence:** HIGH — every claim below is from a direct read of the cited file in this repo; no external sources used

## Summary

Phase 6 plugs into a codebase that has already pre-provisioned for it in four places: (1) a Phase-1-era `news_items` table exists (applied live, zero rows, service-role-write-only), but it is symbol-keyed and shaped for the mock UI, not for NEWS-02's dedup/instrument-matching — it needs the same re-keying treatment `price_cache` got in Phase 3; (2) the `/news` page and `NewsFeed` component are already real (auth-guarded RSC, honest empty state) and only need a real data source wired in — the 05-08 `/alerts` rewrite-in-place precedent applies but the surface is much smaller here; (3) the notifications outbox already enumerates `news_alert` in both the TS union and the SQL CHECK, and `computeAlertDedupeKey`'s doc comment prescribes the exact Phase 6 dedupe-key shape (`news_alert:{userId}:{urlHash}`) — ALRT-04 is a sweep-function clone, zero outbox migration; (4) the pipeline-entry precedent is unambiguous: a separate secret-guarded route with its own independently-rotatable secret (the `NOTIFY_DISPATCH_SECRET` vs `PRICE_REFRESH_SECRET` precedent), never piggybacking heavy work onto the 3-hourly price cron.

Two hazards need explicit plan-level handling: five uncommitted dirty files (including `src/lib/types.ts`, which owns the mock-era `NewsItem` type, and `src/lib/supabase/portfolio.ts`, which owns `getAccountId`/`getHoldings`) sit exactly on Phase 6's natural path; and REQUIREMENTS.md NEWS-04 names `@google/genai` while the repo has only the legacy `@google/generative-ai@^0.24.1` installed and used in three files.

**Primary recommendation:** New migration re-keying/extending `news_items`; new `src/lib/news/*` module tree (types in a NEW file, not dirty `types.ts`); a news sweep cloning `src/lib/alerts/sweep.ts` enqueue-first; a standalone `/api/news/refresh` route cloning the dispatch route's guard; wire `NewsFeed` via the `/news` RSC.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NEWS-01 | Fetch news for held+watched tickers from free sources | Scoping precedent: `discoverInstrumentIds` (refresh-service.ts:43) unions `transactions` + `watchlist_items` instrument_ids via admin client; fetch-wrapper style: `fetch-prices.ts` / `telegram/api.ts` |
| NEWS-02 | Dedup (URL + normalized-title hash) + word-boundary ticker matching | `news_items.url UNIQUE` already exists; title-hash column must be added by migration; hashing precedent `src/lib/import/row-hash.ts` (sha256 over normalized strings, pure); naive `crossReferenceHoldings` in `gemini.ts` is NOT sufficient precedent |
| NEWS-03 | Portfolio-filtered feed, newest first, source + timestamp | `/news` RSC + `NewsFeed.tsx` already render exactly this shape from `NewsItem[]`; read path = cookie client per admin-client rule |
| NEWS-04 | Batched AI summaries via `@google/genai`, persisted, never regenerated | `news_items.summary` column exists; SDK DISCREPANCY: repo has legacy `@google/generative-ai` (see Pitfall 5); persistence = service-role write like `refreshAllPrices` |
| NEWS-05 | Budget exhaustion degrades to headlines-only | Honest-degradation house pattern: `fetch-prices.ts` per-item error results; `telegram/api.ts` "not configured" results; never fabricate |
| ALRT-04 | Telegram alert on significant news for held ticker | `news_alert` kind pre-enumerated in `notifications/types.ts:8` + migration CHECK (alerts_telegram.sql:91); dedupe key shape prescribed at `evaluate.ts:102`; sweep pattern = `sweep.ts` clone |
</phase_requirements>

*(No CONTEXT.md exists for Phase 6 — `.planning/phases/06-news-pipeline/` was empty at research time. No user constraints to carry.)*

## Q1: The existing `news_items` table

### Exact current DDL (supabase/migrations/20260714032952_initial_schema.sql:154-171)

```sql
CREATE TABLE IF NOT EXISTS public.news_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    headline TEXT NOT NULL,
    summary TEXT,
    url TEXT UNIQUE NOT NULL,
    source TEXT,
    published_at TIMESTAMPTZ NOT NULL,
    sentiment NUMERIC CHECK (sentiment >= -1 AND sentiment <= 1),
    sentiment_label TEXT CHECK (sentiment_label IN ('Bullish', 'Bearish', 'Mixed', 'Neutral')),
    affected_symbols TEXT[] NOT NULL,
    importance TEXT CHECK (importance IN ('High', 'Medium', 'Low')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### RLS posture (verified across two migrations + the test)

- `20260714032952_initial_schema.sql:169-171`: RLS enabled; authenticated SELECT `USING (TRUE)`; authenticated INSERT `WITH CHECK (TRUE)` (the original write hole).
- `20260714032957_rls_fixes.sql:11`: `DROP POLICY "Allow authenticated users to insert news"` — the write hole is CLOSED. Writes are **service-role only**; authenticated SELECT remains.
- `scripts/rls-isolation-test.ts:185-198` (check 4): asserts authenticated INSERT into `news_items` is rejected AND authenticated SELECT still works. **Any Phase 6 migration must keep this exact posture** or `npm run test:rls` breaks. The instruments migration (20260714160720:22-25) and fx migration (20260714220333:16-19) both cite news_items as the canonical "shared read-only, service-role write" pattern — do NOT add a permissive write policy.

### Live status

Per `.planning/STATE.md` (Verification status, cleared item 1 + 3): all 5 Phase 1/2 migrations ARE applied to the live hosted Supabase (`ozkorwkhtamyaavuphhm`), and `test:rls` previously PASSED the news_items write-hole check live. So `news_items` **exists live with zero rows** — schema changes need no backfill, but the table cannot be assumed absent.

### What a Phase 6 migration must add vs replace

The current table is Phase-1 mock-era and mismatches Phase 6 requirements in four ways:

| Gap | Current state | Requirement |
|-----|---------------|-------------|
| Dedup | `url UNIQUE` only | NEWS-02 also needs normalized-title-hash dedup → new column (e.g. `title_hash TEXT`) + unique index (partial-unique-index precedent: `uniq_notifications_outbox_dedupe`, alerts_telegram.sql:116-117; `uniq_transactions_import_row_hash` from Phase 4) |
| Instrument identity | `affected_symbols TEXT[]` — bare symbols, pre-Phase-2 identity (same flaw `price_cache` had: INFY on NSE vs NYSE indistinguishable) | Matching to instruments needs `instrument_id` linkage — either a join table (`news_item_instruments(news_item_id, instrument_id)` FK'd like `transactions.instrument_id`, 20260714160720:36) or keep the array for macro items + a join table for matched ones. Planner's call; the join table is the only shape that supports "one article, many instruments" with FK integrity |
| Column naming vs UI | `headline` | UI `NewsItem` (types.ts:84-94) uses `title`; also UI has `category: 'Holdings'|'Watchlist'|'Macro'` which is per-USER (derived at read time from the caller's portfolio), so it must NOT be a column on the shared table |
| Summarization state | `summary TEXT` exists but no "summarized/pending/degraded" state, no notified flag | NEWS-04 (persist, never regenerate) and NEWS-05 (headlines-only degradation) need an honest state column or nullable-summary-means-pending semantics; ALRT-04 sweep needs either a notified marker or pure dedupe-key reliance (see Q3) |

**Migration precedent choice — two house-sanctioned options, both used before:**
1. **ALTER/re-key in a new migration** — exactly what `20260714220333_price_fx_schema.sql:24-31` did to `price_cache` ("table has never held live data... safe without a backfill step" — same argument holds for news_items).
2. **DROP and replace** — what `20260716221450_alerts_telegram.sql:9` did to the legacy `alerts` table and Phase 2 did to `holdings`.

Either way the hard rule (stated in headers of 20260714220333 and 20260716221450) is: **NEW timestamped migration file, never edit an existing migration.**

**Pending-migration caution for the planner:** two migrations are already authored-but-unapplied live (`20260715230011_csv_import.sql`, `20260716221450_alerts_telegram.sql` — consent-gated) and `20260714220438_price_refresh_cron.sql` is deliberately held back (deploy-gated; STATE.md STILL OPEN items 1, 6, 7). Phase 6's migration joins this queue. Any future `supabase db push` must remain selective — a blanket push would activate the cron job that silently fails from localhost. Live-verification tasks in Phase 6 plans should expect DEFERRED status (memory: no-Docker/defer-verification; 03-06/04-07/05-09 precedent).

**Bonus existing hook:** `account_settings.refresh_interval_news INTEGER DEFAULT 6` already exists (initial_schema.sql:180) — an unused Phase-1 knob; do not confuse it with a new mechanism, and do not assume it is wired to anything.

## Q2: News UI stubs — exact inventory

| Path | State | Phase 6 action |
|------|-------|----------------|
| `src/app/(dashboard)/news/page.tsx` | ALREADY REAL: async auth-guarded RSC (`createClient` → `auth.getUser()` → `if (!user) return null` → `getAccountId` → `getPricedWatchlist`). Renders `<NewsFeed news={[]} />` (line 66) with an explicit comment "News (Phase 6) has no real source yet". Two INERT toolbar buttons: "Filters" and "Preferences" (lines 49-57, no handlers) — the 02-06 plan left them "pending their own future wiring". The mock "Tracking Panel"/`newsPrefs` was already deleted in 02-06 | Rewrite in place (05-08 `/alerts` precedent): swap `news={[]}` for a real server read; wire or honestly remove the inert Filters/Preferences buttons |
| `src/components/dashboard/NewsFeed.tsx` | Real client component, fully built UI: filter chips All/Holdings/Watchlist/Macro with live counts, per-item card (category badge, `timeAgo`, sentiment badge Bullish/Bearish/Mixed/Neutral, title, summary line-clamped, source, ticker chips, external link), honest empty state per filter. Consumes `NewsItem[]` from `@/lib/types` | Likely reusable near-verbatim if the server read produces the existing `NewsItem` shape (id, title, source, publishedAt, sentiment, tickers, summary, url, category). Category is computed per-user at read time |
| `src/lib/types.ts:84-94` | `NewsItem` interface — the mock-era display shape, explicitly documented as "pass an honest empty array until Phase 5/6". Also `WatchlistItem` carries optional Phase-6 fields `sentiment?`, `newsCount?`, `insight?` (lines 76-79) | **DIRTY FILE — see Q5.** Prefer defining Phase 6 domain types in a new `src/lib/news/types.ts` and keeping `types.ts` untouched unless a display-shape change is unavoidable |
| `src/app/(dashboard)/layout.tsx:53` | `{ name: 'News', href: '/news', icon: Newspaper }` — nav entry already exists (desktop sidebar, mobile primary tabs slice 0-4 includes News) | No nav change needed. Note lines 56-57: no hardcoded badge counts allowed (house rule) |
| `src/app/(dashboard)/layout.tsx:254` | Header search placeholder mentions "news" | Cosmetic, not wired; out of scope |

There is NO existing `src/lib/news/` directory, no news Server Action, no news API route — all greenfield.

## Q3: Phase 5 outbox interface — the exact contract

### Enqueue (src/lib/notifications/outbox.ts:36-56, types at src/lib/notifications/types.ts)

```ts
enqueueNotifications(admin: SupabaseClient, rows: EnqueueRow[]): Promise<void>

type EnqueueRow = {
  userId: string;
  kind: 'price_alert' | 'news_alert' | 'daily_digest';   // news_alert ALREADY enumerated
  payload: { text: string; [k: string]: unknown };        // text = fully pre-rendered HTML message
  dedupeKey: string | null;
};
```

- Implementation: upsert onto `notifications_outbox` with `{ onConflict: 'dedupe_key', ignoreDuplicates: true }` — dedup is DB-enforced by partial unique index `uniq_notifications_outbox_dedupe` (alerts_telegram.sql:116-117, non-null keys only).
- `payload.text` MUST be fully pre-rendered at enqueue: `dispatchOutbox` is 100% kind-agnostic and never re-renders (outbox.ts header + migration comment alerts_telegram.sql:93-95 — "the Phase 6/7 reuse guarantee"). Phase 6 needs a pure message builder mirroring `buildPriceAlertMessage` (src/lib/telegram/build-message.ts): HTML parse_mode, `escapeHtml` (3 entities: `&`, `<`, `>`, `&` first), 4096-char truncation. News headlines are user-visible external text — they MUST pass through `escapeHtml`.
- **Dedupe key shape is already prescribed in code** — `src/lib/alerts/evaluate.ts:102`: "Phase 6 will use `news_alert:{userId}:{urlHash}`". Follow it verbatim; URL-hash (not time-bucketed) means one article can never notify the same user twice, ever.
- `news_alert` requires **zero outbox migration**: the TS union (types.ts:8) and the SQL CHECK (alerts_telegram.sql:91) both already include it.

### The sweep pattern to mirror (src/lib/alerts/sweep.ts)

`evaluateAndEnqueueAlerts(admin)` establishes the template a news-significance sweep must clone:
1. Accepts an ALREADY-CONSTRUCTED admin client — never builds one (header comment; same rule in outbox.ts and refresh-service.ts).
2. Admin client is REQUIRED because the sweep is cross-user (all users' holdings, not one caller's — `discoverInstrumentIds` rationale).
3. Loads DB rows → maps to a PURE evaluator's input shape → runs pure logic → for each hit: (a) pre-render message text, (b) **enqueue FIRST**, (c) THEN stamp state (`last_triggered_at` there; a `notified_at`/equivalent for news, or nothing at all since the URL-hash dedupe key is idempotent by construction). The enqueue-first ordering with dedupe-key backstop is the documented crash-recovery contract (sweep.ts:16-23) — replicate the reasoning comment.
4. Resolves recipient as a USER id via `investment_accounts.user_id` join; chat_id resolution happens ONLY at dispatch time (sweep.ts:90-92).
5. Supabase to-one FK relations normalize via `firstOf` helper (object-or-array quirk, sweep.ts:57-60).

### Dispatch route + secret guard pattern (src/app/api/notifications/dispatch/route.ts)

```ts
const authHeader = request.headers.get('authorization');
if (!isAuthorizedRefreshRequest(authHeader, process.env.NOTIFY_DISPATCH_SECRET ?? '')) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
// only THEN: createAdminClient() → do work → NextResponse.json({ success: true, ...summary })
```

- Guard predicate is the shared pure function `isAuthorizedRefreshRequest` from `@/lib/prices/ingest` (empty/unset secret ALWAYS denies; tested in 03-02). Guard runs BEFORE `createAdminClient()` — an unauthorized request never touches Supabase. A Phase 6 `/api/news/refresh` route should be a structural clone of this 27-line file.

## Q4: Pipeline placement

### How the price refresh tail is composed (src/app/api/prices/refresh/route.ts:19-37; mirrored in src/server-actions/prices.ts:34-59)

```
admin = createAdminClient()
summary = refreshAllPrices(admin)
try {                                        // inner try/catch — Telegram problems
  evaluated = evaluateAndEnqueueAlerts(admin)  //   NEVER fail the price refresh
  dispatched = dispatchOutbox(admin)
} catch { alertsResult = { ..., error } }
return { success: true, ...summary, alerts: alertsResult }
```

Two entry points exist for the same orchestration: the secret-guarded cron route (`PRICE_REFRESH_SECRET`) and the auth-gated `refreshPricesNow` Server Action (getUser gate, calls in-process — never HTTP with the secret; also `revalidatePath('/')`, `/holdings`, `/alerts`). No `revalidatePath` in the route (runs outside render context — route.ts:27).

### Precedent answer: own route, own secret

Phase 3/5 precedent is explicit and consistent:
- Phase 3: dedicated `/api/prices/refresh` + `PRICE_REFRESH_SECRET` + pg_cron every 3h (deploy-gated migration).
- Phase 5: dedicated `/api/notifications/dispatch` + **separate** `NOTIFY_DISPATCH_SECRET`, documented rationale in `.env.local:44-46`: "kept SEPARATE from PRICE_REFRESH_SECRET for independent rotation / least privilege".

**Recommendation: Phase 6 gets its own `/api/news/refresh` route guarded by a new `NEWS_REFRESH_SECRET`**, cloning the dispatch route's structure. Reasons grounded in the codebase: (a) the least-privilege/independent-rotation precedent above; (b) news ingestion (RSS + Finnhub fetch + batched AI summarization) is far heavier/slower than the price fetch — bolting it onto the 3-hourly price cron risks making pg_cron record price refreshes as failing (the exact failure mode the inner try/catch was built to prevent, prices/refresh/route.ts:23-27); (c) news cadence is independently tunable (`refresh_interval_news` default 6h vs price 3h). The news route's tail should still end with `dispatchOutbox(admin)` reuse so significant-news messages go out on the same run — that is the piggyback part worth keeping. Any news cron migration will be deploy-gated exactly like `price_refresh_cron.sql` (settings via `ALTER DATABASE ... SET app.settings.*`, never secrets in git).

### Held+watched scoping precedent (src/lib/prices/refresh-service.ts:43-57)

```ts
async function discoverInstrumentIds(admin) {
  const [txResult, watchlistResult] = await Promise.all([
    admin.from('transactions').select('instrument_id'),
    admin.from('watchlist_items').select('instrument_id'),
  ]);
  // union into a Set — every instrument referenced by ANY user's transactions or watchlist
}
```

News fetching scopes the same way, but needs symbols/company names, not just ids — join to `instruments` (`symbol, display_name, exchange, currency`; `price_source_symbol` is for Yahoo, NOT for news queries). Per-user feed filtering at READ time is the cookie-client side: `getHoldings(supabase, accountId)` (derives held tickers from transactions — same call the YouTube analyze route uses) + `getWatchlist(supabase, accountId)` (`src/lib/supabase/portfolio.ts:74,145`), pattern live in `/news/page.tsx` already. The write side (ingest, service role, cross-user) and the read side (feed, cookie client, RLS-scoped) must stay separated exactly as prices do.

## Q5: Conventions inventory for the planner

### Server Action pattern (src/server-actions/alerts.ts — the freshest exemplar)

- File-level `'use server'`; lives in `src/server-actions/<domain>.ts`.
- File-local helper (redeclared per file, not shared): `requireAuthedContext(): Promise<{ supabase, accountId }>` — `createClient()` → `auth.getUser()` → throw `'Unauthorized'` → `getAccountId(supabase, user.id)` (alerts.ts:46-54).
- `type ActionResult = { success: true } | { success: false; error: string }` (alerts.ts:44); expected failures return `{ success: false, error }`, never throw; Postgres 23505 mapped to friendly text (alerts.ts:69-74).
- Every mutation ends with `revalidatePath('/<page>')`.
- **Gotcha documented in-code:** a bare `export { x } from './other'` re-export inside a `'use server'` module silently zeroes ALL client-bundle exports (alerts.ts:32-39; found only via `npm run build`). Always declare a real async wrapper function.

### Fetch wrapper style (src/lib/prices/fetch-prices.ts, src/lib/telegram/api.ts)

- Wrapper owns ONLY "how do we get the bytes and handle the network failing"; ALL response-interpretation lives in separate pure, TDD-tested functions (`parseYahooChartResponse`, `classifySendError`) — never inline.
- Never throws per item: discriminated-union result types (`{ ...data, fetchError: null } | { nulls, fetchError: string }`); batch via `Promise.allSettled` with defensive fallback (fetch-prices.ts:66-96) — EXCEPT rate-limited APIs which send sequentially (outbox.ts:100-102).
- Unset/placeholder API keys yield honest "not configured" error results, never throws, never fabricated success (telegram/api.ts:30-34,48-51).
- Yahoo requests need the browser User-Agent constant (fetch-prices.ts:25-26).

### TDD pattern + npm test scripts ALREADY TAKEN (package.json:10-16)

Pure logic in `src/lib/<domain>/*.ts` (zero I/O, injected `now`) proven by `scripts/<name>-test.ts` using `node:assert/strict`, run via `tsx`, registered as an npm script, committed RED then GREEN. **Taken script names:** `test:rls`, `test:derive-holdings`, `test:price-pnl`, `test:import-primitives`, `test:import-parse`, `test:telegram`, `test:alerts`. (`dev`, `build`, `start`, `lint` also taken.) Free for Phase 6: e.g. `test:news`, `test:news-match`. Only ONE plan per wave may own `package.json` (05-02 was "sole wave-1 package.json owner" — STATE.md).

### Env var conventions (.env.local — gitignored, real file exists)

- Server-only secrets NEVER `NEXT_PUBLIC_`-prefixed (admin.ts:23 rule).
- New vars land as LABELED PLACEHOLDERS with a comment stating where to get them and what happens while unset (e.g. `TELEGRAM_BOT_TOKEN=your-telegram-bot-token` + "returns an honest 'not configured' error result").
- Self-generated bearer secrets via `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`; ONE secret per route for independent rotation.
- Already present and reusable: `GEMINI_API_KEY` (real value set), `OPENROUTER_API_KEY`, `HUGGINGFACE_API_KEY`, `YOUTUBE_API_KEY` (placeholder). Phase 6 adds (likely): `FINNHUB_API_KEY` placeholder + `NEWS_REFRESH_SECRET`.

### Admin-client usage rule (src/utils/supabase/admin.ts + sweep.ts)

- User-owned rows → cookie-bound client (`@/utils/supabase/server`) so RLS authorizes; NEVER admin "to make a user query work" (admin.ts:9-10 warning names the "future news-ingest jobs that write the shared `news_items` table" as the sanctioned admin use case — Phase 6 is literally the anticipated caller).
- Closed system tables (`price_cache`, `fx_cache`, `news_items`, `notifications_outbox`, `telegram_links` binding) → admin client, constructed ONLY at the call site (route/action) behind a gate (secret guard or `getUser()`), then PASSED into lib functions (sweep.ts/outbox.ts/refresh-service.ts headers all state "accepts an ALREADY-CONSTRUCTED admin client").
- `import 'server-only'` in admin.ts makes client-side import a build failure.

### Dirty-file warnings (uncommitted, UNRELATED lot-editing work — verify with git status at plan time)

| File | Phase 6 relevance | Handling |
|------|-------------------|----------|
| `src/lib/types.ts` (modified) | Owns `NewsItem` + `WatchlistItem` Phase-6 optional fields | **Highest risk.** Prefer new `src/lib/news/types.ts` for domain types; if the display `NewsItem` must change, isolate in its own task, commit with explicit pathspec, and expect the 05-08 hazard (an unrelated `HoldingLot` hunk once landed in a commit and needed history revert — 05-08-SUMMARY) |
| `src/lib/supabase/portfolio.ts` (modified) | Owns `getAccountId`/`getHoldings`/`getWatchlist` — Phase 6 READS these | Import-only; do not modify |
| `src/server-actions/portfolio.ts` (modified) | `searchInstrumentsAction` re-export precedent | Import-only; do not modify |
| `src/components/dashboard/HoldingsTable.tsx`, `HoldingFormDialog.tsx` (modified), `LotEditDialog.tsx` (untracked) | None for news | Avoid entirely |

House commit rules (memory + STATE.md): plain `git commit` (gsd-tools commit broken on Windows); per-task commits; explicit trailing pathspecs when executors run in parallel; verify `git show HEAD --stat` after each commit.

## Q6: YouTube analyze route — collision assessment

`src/app/api/youtube/analyze/route.ts` (POST): per-route `getUser()` gate (401 via `getUserTickers()` returning null; documented in `src/proxy.ts:43`), fetches transcript, analyzes via `analyzeTranscriptWithProvider` (`src/lib/ai-provider.ts`), cross-references against REAL holdings via `getHoldings`, returns JSON to `src/app/(dashboard)/youtube/page.tsx:237`. **It does NOT read or write `news_items`, does not persist anything, and has no route/path overlap with a future `/api/news/*`. Direct collision risk: NONE.**

Three indirect overlaps the planner should know:
1. **Shared Gemini quota:** it uses the same `GEMINI_API_KEY` + legacy `@google/generative-ai` SDK (gemini.ts:5, ai-provider.ts:1, research/analyze/route.ts:4) on `gemini-2.5-flash` free tier (15 req/min — gemini.ts:3). Batched news summarization (NEWS-04) shares that budget; NEWS-05's degrade-to-headlines behavior is what absorbs contention. Don't let a news batch starve interactive YouTube/research analysis.
2. **SDK discrepancy (decision point, flagged for the external-research slice):** REQUIREMENTS.md NEWS-04 specifies `@google/genai`, but package.json:19 has only `@google/generative-ai@^0.24.1` (the legacy SDK). Installing `@google/genai` adds a second Google SDK alongside three existing legacy call sites; reusing the legacy SDK contradicts the requirement text. Planner must resolve explicitly.
3. **Naming hazard, not code hazard:** `src/lib/research/research-types.ts` defines separate `NewsEvent`/`NewsAnalysis`/`NewsCategory` types fed by mock data (`mock-research-data.ts` — still fabricated narratives, out of Phase 6 scope). These are unrelated to `lib/types.ts`'s `NewsItem` and to `news_items`. Phase 6 must not import from `src/lib/research/`. STATE.md's "research deep-link click-through" open item is a Phase-2 UI-verification leftover, unrelated to the news pipeline.

## Don't Hand-Roll (codebase-internal)

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Telegram delivery | Any direct `sendTelegramMessage` call from news code | `enqueueNotifications` → `dispatchOutbox` | outbox.ts is THE sole sending path; retries, 429 backoff, 403 revocation all live there |
| Secret guard | New auth predicate | `isAuthorizedRefreshRequest` from `@/lib/prices/ingest` | Pure, tested (03-02), empty-secret-denies, reused by both existing guarded routes |
| Admin client | Inline `createClient(url, serviceKey)` | `createAdminClient()` from `@/utils/supabase/admin` | server-only guard + SSR-downgrade trap avoidance documented there |
| HTML escaping for Telegram | New escaper | `escapeHtml` from `@/lib/telegram/build-message` | 3-entity, order-correct, tested |
| Deterministic hashing | Ad-hoc hashing | `node:crypto` sha256 over normalized strings, `row-hash.ts` style | Purity/normalization pitfalls already solved in 04-02 |
| Account resolution | New lookup | `getAccountId` / `getHoldings` / `getWatchlist` from `@/lib/supabase/portfolio` | RLS-scoped, used by every page; file is dirty — import, never edit |

## Common Pitfalls (from this codebase's history)

1. **Adding a write policy to `news_items`** — the write hole was deliberately closed in rls_fixes; `test:rls` will catch it, three migration comments forbid it.
2. **Editing an existing migration** instead of adding a new timestamped one — house rule stated in two migration headers.
3. **Bare re-exports in `'use server'` files** — silently zeroes the module's client exports; only `npm run build` catches it (alerts.ts:32-39).
4. **Letting news-pipeline failures fail the caller** — clone the inner-try/catch tail pattern (prices/refresh/route.ts:23-35); report via a result field.
5. **`@google/genai` vs `@google/generative-ai`** — requirement text and installed package disagree; resolve before writing summarization code.
6. **Fabricated values** — house cardinal rule (two prior defects found and fixed: hardcoded alerts badge, MOCK_HOLDINGS in the analyze route — STATE.md cleared item 6). Unsummarized news shows headline-only; unmatched news doesn't appear; no fake sentiment.
7. **Symbol-keyed matching without exchange identity** — the exact bug `price_cache` was re-keyed for; `affected_symbols TEXT[]` inherits it.
8. **Dirty-file contamination** — five uncommitted files sit on Phase 6's path; explicit pathspec commits + `git show HEAD --stat` verification (05-08 precedent).

## Sources

### Primary (HIGH confidence — all direct reads of this repo)
- `supabase/migrations/20260714032952_initial_schema.sql`, `20260714032957_rls_fixes.sql`, `20260714160720_instruments_transactions.sql`, `20260714220333_price_fx_schema.sql`, `20260714220438_price_refresh_cron.sql`, `20260716221450_alerts_telegram.sql`
- `src/lib/notifications/{types,outbox}.ts`, `src/lib/alerts/{sweep,evaluate}.ts`, `src/lib/telegram/{api,build-message}.ts`
- `src/app/api/notifications/dispatch/route.ts`, `src/app/api/prices/refresh/route.ts`, `src/app/api/youtube/analyze/route.ts`
- `src/lib/prices/{refresh-service,fetch-prices,get-portfolio-pnl}.ts`, `src/lib/import/row-hash.ts`
- `src/app/(dashboard)/{news,alerts}/page.tsx`, `src/app/(dashboard)/layout.tsx`, `src/components/dashboard/NewsFeed.tsx`
- `src/server-actions/{alerts,prices}.ts`, `src/utils/supabase/admin.ts`, `src/lib/supabase/portfolio.ts` (exports only), `src/lib/types.ts`, `src/lib/gemini.ts`, `src/lib/ai-provider.ts` (imports only)
- `scripts/rls-isolation-test.ts`, `package.json`, `.env.local`, `.planning/STATE.md`, `.planning/REQUIREMENTS.md`

## Metadata

**Confidence breakdown:**
- news_items schema/RLS: HIGH — DDL and both policy migrations read directly; live-applied status from STATE.md verification log
- UI inventory: HIGH — all three surfaces read in full
- Outbox contract: HIGH — types, engine, migration, and both call sites read
- Pipeline placement: HIGH — both entry points + cron migration + env rationale read; the "own route" recommendation is inference from explicit written precedent
- SDK discrepancy: HIGH that it exists; resolution deferred to planner/external research

**Research date:** 2026-07-16
**Valid until:** Phase 6 planning (invalidated if the dirty files are committed or a Phase 6 CONTEXT.md appears)
