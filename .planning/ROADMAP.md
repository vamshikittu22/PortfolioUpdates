# Roadmap: PortfolioUpdates (FolioIntel)

## Overview

The app already looks finished but runs entirely on mock data. This milestone makes it real, in strict dependency order: first lock down per-user auth and Row-Level Security (retrofitting isolation later is a data migration), then establish the transactions-ledger schema and instrument identity that everything else builds on, hydrate the existing UI from persisted data, layer on the scheduled price pipeline and P&L, add CSV import, wire up Telegram alerts through a retryable outbox, build the portfolio-matched AI-summarized news feed, and finish with a once-daily Telegram digest that composes it all. The governing rule throughout: fail loudly with a visible stale/error state, never silently fall back to mock — and a feature is not done until its mock module is deleted.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Auth + RLS Foundation** - Real Supabase auth with verified per-user data isolation, demo cookie deleted
- [x] **Phase 2: Schema + Persistence + Hydration** - Transactions-ledger schema, ISIN+exchange symbol master, holdings/watchlist persisted, UI reads real data (completed 2026-07-14)
- [x] **Phase 3: Price Pipeline + P&L + Scheduling** - Free-source prices on a 2–4h schedule + on-demand, multi-currency P&L with honest staleness (completed 2026-07-15)
- [ ] **Phase 4: CSV Import** - Idempotent Groww XLSX + Robinhood CSV import with preview and symbol mapping
- [ ] **Phase 5: Alerts + Telegram** - Telegram link handshake, per-ticker price alerts, retryable notifications outbox
- [ ] **Phase 6: News Pipeline + Summarization** - Portfolio-matched, deduped, AI-summarized news feed + significant-news alerts
- [ ] **Phase 7: Daily Digest** - Once-daily Telegram digest composing portfolio snapshot + summarized news

## Phase Details

### Phase 1: Auth + RLS Foundation
**Goal**: Real per-user authentication with enforced, verified data isolation from day one.
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06
**Success Criteria** (what must be TRUE):
  1. User can sign up, log in with email/password, and log out from any page; the demo credential/cookie login no longer exists.
  2. A refreshed browser stays logged in only when the session validates server-side — an edited or forged cookie is rejected.
  3. A second user cannot read or write the first user's rows, proven by a passing two-user isolation test.
  4. Scheduled/admin operations run through a dedicated service-role client the browser never receives and a user cookie cannot override.
  5. `/api/settings/keys` rejects unauthenticated requests, and Supabase Security Advisor reports clean.
**Plans**: 4 plans
- [ ] 01-01-PLAN.md — Local Supabase stack, migrations & RLS write-hole fixes + env wiring
- [ ] 01-02-PLAN.md — Service-role admin client + two-user RLS isolation test
- [ ] 01-03-PLAN.md — Real auth flow: proxy migration, login rewrite, logout (mock deleted)
- [ ] 01-04-PLAN.md — Secure /api/settings/keys + end-to-end auth verification

### Phase 2: Schema + Persistence + Hydration
**Goal**: Holdings and watchlist persist as a transactions ledger keyed by correct instrument identity, and the existing UI reads live user data instead of mock.
**Depends on**: Phase 1
**Requirements**: PORT-01, PORT-02, PORT-03, PORT-04, PORT-05, PORT-06, PORT-07, WIRE-01, WIRE-02
**Success Criteria** (what must be TRUE):
  1. User can add, edit, and delete holdings and watchlist entries, and they survive a browser refresh (stored in Supabase).
  2. Holdings quantity and average cost are derived from a BUY/SELL transactions ledger and stay correct after a partial sell.
  3. User can record a manual split/bonus action that adjusts derived quantity and average cost without showing a false loss.
  4. Every instrument resolves against an ISIN+exchange symbol master with the correct display symbol, currency, and price-source symbol (INFY on NSE vs NYSE are distinct rows).
  5. Dashboard, holdings, watchlist, and allocation views read persisted data with real empty states, the mock portfolio store is deleted, and the research + YouTube modules deep-link from real holdings/watchlist and channel list.
