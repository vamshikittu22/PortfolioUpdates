# Pitfalls Research

**Domain:** Personal stock portfolio manager with market-news intelligence (India NSE/BSE + US markets)
**Researched:** 2026-07-13
**Confidence:** MEDIUM-HIGH (mix of official docs, GitHub issue threads, and community post-mortems; specific limits flagged where they drift)

Builds on `.planning/codebase/CONCERNS.md` — this file covers *domain* pitfalls for the upcoming milestone (persistence, price feeds, CSV import, news pipeline, Telegram alerts), not the already-catalogued codebase issues. Where an existing concern intersects (silent Yahoo fallbacks, Gemini JSON parsing, RLS untested), it is referenced rather than repeated.

## Critical Pitfalls

### Pitfall 1: Treating unofficial Yahoo Finance as a reliable API

**What goes wrong:**
Yahoo Finance has no official public API. All libraries (`yahoo-finance2` for Node, `yfinance` for Python) scrape web endpoints. Yahoo tightened enforcement starting late 2024: 429 rate limits after modest request volumes, cookie/"crumb" authentication requirements on the `quote` endpoints, and periodic response-shape changes. Cloud datacenter IPs (Vercel's included) are rate-limited more aggressively than residential IPs. Projects that fetch quotes per-holding per-page-load get blocked within days.

**Why it happens:**
It works perfectly in local dev at low volume, so developers assume it's stable. The failure only appears after deployment (different IP reputation) or after Yahoo changes something upstream — which they do without notice, multiple times per year.

**How to avoid:**
- Fetch prices **server-side on a schedule** (the planned 2–4h cron), write to Supabase, and serve the UI from the database — never fetch Yahoo per page load or per component.
- Batch symbols into as few requests as possible (the `quote` endpoint accepts multiple symbols; the `chart` endpoint is one symbol per call but historically more resilient than `quoteSummary`).
- Add jittered delays between requests and exponential backoff on 429.
- Store `price_updated_at` per holding and **show data age in the UI** — this converts silent staleness into visible staleness.
- Design a thin `PriceProvider` interface from day one so a second free source (e.g., Stooq for EOD, Finnhub free tier for US, or scraping-free alternatives) can back up Yahoo without touching callers. The existing codebase already has a silent-fallback-to-mock anti-pattern (CONCERNS.md: "Yahoo Finance Data Fetch Silently Fails") — the replacement must fail *loudly* (log + stale badge), never fabricate a price.

**Warning signs:**
- 429 responses or "Invalid Crumb" errors in logs after deploying to Vercel.
- Prices identical across refreshes for many hours with no error surfaced.
- `yahoo-finance2` GitHub issues spiking (check before each phase touching prices).

**Phase to address:**
Price feed phase (design: scheduled server-side fetch + DB cache + provider abstraction + visible staleness). Verified: yfinance issues #2125, #2128, #2422 document the 2024–2025 rate-limit tightening.

---

### Pitfall 2: NSE/BSE symbol identity confusion corrupting the whole data model

**What goes wrong:**
The same Indian stock has multiple identities: NSE trading symbol (`HDFCBANK`), BSE scrip code (numeric, `500180`), Yahoo symbols (`HDFCBANK.NS` / `HDFCBANK.BO`), and ISIN (`INE040A01034`). Broker CSVs use ISIN + broker-local symbol; Yahoo needs the suffixed symbol; news matching needs the company name. Projects that store one string as "the ticker" end up with: US lookups accidentally querying NSE (`INFY` is valid on both NYSE and NSE), price fetch failures for BSE-only stocks, duplicate holdings after import (same stock, different symbol spelling), and symbols with special characters breaking URLs (`M&M` on NSE → `M%26M.NS` on Yahoo).

**Why it happens:**
US-centric tutorials assume `ticker` is a universal primary key. It isn't — it's exchange-scoped, mutable (companies rename symbols), and format-shifts across data sources.

**How to avoid:**
- Model instruments as: `{ isin, exchange (NSE|BSE|NASDAQ|NYSE), local_symbol, yahoo_symbol, display_name, currency }`. **ISIN + exchange is the identity; symbols are lookup keys.**
- Derive `yahoo_symbol` explicitly: NSE → `SYMBOL.NS`, BSE → `SCRIPCODE.BO` or `SYMBOL.BO`, US → bare symbol. Never infer exchange from the symbol string alone.
- Prefer NSE (`.NS`) quotes when a stock is dual-listed (better Yahoo liquidity/coverage); fall back to `.BO`.
- URL-encode symbols in every fetch (`M&M`, `L&TFH` class of symbols).
- On CSV import, resolve via ISIN first (Groww exports include ISIN), symbol second.

**Warning signs:**
- A holding shows a wildly wrong price (US stock priced from an identically-named NSE symbol, or vice versa).
- Import creates a duplicate row for a stock already held.
- Fetch fails only for specific symbols (special characters, BSE-only listings, recently renamed symbols).

**Phase to address:**
Persistence/schema phase (instrument model) — this must be right *before* CSV import and price feeds are built on top of it. Retrofitting instrument identity after holdings exist is a data migration nightmare.

---

### Pitfall 3: Multi-currency P&L computed by mixing INR and USD numbers

**What goes wrong:**
Total portfolio value, allocation percentages, and KPI cards silently add ₹ and $ amounts as if they were the same unit. Or the app converts everything at today's FX rate — including cost basis — so P&L swings with USD/INR even when stocks are flat, and the user can't tell market gain from currency movement. Both errors look plausible on screen and can go unnoticed for weeks.

**Why it happens:**
The mock data era had no currencies. When real data arrives, each holding "has a number" and summing is the obvious code to write. FX treatment of *cost basis* (historical rate vs current rate) is a genuine accounting decision most trackers skip.

**How to avoid:**
- Store every money amount with its **native currency**; never store pre-converted values.
- Pick one display base currency (likely INR for this user) and convert **at render/aggregation time** using a cached daily FX rate (Yahoo `USDINR=X`, or frankfurter.app — free, no key).
- Decision to make explicitly in planning: convert cost basis at **current** rate (simple; P&L = pure local-currency P&L converted) vs **purchase-date** rate (P&L includes FX gain/loss). For a personal tracker, current-rate conversion with per-holding P&L shown in native currency is the sane default — but write the decision down.
- Show currency symbols everywhere; per-holding P&L in native currency, portfolio totals in base currency with the FX rate and its timestamp visible.
- Cache the FX rate in the DB with the price cron; a missing FX rate must block aggregation (show stale), not default to 1.0.

**Warning signs:**
- Portfolio total changes when no market is open.
- A US holding's P&L% differs from its price change % with no explanation.
- Any code path where `holding.value` is summed without a currency check.

**Phase to address:**
Persistence/schema phase (currency column, native-amount storage) + P&L computation phase (conversion policy, FX caching). Schema part cannot be deferred.

---

### Pitfall 4: Average cost basis silently corrupted by corporate actions and sells

**What goes wrong:**
Two distinct corruptions:
1. **Corporate actions:** Indian markets are dense with splits and bonus issues (bonuses are far more common in India than the US). After a 1:1 bonus, the user holds 2× shares at ½ cost each; a tracker that stored `quantity` and `avg_price` from an old CSV import now shows a catastrophic fake loss (price halved, cost basis unchanged). Yahoo returns split-adjusted prices, so current price is right but *stored cost basis is wrong* — P&L is garbage until manually fixed.
2. **Sell handling:** Naive "average price" recomputation on sells (treating a sell like a negative buy) corrupts average cost. Average cost only changes on buys; sells reduce quantity at the existing average and realize P&L.

**Why it happens:**
Snapshot-based data models (`quantity + avg_price` as mutable columns) can't represent history. Corporate actions happen outside the app and nothing detects them.

**How to avoid:**
- Model holdings as **transactions** (buy/sell/split/bonus rows), with `quantity`/`avg_cost` as derived values — even if the UI only edits "a holding." This is the single highest-leverage schema decision in this milestone. A `transactions` table with a computed holdings view costs little now and makes splits, re-imports, and realized P&L all tractable.
- Support a manual "record split/bonus" action (ratio + date) that adjusts derived quantity/cost — automating corporate-action detection is out of free-tier scope, but *representing* them must not be.
- Sanity check on price refresh: if a stock's price moved >40% in one refresh window, flag it as "possible corporate action — verify holdings" instead of showing a giant red P&L.
- On CSV re-import, reconcile via ISIN + broker-reported quantity/avg-price; if broker numbers disagree with derived numbers, surface the diff (broker statements are already split-adjusted — trust them for the snapshot, but record the adjustment).

**Warning signs:**
- Any holding showing ±40%+ P&L swing overnight.
- User-reported quantity differs from broker app.
- Avg price changing after a sell.

**Phase to address:**
Persistence/schema phase (transaction-based model). The 40%-move flag belongs in the price feed phase. Manual split/bonus entry can be a fast-follow but the schema must allow it from day one.

---

### Pitfall 5: Supabase RLS that exists but doesn't protect

**What goes wrong:**
The classic failures, all seen repeatedly in the wild:
- Table created without `ENABLE ROW LEVEL SECURITY` — policies do nothing, everything is readable via the anon key.
- Policy written for `SELECT` only — inserts/updates/deletes unrestricted (each operation needs its own policy; `INSERT` needs `WITH CHECK`, not `USING`).
- `service_role` key used in a client bundle or prefixed `NEXT_PUBLIC_` — total bypass of RLS for anyone who opens devtools.
- **@supabase/ssr-specific trap (this codebase uses it):** creating an SSR client with the service-role key doesn't work as expected — the user's cookie session overrides the Authorization header, so the client silently runs as the user, not as service role. Server-side admin operations need a separate plain `createClient` (from `@supabase/supabase-js`) with the service key and no cookie integration.
- Missing index on `user_id` — every RLS check does a sequential scan; fine at 10 rows, slow at 10k news items.

**Why it happens:**
RLS failure is invisible in a single-user app — there's no second user to leak to, so nothing fails during development. CONCERNS.md already flags "RLS untested" as Critical.

**How to avoid:**
- Migration checklist per table: `ENABLE RLS` + four policies (select/insert/update/delete) scoped to `(select auth.uid()) = user_id` (the `select` wrapper lets Postgres cache the call) + index on `user_id` + `user_id uuid not null default auth.uid() references auth.users`.
- Run Supabase's built-in **Security Advisor** (dashboard → Advisors) after every migration — it flags RLS-disabled tables automatically.
- Write one integration test early: create two users, insert as A, assert B reads zero rows. Run it against the real (local or hosted) Supabase, not mocks.
- Keep the service-role key server-only (`SUPABASE_SERVICE_ROLE_KEY`, no `NEXT_PUBLIC_`), used only in cron/route handlers via a dedicated admin client factory.

**Warning signs:**
- Security Advisor warnings in the Supabase dashboard.
- A query "works" from a route handler where you expected RLS to block it (probably the SSR/service-role session-override trap — or missing RLS).
- Any `SUPABASE_SERVICE` string appearing in client bundle output.

**Phase to address:**
Auth + persistence phase, as a non-negotiable success criterion ("cross-user isolation test passes"), not a hardening afterthought.

---

### Pitfall 6: Vercel cron reality vs the mental model

**What goes wrong:**
The planned "auto-refresh every 2–4 hours + daily digest + Telegram alerts" collides with Vercel Hobby constraints:
- Hobby cron jobs run **at most once per day**, and fire at an *arbitrary minute within the scheduled hour* (deploys fail or jobs misbehave if you configure `0 */3 * * *`).
- Cron invocations are plain unauthenticated **GET requests to a public route** — anyone who finds `/api/cron/refresh` can trigger it (burning Yahoo/Gemini quota) unless the route checks `Authorization: Bearer ${CRON_SECRET}`.
- Function execution time is capped (Hobby historically 10–60s for non-fluid, up to ~300s with Fluid compute — verify current limits at plan time). A job that serially fetches 50 quotes + news + Gemini summaries + Telegram sends will exceed it.
- A related free-tier trap: **Supabase free projects pause after ~7 days of inactivity** — ironically, a working daily cron is what keeps the database alive.

**Why it happens:**
Cron syntax accepts any schedule locally; the once-per-day Hobby restriction and timing fuzziness only bite on deploy. Timeout bites only when the portfolio grows.

**How to avoid:**
- Decide the scheduling strategy in planning, not mid-build. Realistic free options: (a) one daily Vercel cron for digest + an external free scheduler (cron-job.org / GitHub Actions `schedule`) hitting a secured refresh endpoint every 2–4h; (b) upgrade to Pro; (c) accept daily refresh + rely on the on-demand "refresh now" button for freshness. Option (a) is the standard free-tier answer.
- Protect every cron/refresh route with `CRON_SECRET` bearer check from the first commit.
- Design jobs to be **chunked and idempotent**: fetch prices in batches, upsert as you go, so a timeout loses only the tail; keep AI summarization in a separate invocation from price refresh.
- Set `maxDuration` explicitly and log elapsed time per job.

**Warning signs:**
- Deployment error on `vercel.json` cron expression.
- Cron route returns 200 to a curl with no auth header.
- Job logs showing 10s/60s hard cutoffs; digest arriving at random times within an hour.

**Phase to address:**
Dedicated "scheduling/jobs" slice of the price-feed phase; route auth from the first cron endpoint. Verify current Vercel limits during that phase's research (they changed in 2025–2026; e.g., per-project cron *count* limits were lifted, duration limits depend on Fluid compute).

---

### Pitfall 7: Gemini free tier as a news-pipeline bottleneck

**What goes wrong:**
The news pipeline multiplies AI calls: N articles × summarize + relevance-filter + digest. Gemini free-tier limits are **low and have been repeatedly reduced** (Flash-class models: ~10 RPM and a daily cap that has ranged from ~1,500 RPD down to 250 or lower depending on model/period — limits are per *project*, reset midnight Pacific). A per-article summarization design exhausts the daily quota on the first run, then every subsequent feature (research module, YouTube analysis — which share the same project quota) starts failing too. Add the already-documented malformed-JSON problem (CONCERNS.md) and jobs fail mid-batch with half-written state.

**Why it happens:**
Free-tier limits are checked once, assumed static, and designed against the happy path. Google adjusts free quotas without much notice; per-project (not per-key) limits mean the research and news features compete for one budget.

**How to avoid:**
- **Batch aggressively:** one Gemini call summarizing 10–20 headlines/snippets for the whole portfolio beats 20 per-article calls. Design prompts around "here are today's articles for these tickers, return JSON array."
- Do cheap filtering **before** AI: match articles to tickers by symbol/company-name string rules first; only send plausibly-relevant items to Gemini.
- Use Gemini's native structured output (`responseMimeType: "application/json"` + `responseSchema`) instead of the existing regex-cleanup of markdown-wrapped JSON; validate with Zod after parse; retry once on parse failure, then skip the item (never fall back to fabricated summaries — see the mock-fallback anti-pattern in CONCERNS.md).
- Persist AI outputs (summaries in Supabase) so nothing is ever summarized twice; make the pipeline resumable (per-article `summarized_at`).
- Track daily call count in the DB; degrade gracefully to "headlines without summaries" when budget is spent.

**Warning signs:**
- 429 / `RESOURCE_EXHAUSTED` from Gemini in cron logs.
- Digest quality degrading late in the day (quota spent by morning jobs).
- News items reprocessed on every run (no persistence of summaries).

**Phase to address:**
News pipeline phase (batching + persistence + budget tracking); the JSON-mode fix should also be applied opportunistically to the research route when touched.

---

### Pitfall 8: Migrating mock Zustand stores to server data breaks the UI in slow motion

**What goes wrong:**
The dashboard was built against hardcoded store shapes (3 accounts, ~50 holdings, synchronous availability). Moving to Supabase introduces: async loading (components assume data exists at first render), shape drift (DB rows: `snake_case`, uuids, nullable fields vs mock camelCase objects with hand-picked ids), empty states nobody built (new user has zero holdings — mock never did), and hydration mismatches if Zustand `persist` caches server data in localStorage. The most common end-state is server data stored *into* the same Zustand store and manually synced — stale caches, double sources of truth, and "works until you refresh" bugs. Meanwhile, leftover mock fallbacks mask every integration failure (the app "works" because it silently reverted to mock).

**Why it happens:**
Incremental migration without a boundary: each component gets its own fetch-and-shove-into-store treatment, and mock data stays as a "safety net."

**How to avoid:**
- Define a **typed mapping layer** (DB row → domain type) in one place; keep the UI consuming the existing domain types so components mostly don't change.
- Split state by kind: server data (holdings, prices, news) via server components or a fetch layer with revalidation (TanStack Query is the ecosystem default, but Next.js server components + `router.refresh()` is viable and lighter given the existing App Router); Zustand keeps only true client state (selected account, UI toggles, theme). Do not keep server entities in `persist`ed Zustand.
- **Delete mock data per feature as it's migrated** — a feature isn't done while its mock fallback exists. Feature-flag if needed, but the flag must be loud (banner: "demo data").
- Build empty/loading/error states as part of each migration slice; test with a brand-new user account, not the seeded one.
- Migrate one vertical slice first (e.g., holdings table end-to-end) to shake out the pattern before fanning out.

**Warning signs:**
- React hydration warnings in console after wiring persistence.
- UI shows data with network tab empty (mock fallback still live).
- A new user sees the demo portfolio, or a blank white section.
- Same entity fetched in two components showing different values.

**Phase to address:**
Persistence phase must include the mapping layer + state-split decision; every subsequent feature phase inherits the "mock deleted = done" criterion.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `quantity + avg_price` columns instead of transactions table | Simpler CRUD, faster first win | Splits/bonuses/sells/re-imports all corrupt P&L; painful migration with live data | Never for this project — India = frequent bonuses/splits |
| Keeping mock fallbacks "just in case" during migration | Demo never breaks | Failures invisible; can't trust anything on screen (already the codebase's biggest disease) | Only behind a loud visible "demo data" flag, removed per-feature |
| Single `ticker` string as instrument identity | Matches current mock shape | Dual-listed/US-India collisions, dup imports, broken BSE fetches | Never — cost of doing it right up front is one table |
| Per-article Gemini calls | Simplest pipeline code | Quota exhausted day one; shared project quota starves research module | Never on free tier — batch from the start |
| Skipping RLS tests because single-user | Ships faster | Silent total data exposure when "could go public later" happens | Never — one 2-user test is cheap |
| Hardcoding FX rate or converting at write time | No FX plumbing | Baked-in wrong totals, unfixable without reprocessing | Never store converted; a hardcoded *display* rate is OK for 1 day of dev |
| CSV import that writes holdings directly (no preview) | Fewer screens | One malformed file silently corrupts the portfolio; no undo | Acceptable only with import batches tracked + revertable |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Yahoo Finance (unofficial) | Per-request fetching from serverless at page load; trusting it as stable | Scheduled batch fetch → DB cache; provider interface; backoff; visible staleness (see Pitfall 1) |
| NSE India direct (nseindia.com APIs) | Assuming it's a free fallback — it requires browser cookies and aggressively blocks cloud/datacenter IPs (Vercel will be blocked) | Don't build on it from serverless; use Yahoo `.NS` symbols or licensed/EOD sources instead |
| Google News RSS (likely free news source) | Matching articles by bare ticker string — NSE symbols like `IDEA`, `CAMS`, `IRCTC` are English words/acronyms → false positives flood the feed | Match on company name + ticker with word-boundary rules; query RSS as `"Company Name" stock` per instrument; dedupe by URL/title hash |
| Groww export | Assuming a stable CSV — holdings export is an **XLSX** statement whose layout (header rows, merged cells) shifts between app versions | Parse defensively: locate header row by known column names (ISIN, Qty, Avg price), not fixed offsets; version the parser; always preview before commit |
| Robinhood export | Assuming full history — reports are CSV via "Reports and statements," take up to hours to generate, and historical coverage is limited (~1 year windows) | Import transactions (not snapshot); handle date-range chunks; reconcile with existing rows idempotently (dedupe on activity date+symbol+qty+price) |
| CSV numbers (both brokers) | `parseFloat` on `"1,02,500.50"` (Indian digit grouping), `"$1,234.56"`, `"(500)"` negatives, DD/MM/YYYY vs MM/DD/YYYY dates | Locale-aware normalization step with unit tests per broker fixture file; reject rows that don't parse rather than coercing to 0/NaN |
| Gemini API | Regex-stripping markdown fences from responses; per-key quota assumptions | `responseMimeType: application/json` + `responseSchema`; Zod validation; quota is per-project — budget across features |
| Telegram Bot API | Token in client code/git; webhook without `secret_token`; `parse_mode: MarkdownV2` without escaping (any `.`, `-`, `(` in a stock name breaks the send with a 400) | Token server-env only; prefer plain text or HTML parse mode for generated content; if webhook, set + verify `X-Telegram-Bot-Api-Secret-Token`; for send-only alerts, no webhook needed at all — just `sendMessage` calls |
| Telegram limits | Blasting one message per holding/news item | Respect ~30 msg/s global and 1 msg/s per chat; aggregate into digest messages; stay under 4096 chars per message (split long digests) |
| Supabase `@supabase/ssr` | Using service-role key with the SSR cookie client (session silently overrides it) | Separate admin client (`createClient` from supabase-js, service key, `persistSession: false`) used only in cron/server routes |
| Supabase free tier | Not knowing projects pause after ~7 days inactivity | Daily cron touching the DB doubles as keep-alive; document it |
| Vercel cron | Unauthenticated cron routes; sub-daily schedules on Hobby | `CRON_SECRET` bearer check; external scheduler (cron-job.org / GitHub Actions) for 2–4h cadence |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Fetching quotes per-holding serially in one cron invocation | Cron times out; partial price updates | Batch symbols per request; chunk + upsert incrementally; idempotent job | ~30+ holdings on a 10–60s function limit |
| RLS policies calling `auth.uid()` per row without index | Dashboard queries slow as news/prices accumulate | `(select auth.uid())` form + index every `user_id` column | ~10k+ rows in news/price-history tables |
| Unbounded price/news history tables on Supabase free (500MB) | DB size warnings; slow queries | Retention policy: keep latest quote per instrument + daily closes; prune news >30–90 days | Months of 2–4h snapshots × holdings |
| Re-summarizing all news every cron run | Gemini quota gone by noon | Persist summaries; process only `summarized_at IS NULL` | First day of real operation |
| On-demand "refresh now" hammering Yahoo per click | 429s poison subsequent scheduled fetches from the same IP | Debounce server-side: min interval (e.g., 5 min) per user, batch all symbols in one pass | A few enthusiastic clicks |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Telegram bot token in repo/client bundle | Attacker reads bot messages (your portfolio activity!) and impersonates the bot to you | Server env var only; rotate via BotFather if ever exposed; tokens are a top leaked-secret class on GitHub |
| Telegram `chat_id` unvalidated (bot responds to anyone who finds it) | Strangers can trigger commands / receive data if bot ever answers inbound messages | Allowlist your own chat_id; ignore all other updates |
| Unauthenticated cron/refresh endpoints | Quota-burning, forced stale-data, cost abuse | `CRON_SECRET` bearer check on every scheduled route |
| Service-role key in `NEXT_PUBLIC_*` or client component | Full RLS bypass — entire DB readable/writable | Server-only env; grep client bundles in CI |
| RLS enabled but no `WITH CHECK` on insert/update | User A can write rows owned as user B | Four policies per table; two-user isolation test |
| CSV import trusting file contents | Formula injection if data ever re-exported (`=HYPERLINK...` cells); NaN/absurd values corrupting P&L | Treat all cells as text; validate with Zod (qty > 0, price bounds); preview before commit |
| Existing `/api/settings/keys` writes to `.env.local` unauthenticated (CONCERNS.md) | Anyone can overwrite your Gemini/API keys | Fix in auth phase: session check + move keys out of filesystem |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No data-freshness indicators | User acts on 8-hour-old prices believing they're live | Timestamp/staleness badge on every price and FX rate; "last refreshed" header |
| Mixing INR/USD without visible currency symbols | Totals look wrong or misleading; trust evaporates | Currency symbol on every amount; explicit base-currency toggle/label on totals |
| Import failures that silently skip rows | Portfolio missing holdings; user doesn't notice for weeks | Import preview screen: parsed rows, skipped rows with reasons, diff vs current holdings, confirm/cancel |
| Corporate-action fake losses shown red without context | Panic; distrust of the app | >40% move flag: "possible split/bonus — verify quantity" banner instead of raw P&L |
| Alert spam (every 1% move, every article) | User mutes the Telegram bot; heartbeat feature dies | Thresholds + daily digest as default; per-instrument alert settings; batch alerts into one message |
| Market-hours confusion (NSE closes 15:30 IST, US opens 19:00 IST) | "Prices aren't updating!" during the other market's hours | Show market open/closed status per holding; don't flag stale during market close |

