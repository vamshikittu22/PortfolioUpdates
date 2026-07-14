# Architecture Research

**Domain:** Personal stock portfolio tracker with market-news intelligence (India NSE/BSE + US), retrofitting persistence into an existing mock-data Next.js 16 app
**Researched:** 2026-07-13
**Confidence:** HIGH on component structure and Supabase/Vercel platform constraints (verified against official docs); MEDIUM on news-source specifics (free sources are unofficial/undocumented by nature)

## Standard Architecture

Personal portfolio trackers with news pipelines converge on the same shape: a **read-optimized web app** sitting on top of **write-oriented background pipelines**, joined by a shared database. The user-facing app never calls external market/news APIs directly at request time — it reads pre-computed rows. The pipelines run on schedules, fetch external data, normalize/dedup/match it, and write it down. Notifications are a third, small subsystem that consumes events the pipelines produce.

### System Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│  BROWSER (existing UI, mostly unchanged)                               │
│  Zustand stores = client cache of server data + UI state               │
│  Dashboard · Holdings CRUD · Watchlist · News feed · Alerts · Research │
└──────────────┬─────────────────────────────────────────┬───────────────┘
               │ supabase-js (RLS-scoped reads/writes)   │ fetch()
               ▼                                          ▼
┌──────────────────────────────┐   ┌─────────────────────────────────────┐
│  SUPABASE (free tier)        │   │  NEXT.JS API ROUTES (Vercel)        │
│  Auth (replaces demo cookie) │   │  /api/jobs/refresh-prices  ◄──┐     │
│  Postgres + RLS              │   │  /api/jobs/ingest-news     ◄──┤     │
│  pg_cron + pg_net (scheduler)│──►│  /api/jobs/daily-digest    ◄──┤     │
│  price_cache, news_items,    │   │  /api/prices/refresh (on-demand)    │
│  holdings, transactions,     │   │  /api/import/csv                    │
│  alerts, notifications …     │   │  /api/research/* (existing)         │
└──────────────────────────────┘   └───────┬───────────┬─────────┬───────┘
        ▲          ▲                       │           │         │
        │ service-role writes              ▼           ▼         ▼
        └──────────┴──────────── Yahoo Finance   Google News   Gemini
                                 (quotes,        RSS + ET/     (summaries,
                                 .NS/.BO + US)   Moneycontrol  digest)
                                                 RSS
                                        │
                                        ▼
                              Telegram Bot API (sendMessage)
```

Key structural decision: **background jobs live as Next.js route handlers, not Supabase Edge Functions.** They share the existing TypeScript lib code (`src/lib/`), ship in the same deploy, and are triggered over HTTP. Supabase `pg_cron` + `pg_net` acts purely as the scheduler that calls them (Vercel Hobby cron cannot — see Integration Points). Edge Functions remain a fallback if Vercel function duration limits bite.

### Component Responsibilities

| Component | Responsibility | Communicates With | Typical Implementation |
|-----------|----------------|-------------------|------------------------|
| **Auth layer** | Sign-in/out, session cookies, per-request user identity | Supabase Auth; middleware guards routes | `@supabase/ssr` (already installed), middleware refresh, RLS uses `auth.uid()` |
| **Persistence layer (per-user)** | accounts, holdings, transactions, watchlist, alert rules, prefs | Read/written by UI via supabase-js under RLS | Postgres tables, RLS policies keyed through `investment_accounts.user_id` |
| **Shared-data layer (global)** | price_cache, news_items — one copy for all users | Read by UI (SELECT-only RLS); written only by jobs via service-role key | Postgres tables; no per-user duplication |
| **Store hydration** | Bridge server data into existing Zustand stores | Server components/route handlers → `store.hydrate(data)`; mutations write DB first, then store | Zustand stays; mock initializers replaced by hydration + optimistic updates |
| **Price refresh job** | Collect distinct symbols → batch-fetch quotes → upsert price_cache → evaluate price alerts | Yahoo Finance; Supabase (service role); notifications outbox | Route handler, idempotent, chunked, secret-protected |
| **News ingestion job** | Fetch per-ticker feeds → normalize → dedup → match → store raw items | Google News RSS, Yahoo RSS, ET/Moneycontrol RSS; Supabase | Route handler; URL + title-hash dedup; source-side ticker matching |
| **Summarization step** | AI summary + sentiment + "why it matters" for *new, matched* items only | Gemini (existing provider abstraction); Supabase | Batched (N items per prompt) to respect free-tier rate limits |
| **Alert evaluator** | Compare fresh prices/news against alert rules; write notification rows | Runs inside price/news jobs; notifications table | Pure function + outbox insert; cooldown via `last_triggered_at` |
| **Notification dispatcher** | Drain notifications outbox → Telegram `sendMessage` → mark sent/failed | Telegram Bot API; notifications table | Called at end of each job run; retries on next run |
| **Digest job** | Once daily: portfolio snapshot + top news → LLM summary → Telegram | Reads all tables; Gemini; Telegram | Vercel daily cron (fits Hobby limit) or pg_cron |
| **Scheduler** | Fire jobs every 2–4h (prices, news) and daily (digest) | HTTP POST to job routes with `CRON_SECRET` header | Supabase `pg_cron` + `pg_net` (free tier, 1-min granularity) |
| **CSV importer** | Parse Groww/Robinhood exports → transactions → derive holdings | Route handler → Supabase | Broker-specific parsers behind one interface |

## Recommended Project Structure

Extend the existing layout — no reorganization of what works:

```
src/
├── app/
│   ├── api/
│   │   ├── jobs/                    # NEW: scheduled pipelines (CRON_SECRET-guarded)
│   │   │   ├── refresh-prices/route.ts
│   │   │   ├── ingest-news/route.ts
│   │   │   └── daily-digest/route.ts
│   │   ├── prices/refresh/route.ts  # NEW: on-demand "refresh now" (auth-guarded)
│   │   ├── import/csv/route.ts      # NEW: CSV upload → transactions
│   │   └── research/…               # existing
│   ├── auth/callback/route.ts       # existing scaffold — activate
│   └── login/page.tsx               # rewrite onto Supabase Auth
├── lib/
│   ├── market-data/                 # NEW: quote fetching (Yahoo), symbol mapping (.NS/.BO)
│   ├── news/                        # NEW: feed fetchers, normalizer, dedup, matcher
│   ├── notifications/               # NEW: telegram.ts, outbox drain, message templates
│   ├── import/                      # NEW: groww-csv.ts, robinhood-csv.ts
│   ├── db/                          # NEW: typed queries (holdings, prices, news) shared by UI + jobs
│   └── research/…                   # existing
├── store/                           # existing Zustand — add hydrate actions, drop mock init
└── utils/supabase/                  # existing client/server/middleware — wire up for real
supabase/
├── schema.sql                       # exists; extend (see schema sketch)
└── migrations/                      # NEW: move to incremental migrations once live data exists
```

**Structure rationale:**
- **`api/jobs/` vs `api/prices/refresh`:** scheduled entrypoints (machine-auth via secret) and user entrypoints (session-auth) have different auth models — keeping them in separate folders makes the guard rule mechanical.
- **`lib/db/`:** both the UI (RLS client) and jobs (service-role client) need the same queries; a shared typed layer prevents the two from drifting.
- **`lib/news/` as pipeline stages:** fetch → normalize → dedup → match → summarize as separate functions makes each stage testable and lets summarization be rate-limit-throttled independently.

## Data Model (Supabase Schema Sketch)

`supabase/schema.sql` already exists with `profiles`, `investment_accounts`, `brokers`, `holdings`, `watchlist_items`, `price_cache`, `news_items`, `account_settings`, `alerts`, and YouTube tables — all with RLS. It is a good base. **Gaps to close:**

```sql
-- NEW: transactions — source of truth for P&L and CSV import lineage.
-- holdings become derived/materialized from transactions (or kept in sync by trigger).
CREATE TABLE transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID REFERENCES investment_accounts(id) ON DELETE CASCADE NOT NULL,
  symbol TEXT NOT NULL,
  exchange TEXT NOT NULL,            -- 'NSE' | 'BSE' | 'NASDAQ' | 'NYSE'
  side TEXT CHECK (side IN ('buy','sell')) NOT NULL,
  quantity NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  currency TEXT CHECK (currency IN ('INR','USD')) NOT NULL,
  trade_date DATE NOT NULL,
  source TEXT DEFAULT 'manual',      -- 'manual' | 'groww_csv' | 'robinhood_csv'
  import_batch_id UUID,              -- idempotent re-import
  UNIQUE (account_id, symbol, side, quantity, price, trade_date, source)
);
-- RLS: same EXISTS-through-investment_accounts pattern as holdings.

-- NEW: symbols — canonical symbol master; maps display symbol → data-source symbol
CREATE TABLE symbols (
  symbol TEXT NOT NULL, exchange TEXT NOT NULL,
  yahoo_symbol TEXT NOT NULL,        -- 'HDFCBANK.NS', 'AAPL'
  name TEXT NOT NULL,
  aliases TEXT[] DEFAULT '{}',       -- for news matching ('HDFC Bank', 'HDFCBANK')
  currency TEXT NOT NULL,
  PRIMARY KEY (symbol, exchange)
);

-- NEW: notifications — outbox for Telegram dispatch
CREATE TABLE notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  kind TEXT CHECK (kind IN ('price_alert','news_alert','digest')) NOT NULL,
  payload JSONB NOT NULL,            -- pre-rendered message + context
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

-- EXTEND profiles: telegram_chat_id TEXT (set once via /start handshake with bot)
-- EXTEND alerts: last_triggered_at TIMESTAMPTZ, cooldown_minutes INT DEFAULT 240
-- EXTEND price_cache: currency, previous_close, market_state; keep symbol PK as yahoo_symbol
-- EXTEND news_items: content_hash TEXT (normalized-title hash for syndication dedup),
--                    ai_summary TEXT, why_it_matters TEXT, summarized_at TIMESTAMPTZ
--                    (url UNIQUE already exists — keep it; it is the primary dedup key)
```

**One RLS fix:** current `price_cache`/`news_items` policies let any authenticated user INSERT/UPDATE. Shared tables should be **SELECT-only for authenticated users**; only jobs write, using the service-role key (which bypasses RLS). Drop the authenticated write policies.

## Data Flow

### Read path (dashboard load)

```
Login → Supabase Auth session (middleware refreshes)
Dashboard server component / initial fetch:
  holdings + watchlist (RLS-scoped)
  JOIN price_cache ON symbol            ← P&L computed here: qty×(price − avg_buy)
  news_items WHERE affected_symbols && user's symbols   ← per-user view of global news
  alerts (RLS-scoped)
    ↓
store.hydrate(data)  →  existing components render unchanged
Mutations (add holding, edit watchlist): supabase-js write (RLS) → optimistic store update
```

### Price refresh pipeline (every 2–4h + on-demand)

```
pg_cron (Supabase) ──pg_net HTTP POST──► /api/jobs/refresh-prices  (CRON_SECRET check)
User "Refresh now" ──fetch──► /api/prices/refresh  (session check)   [same core fn]
    ↓
SELECT DISTINCT yahoo_symbol across ALL users' holdings + watchlists (service role)
    ↓ chunk into batches (Yahoo quote endpoint accepts multiple symbols)
fetch quotes → upsert price_cache (symbol, price, change_pct, updated_at, source)
    ↓
evaluate price alerts (price_above/below vs fresh prices, respect cooldown)
    → INSERT notifications (outbox)
    ↓
drain outbox → Telegram sendMessage → mark sent/failed
```

Direction to note: prices flow **into the shared cache once**, regardless of user count; the UI never triggers Yahoo calls except through the on-demand route, which also writes the cache (so a manual refresh benefits every view).

### News pipeline (every 2–4h, offset from prices)

```
pg_cron ──► /api/jobs/ingest-news
    ↓
SELECT DISTINCT symbols (+ aliases from symbols table) across holdings + watchlists
    ↓ per symbol
fetch Google News RSS (query = company name/ticker), Yahoo per-ticker RSS,
ET/Moneycontrol RSS for India macro                       ← matching is source-side:
    ↓                                                        per-ticker queries mean items
normalize (title, url, source, published_at)                 arrive pre-matched; keyword/alias
    ↓                                                        scan is a secondary check only
dedup: INSERT … ON CONFLICT (url) DO NOTHING
       + skip if content_hash seen in last 48h (syndicated copies)
    ↓
NEW items only → batch into Gemini prompt (10–20 headlines/call, existing provider lib)
    → sentiment, importance, ai_summary, why_it_matters → UPDATE news_items
    ↓
high-importance items matching a user's held symbols → notifications outbox → Telegram
```

### Daily digest

```
Vercel cron (daily — fits Hobby once/day limit) ──► /api/jobs/daily-digest
  read holdings + price_cache (P&L deltas) + last-24h matched news
  → one Gemini call composes digest → notifications outbox → Telegram
```

## Suggested Build Order

Dependencies run strictly downward — each step consumes the previous one's output:

1. **Auth first (Supabase Auth replacing demo cookie).** Everything below stores per-user rows under RLS; retrofitting user_id later means data migration. Scaffold already exists (`src/utils/supabase/*`, auth callback) — activate it, delete demo credentials, fix the unauthenticated `/api/settings/keys` hole in the same stroke.
2. **Schema + persistence + store hydration.** Apply extended schema; replace Zustand mock initializers with hydrate-from-Supabase; wire holdings/watchlist CRUD to DB. *Deliverable: holdings survive refresh.* This is the pattern-setting step — every later feature reuses the hydration + typed `lib/db/` layer.
3. **Price pipeline + P&L.** Needs real symbols from step 2. Build `lib/market-data/` (symbol mapping incl. `.NS`/`.BO`), the job route, pg_cron schedule, on-demand refresh, and compute P&L in the read path. Fix the silent Yahoo failure (surface errors + `updated_at` staleness in UI) while here.
4. **CSV import.** Needs transactions table + holdings derivation; independent of news, can slot anywhere after step 2, but doing it after prices means imported holdings immediately show live P&L.
5. **Alerts + Telegram.** Needs fresh prices (step 3). Bot setup, `telegram_chat_id` handshake, outbox table, evaluator inside the price job, dispatcher. Small and self-contained.
6. **News ingestion + matching + summarization.** Needs symbols (step 2) and benefits from Telegram (step 5) for news alerts. Build fetch/normalize/dedup first with raw headlines visible in UI; add Gemini summarization as a second pass — the pipeline works without AI, which de-risks rate limits.
7. **Daily digest.** Pure composition of steps 3+5+6. Last.

Rationale for this order over "news first": news matching needs a real symbol universe, and alerting needs a delivery channel — both fall out of the portfolio/price work. It also matches the project's stated first-win decision (real holdings + live prices).

## Architectural Patterns

### Pattern 1: Shared global cache tables, per-user reference tables

**What:** `price_cache` and `news_items` are global (one row per symbol/article, written by service-role jobs); user tables (`holdings`, `alerts`) reference them by symbol. Users' views are joins, not copies.
**When to use:** Any multi-user-capable tracker on free-tier quotas — external API cost is O(distinct symbols), not O(users × symbols).
**Trade-offs:** Requires the RLS split (SELECT-only for users, service-role writes); per-user news relevance is computed at query time (`affected_symbols && ARRAY(user symbols)`).

### Pattern 2: DB-scheduled HTTP jobs (pg_cron + pg_net → route handler)

**What:** Job logic lives in Next.js route handlers; Supabase Postgres schedules them.

```sql
select cron.schedule('refresh-prices', '0 */3 * * *', $$
  select net.http_post(
    url := 'https://<app>.vercel.app/api/jobs/refresh-prices',
    headers := jsonb_build_object('Authorization', 'Bearer ' || '<CRON_SECRET>')
  );