**Plans**: 7 plans
- [ ] 02-01-PLAN.md — Instruments + transactions schema migrations (ISIN+exchange identity, watchlist re-key, drop legacy holdings, seed data)
- [ ] 02-02-PLAN.md — Shared domain types + deriveHoldings TDD (weighted-avg-cost ledger math, partial-sell/split/bonus correctness)
- [ ] 02-03-PLAN.md — WIRE-02: YouTube channel list migrated from localStorage to Supabase yt_channels
- [ ] 02-04-PLAN.md — Supabase data-access layer + Server Actions (holdings/watchlist reads + mutations)
- [ ] 02-05-PLAN.md — Dashboard/Holdings/Watchlist/Allocation hydration + Add/Edit/Sell/Split/Bonus/Delete UI
- [ ] 02-06-PLAN.md — Layout/News/Alerts cleanup, mock store deletion, live-DB verification checkpoint
- [ ] 02-07-PLAN.md — WIRE-01: Research module deep-linked from real holdings/watchlist

### Phase 3: Price Pipeline + P&L + Scheduling
**Goal**: Real prices flow in on a schedule and on demand, driving accurate multi-currency P&L with honest staleness — never a fabricated value.
**Depends on**: Phase 2
**Requirements**: PRICE-01, PRICE-02, PRICE-03, PRICE-04, PRICE-05, PRICE-06, PRICE-07
**Success Criteria** (what must be TRUE):
  1. Held and watched tickers (NSE `.NS`, BSE `.BO`, and US) show real prices from a free source in a shared price cache, each with an "as of" timestamp.
  2. Prices auto-refresh every 2–4 hours via a secret-guarded scheduled job (pg_cron + pg_net), and a "refresh now" button fetches the current live price on demand.
  3. A failed price fetch shows a stale-with-warning badge and never a fabricated value.
  4. Per-holding and total P&L display day-change and total-change, stored in native currency with the combined total converted at a cached FX rate whose effect is visible.
  5. A >40% overnight price move is flagged as a possible corporate action rather than shown as a large gain/loss.
**Plans**: 6 plans
- [ ] 03-01-PLAN.md — fx_cache + price_cache schema (instrument_id key, nullable price/source, fetch_error, corporate_action_flag) + pg_cron/pg_net scheduling migration
- [ ] 03-02-PLAN.md — TDD: pure logic (Yahoo response parsing, corporate-action heuristic, refresh dedup, refresh-secret guard, FX conversion, per-holding/portfolio P&L math)
- [ ] 03-03-PLAN.md — Network wrappers: fetchPrices (Yahoo Finance) + fetchFXRate (ExchangeRate Host), honest failure handling
- [ ] 03-04-PLAN.md — refresh-service orchestration + secret-guarded /api/prices/refresh route + on-demand refreshPricesNow Server Action
- [ ] 03-05-PLAN.md — Dashboard/Holdings UI: real prices, P&L, staleness badges, FX-visible totals, corporate-action flags, refresh button
- [ ] 03-06-PLAN.md — Live checkpoint: schedule + on-demand refresh + staleness behavior verified against a real DB/deployment

### Phase 4: CSV Import
**Goal**: Users load real holdings from Groww and Robinhood exports safely, previewably, and idempotently.
**Depends on**: Phase 2 (transactions/symbols); Phase 3 makes imported holdings show live P&L immediately
**Requirements**: IMPT-01, IMPT-02, IMPT-03, IMPT-04, IMPT-05
**Success Criteria** (what must be TRUE):
  1. User can import a Groww export (XLSX) and a Robinhood export (CSV), with rows parsed into transactions.
  2. Import shows a preview with per-row validation, duplicate detection, and skip/override before anything is committed.
  3. Unmatched symbols can be mapped to the correct instrument by ISIN/exchange rather than being silently dropped.
  4. Re-importing the same file adds no duplicate transactions (idempotent via an import batch id), and imported holdings immediately reflect live P&L.