## "Looks Done But Isn't" Checklist

- [ ] **Price feed:** Often missing *failure visibility* — verify a dead Yahoo response shows a stale badge/log entry, never a fabricated or frozen-but-fresh-looking price
- [ ] **Holdings persistence:** Often missing *the empty state* — verify a brand-new account renders sensibly with zero holdings (no mock data leaking through)
- [ ] **RLS:** Often missing *actual enforcement* — verify with a two-user test via the anon key, not by reading policy SQL
- [ ] **CSV import:** Often missing *re-import idempotency* — verify importing the same file twice doesn't duplicate holdings, and a second month's statement reconciles rather than double-counts
- [ ] **P&L:** Often missing *currency correctness* — verify a portfolio with one NSE + one US holding shows a total that matches a hand calculation at the displayed FX rate
- [ ] **Cron jobs:** Often missing *auth + idempotency* — verify unauthenticated curl gets 401, and a re-run after mid-job failure doesn't double-write
- [ ] **Telegram alerts:** Often missing *escaping and limits* — verify a stock named "M&M" or a headline with `_*[]()` sends successfully; verify a 60-holding digest fits or splits messages
- [ ] **Gemini pipeline:** Often missing *quota-exhausted path* — verify the app degrades to raw headlines (not errors, not mock summaries) when the daily budget is spent
- [ ] **Zustand migration:** Often missing *mock deletion* — verify each migrated feature's mock module is deleted and the network tab shows real fetches

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Yahoo blocks/breaks in production | MEDIUM | UI keeps serving last DB prices with stale badges; swap in fallback provider behind the interface; worst case manual price entry |
| Snapshot schema shipped, splits corrupt P&L | HIGH | Retro-migration to transactions table, reconstructing history from broker CSVs — avoid by doing transactions first |
| RLS hole discovered post-multi-user | HIGH | Enable+policy every table, audit access logs, rotate keys; reputationally unrecoverable if real users existed — prevent instead |
| Gemini quota model changes (again) | LOW | Batch sizes/config in DB or env; degrade to headline-only mode; quota tracking table shows exactly what's consumed |
| Broker changes CSV/XLSX layout | LOW-MEDIUM | Versioned parsers + fixture tests fail loudly; add new parser version; preview screen prevents corrupt imports meanwhile |
| Telegram token leaked | LOW | Regenerate via BotFather (old token dies instantly), update env, redeploy |
| Vercel Hobby cron insufficient | LOW | Move cadence to external scheduler hitting the already-secured endpoint; no code change if routes were designed as plain authed HTTP |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Instrument identity confusion (#2) | Schema/persistence phase (first) | Dual-listed symbol (INFY) and special-char symbol (M&M) resolve to correct exchange + price |
| Snapshot cost-basis corruption (#4) | Schema/persistence phase (first) | Transactions table exists; manual split entry adjusts derived qty/avg-cost correctly |
| Multi-currency mixing (#3) | Schema phase (storage) + P&L phase (conversion) | Mixed INR+USD portfolio total matches hand calc; FX rate + timestamp visible |
| RLS misconfiguration (#5) | Auth/persistence phase | Two-user isolation test passes; Supabase Security Advisor clean |
| Zustand migration breakage (#8) | Persistence phase (pattern) + every feature phase | Per-feature: mock module deleted, empty state works, no hydration warnings |
| Yahoo instability (#1) | Price feed phase | Provider interface + DB cache + stale badges; kill Yahoo access locally and confirm UI degrades visibly |
| Vercel cron limits (#6) | Price feed/jobs phase | 2–4h refresh actually fires on deployed env; cron route returns 401 unauthenticated; job completes under timeout with full portfolio |
| CSV format drift (integration gotchas) | CSV import phase | Fixture files for Groww XLSX + Robinhood CSV parse in tests; double-import is idempotent; preview shows skipped rows |
| Gemini quota/JSON (#7) | News pipeline phase | Full news run for a 30-holding portfolio stays under daily quota; malformed-JSON retry path tested; summaries persisted |
| Telegram security/formatting | Alerts phase | Token server-only; chat_id allowlist; special-character message sends; digest splits >4096 chars |

## Sources

- Yahoo/yfinance rate limiting & breakage: [yfinance #2125](https://github.com/ranaroussi/yfinance/issues/2125), [#2128](https://github.com/ranaroussi/yfinance/issues/2128), [#2422](https://github.com/ranaroussi/yfinance/issues/2422), [Why yfinance keeps getting blocked](https://medium.com/@trading.dude/why-yfinance-keeps-getting-blocked-and-what-to-use-instead-92d84bb2cc01) — MEDIUM-HIGH (multiple independent issue threads)
- Gemini free-tier limits: [ai.google.dev rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) + 2026 community trackers noting repeated reductions — MEDIUM (limits volatile; re-verify at phase time)
- Vercel cron: [Cron usage & pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Managing cron jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [Limits](https://vercel.com/docs/limits) — HIGH for once-daily Hobby + hour-window fuzziness; MEDIUM for exact duration caps (Fluid compute changed them; re-verify)
- Supabase RLS: [RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security), [service-role + SSR session override](https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z), [common misconfigurations](https://modernpentest.com/blog/supabase-security-misconfigurations) — HIGH
- NSE/BSE symbols: [StockMarketEye Indian investors guide](https://help.stockmarketeye.com/article/138-info-for-indian-investors) (.NS/.BO conventions), [stocky ISIN mapper](https://github.com/rehanhaider/stocky) — MEDIUM-HIGH
- Corporate actions (India): [Navia corporate actions guide](https://support.navia.co.in/support/solutions/articles/1000328970), [Stockopedia splits handling](https://www.stockopedia.com/learn/folios/handling-splits-other-corporate-actions-463178/) — MEDIUM
- Robinhood exports: [Robinhood reports & statements](https://robinhood.com/us/en/support/articles/finding-your-reports-and-statements/), [Portseido export guide](https://support.portseido.com/export-trades/robinhood/) — MEDIUM (history-window claim single-source, LOW)
- Groww export format: community tooling only, no official spec — LOW confidence on exact layout; parser must be defensive (flagged in Integration Gotchas)
- Telegram bot security: [GitGuardian remediation](https://www.gitguardian.com/remediation/telegram-bot-token), [setWebhook secret_token docs/discussions](https://github.com/tdlib/telegram-bot-api/issues/252) — HIGH
- Zustand/server-state migration: [Next.js hydration error docs](https://nextjs.org/docs/messages/react-hydration-error), [Zustand persist in Next.js](https://blog.abdulsamad.dev/how-to-use-zustands-persist-middleware-in-nextjs), community consensus on not storing server data in client stores — MEDIUM-HIGH
- NSE direct-API blocking of cloud IPs, MarkdownV2 escaping, Telegram msg limits, Supabase free-tier pausing, Indian number formats: training-data knowledge corroborated by ecosystem patterns — MEDIUM; re-verify specifics at phase research time

---
*Pitfalls research for: personal portfolio tracker with market-news intelligence (NSE/BSE + US)*
*Researched: 2026-07-13*