$$);
```

**When to use:** Vercel Hobby (cron limited to once/day) + Supabase free tier (pg_cron/pg_net included). Bonus: the 2–4h job traffic itself keeps the Supabase free project from pausing (7-day inactivity rule).
**Trade-offs:** Secret lives in the cron job definition; fire-and-forget (pg_net won't retry) — make jobs idempotent and rely on the next tick. Keep each run under Vercel Hobby's function duration ceiling (~60s configured; verify current limit) by chunking symbols and doing summarization in bounded batches.

### Pattern 3: Notifications outbox

**What:** Alert evaluation writes `notifications` rows; a dispatcher drains `pending` rows to Telegram and marks them. Never call Telegram inline from evaluation logic.
**When to use:** Always — it decouples "what fired" from "was it delivered", gives retries for free (next job run re-drains failures), an audit trail, and one place for cooldown/dedup.
**Trade-offs:** Slight delivery latency (bounded by job cadence); trivial table to add.

### Pattern 4: Server-hydrated Zustand (retrofit pattern)

**What:** Keep the existing stores and components; replace mock initial state with a `hydrate(accounts)` action fed by an initial server fetch; mutations write Supabase first (RLS client), then update the store optimistically.
**When to use:** Retrofitting persistence into a working client-state app without rewriting components — exactly this milestone.
**Trade-offs:** Two sources of truth momentarily (DB + store); acceptable for a single user per session. Avoid the temptation to move everything to server components in the same milestone — that's a rewrite, not a retrofit.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Fetching prices/news from the browser

**What people do:** Components call Yahoo/RSS directly on mount or interval.
**Why it's wrong:** CORS walls, per-tab duplicate quota burn, no data when the app is closed (alerts/digest need server-side data), silent-failure fallbacks — the exact bug class this codebase already has.
**Instead:** Browser reads Postgres only; pipelines populate Postgres. Show `price_cache.updated_at` as staleness in the UI.

### Anti-Pattern 2: Per-user news duplication

**What people do:** Store matched news rows per user/account.
**Why it's wrong:** Duplicates rows and AI summaries (Gemini free tier is ~15 req/min), bloats the 500MB free database.
**Instead:** Global `news_items` with `affected_symbols[]`; per-user relevance via array-overlap query.

### Anti-Pattern 3: Summarizing everything with the LLM

**What people do:** Send every fetched article to Gemini individually.
**Why it's wrong:** Rate limits blow up immediately; most RSS items are duplicates or irrelevant.
**Instead:** Dedup and match *before* AI; batch 10–20 new headlines per prompt; store results so an article is summarized exactly once, globally.

### Anti-Pattern 4: Relying on Vercel Hobby cron for the 2–4h cadence

**What people do:** Put `*/180 * * * *` in `vercel.json` and assume it runs.
**Why it's wrong:** Hobby caps cron at once per day, with up-to-an-hour timing slop; deployment fails or the schedule silently degrades.
**Instead:** pg_cron + pg_net (Pattern 2); reserve the single Vercel daily cron for the digest.

### Anti-Pattern 5: Holdings as the write model for imports

**What people do:** CSV import mutates `holdings.quantity/avg_price` directly.
**Why it's wrong:** Re-imports double-count; no P&L history; can't reconcile manual edits vs imports.
**Instead:** Import into `transactions` (idempotent via `import_batch_id` + uniqueness), derive holdings; manual "add holding" can create a synthetic buy transaction.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 user (now) | Everything above on free tiers. ~20–50 distinct symbols → 1–2 Yahoo batch calls and a handful of RSS fetches per cycle. Nothing to tune. |
| 10–100 users | Same architecture holds (global caches are O(symbols)). Watch: Gemini summarization volume → cache-first + importance filter; Supabase 500MB → prune news_items older than ~60–90d; job duration → split ingest across symbol chunks or move long stages to Supabase Edge Functions. |
| 1k+ users | Move pipelines to a real queue/worker (or Supabase queues), paid data source with SLA, Redis for hot quotes, per-user quotas. Not worth designing for now — table shapes above survive this migration. |

**First bottleneck:** Gemini free-tier rate limit during news bursts → batching + "new items only" discipline (built into the pipeline order above).
**Second bottleneck:** unofficial Yahoo endpoints throttling/changing → isolate all fetch logic in `lib/market-data/` behind one interface so a source swap (e.g., adding Stooq/Alpha Vantage fallback) touches one module; always record `source` and surface staleness rather than faking values.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Supabase Auth | `@supabase/ssr` middleware + server client (already scaffolded) | Delete demo-cookie path entirely; RLS depends on real sessions |
| Supabase Postgres | RLS client (browser/user routes) + service-role client (jobs only) | Service-role key server-only env var; never in client bundle |
| Supabase pg_cron/pg_net | SQL-defined schedules POSTing to job routes | Free tier; 1-min granularity; jobs must finish <10 min (pg_cron side) and within Vercel function limits |
| Yahoo Finance quotes | Server-side batch quote fetch; `.NS`/`.BO` suffixes for NSE/BSE | Unofficial — rate-limit aggressively, retry with backoff, log failures loudly (current code fails silently) |
| Google News RSS / publisher RSS | Per-ticker query feeds; ET/Moneycontrol for India | Free, no keys; treat as best-effort; dedup handles overlap between feeds |
| Gemini (existing `ai-provider`) | Batched summarization + digest composition | Free tier ~15 req/min — queue/batch, never per-article calls |
| Telegram Bot API | HTTPS `sendMessage` from dispatcher; one-time `/start` handshake stores `chat_id` | Free, no approval; simplest possible delivery channel |
| Vercel cron (daily) | Single `vercel.json` entry → digest route | Hobby: once/day max, ±1h timing slop — fine for a digest |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| UI ↔ per-user tables | supabase-js under RLS | No API route needed for plain CRUD |
| UI ↔ shared tables | SELECT-only via RLS | Writes forbidden; jobs own them |
| UI ↔ on-demand refresh / import / research | fetch() to session-guarded routes | Server-side secrets stay server-side |
| Scheduler ↔ jobs | HTTP + `CRON_SECRET` bearer check | Reject unauthenticated calls with 401 before any work |
| Jobs ↔ DB | service-role client via shared `lib/db/` | Same typed queries as UI where possible |
| Alert evaluation ↔ delivery | notifications outbox table | Never call Telegram inline from evaluators |

## Sources

- Vercel cron jobs — usage, pricing, Hobby once-per-day limit and timing slop: https://vercel.com/docs/cron-jobs/usage-and-pricing , https://vercel.com/docs/cron-jobs (HIGH)
- Supabase — scheduling Edge Functions / HTTP calls with pg_cron + pg_net: https://supabase.com/docs/guides/functions/schedule-functions , https://supabase.com/docs/guides/database/extensions/pg_cron (HIGH; available on free tier)
- Supabase — free project pausing after 7 days inactivity: https://supabase.com/docs/guides/platform/free-project-pausing (HIGH)
- Existing codebase: `supabase/schema.sql` (10-table RLS schema already sketched), `src/store/usePortfolioStore.ts`, `src/utils/supabase/*`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONCERNS.md` (HIGH — read directly)
- Free market/news data landscape 2026 (Yahoo unofficial status, Alpha Vantage/Finnhub free tiers): https://thenextgennexus.com/2026/05/15/10-best-free-stock-market-apis-2026/ (MEDIUM — community survey, aligns with known ecosystem)
- Telegram Bot API `sendMessage` (free, HTTPS, no approval): long-stable official API, https://core.telegram.org/bots/api (HIGH)
- Vercel Hobby function max duration for job routes: MEDIUM — verify current limit during phase planning; design jobs as chunked/idempotent regardless.

---
*Architecture research for: personal portfolio tracker + news intelligence (FolioIntel milestone 2)*
*Researched: 2026-07-13*