**Plans**: 7 plans
- [ ] 04-01-PLAN.md — Schema: import_batches + symbol_mappings + transactions provenance columns + partial unique index + find_or_create_instrument RPC + RLS test extension
- [ ] 04-02-PLAN.md — TDD: parsing primitives (types, normalize, row-hash, broker detection) + xlsx/papaparse deps
- [ ] 04-03-PLAN.md — TDD: Groww/Robinhood parsers + instrument matching + duplicate detection (synthetic fixtures)
- [ ] 04-04-PLAN.md — previewImport/commitImport Server Actions (server-side parse, atomic idempotent write) + body-size config
- [ ] 04-05-PLAN.md — Import UI leaf components: dropzone, preview table (bulk toggles), resolve-symbols, result summary
- [ ] 04-06-PLAN.md — /import progressive page shell + container state machine + Holdings entry point
- [ ] 04-07-PLAN.md — Live checkpoint: real-file fixtures + end-to-end import verification (idempotency, mapping, live P&L)

### Phase 5: Alerts + Telegram
**Goal**: Users receive reliable per-ticker price alerts on Telegram through a retryable outbox that later phases reuse.
**Depends on**: Phase 3 (fresh prices to alert on)
**Requirements**: ALRT-01, ALRT-02, ALRT-03, ALRT-05
**Success Criteria** (what must be TRUE):
  1. User can link their Telegram account via a bot `/start` handshake, with the chat id captured and allowlisted.
  2. User can set per-ticker price alerts (threshold up/down).
  3. A triggered price alert sends a Telegram message with a cooldown so it does not repeat on every refresh.
  4. Notifications are written to an outbox and dispatched separately, so a delivery failure retries on the next run instead of being lost.
**Plans**: TBD

### Phase 6: News Pipeline + Summarization
**Goal**: A portfolio-filtered, deduplicated, AI-summarized news feed surfaces only relevant items, with significant-news pushed to Telegram.
**Depends on**: Phase 2 (symbol universe), Phase 5 (Telegram outbox for news alerts)
**Requirements**: NEWS-01, NEWS-02, NEWS-03, NEWS-04, NEWS-05, ALRT-04
**Success Criteria** (what must be TRUE):
  1. System fetches news for held and watched tickers from free sources (Finnhub for US; Google News + Indian publisher RSS for NSE/BSE), deduplicated by URL and normalized-title hash and matched with word-boundary / company-name rules to avoid false positives.
  2. User sees a news feed filtered to their portfolio, newest first, with source and timestamp.
  3. New matched items are AI-summarized in batches with a short "why it matters"; summaries persist and are not regenerated.
  4. When the AI budget is exhausted, the feed degrades to matched headlines-only rather than failing.
  5. Significant news matched to a held ticker sends a Telegram alert via the Phase 5 outbox.
**Plans**: TBD

### Phase 7: Daily Digest
**Goal**: A once-daily Telegram digest composes the portfolio snapshot and the day's summarized news into a single message.
**Depends on**: Phase 3 (P&L/movers), Phase 5 (Telegram outbox), Phase 6 (summarized news)
**Requirements**: DGST-01, DGST-02
**Success Criteria** (what must be TRUE):
  1. Once per day the system sends a single Telegram digest containing total value, day P&L, top movers, and the day's summarized portfolio news.
  2. User can enable or disable the daily digest, and the digest respects their linked Telegram account.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Auth + RLS Foundation | 0/4 | Not started | - |
| 2. Schema + Persistence + Hydration | 7/7 | Complete   | 2026-07-14 |
| 3. Price Pipeline + P&L + Scheduling | 6/6 | Complete   | 2026-07-15 |
| 4. CSV Import | 7/7 | Complete (04-07 live verify DEFERRED — no broker files/migration consent yet) | 2026-07-16 |
| 5. Alerts + Telegram | 0/TBD | Not started | - |
| 6. News Pipeline + Summarization | 0/TBD | Not started | - |
| 7. Daily Digest | 0/TBD | Not started | - |

---
*Roadmap created: 2026-07-13*
