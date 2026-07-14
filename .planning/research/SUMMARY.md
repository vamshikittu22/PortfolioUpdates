# Project Research Summary

**Project:** PortfolioUpdates (FolioIntel)
**Domain:** Personal stock portfolio manager + market-news intelligence (India NSE/BSE + US), retrofitting persistence/pipelines onto an existing mock-data Next.js 16 + Supabase app
**Researched:** 2026-07-13
**Confidence:** HIGH on stack and architecture; MEDIUM-HIGH on features and pitfalls (free-source/broker-format specifics need runtime verification)

## Executive Summary

This is a read-optimized web dashboard sitting on top of write-oriented background pipelines, joined by a shared Supabase Postgres database — the shape every serious portfolio-plus-news tracker (Ghostfolio, Portfolio Performance, Simply Wall St, INDmoney) converges on. The user-facing app never calls Yahoo, RSS, or Gemini at request time; it reads pre-computed rows. Scheduled jobs fetch external data every 2–4 hours, normalize/dedup/match/summarize it, and write it down. Notifications (Telegram) are a small third subsystem that drains an outbox the pipelines fill. The existing codebase already *looks* finished but runs entirely on mock data — the work is to make the scaffolded Supabase auth/persistence real, replace fragile hand-rolled Yahoo fetches, and add news + alerts + digest pipelines, all on free tiers.

All four researchers independently converged on the same load-bearing decisions, and these should be treated as settled going into the roadmap: (1) **Model holdings as transactions**, not mutable `quantity`/`avg_price` columns — India's frequent bonuses/splits plus partial sells and re-imports corrupt a snapshot model, and this is the single highest-leverage schema decision. (2) **Instrument identity is ISIN + exchange**, with `yahoo_symbol` (`.NS`/`.BO`/bare) as a derived lookup key — never treat a bare ticker string as a primary key (`INFY` is valid on both NSE and NYSE). (3) **Supabase `pg_cron` + `pg_net` drives the 2–4h refresh**, because Vercel Hobby cron is daily-only; the same DB traffic doubles as a keep-alive against the 7-day free-project pause. (4) **Multi-currency amounts are stored native and converted at render** using a cached FX rate. (5) **Auth + RLS must come first** — retrofitting `user_id` isolation after data exists is a migration nightmare.

The dominant risk theme is **free-tier fragility surfacing as silent wrong data** — the exact disease the codebase already has (Yahoo fails silently to mock values). Yahoo Finance is an unofficial, cloud-IP-rate-limited scrape (mitigate: scheduled batch fetch, DB cache, provider interface, visible staleness — never fabricate); Gemini free-tier quota is low, volatile, and shared across the research/YouTube/news features (mitigate: dedup+match before AI, batch 10–20 headlines per call, persist summaries, degrade to headlines-only when budget is spent). The governing principle across every phase: **fail loudly with a stale badge, never silently fall back to mock — and a feature is not done until its mock module is deleted.**

## Key Findings

### Recommended Stack

Additions only — the existing Next.js 16.2.9 / React 19 / TS 5 / Tailwind 4 / Zustand 5 / Supabase stack stays. Versions verified against npm registry 2026-07-13. See `.planning/research/STACK.md`.

**Core technologies:**
- **yahoo-finance2 @4.0.0**: unified free price source for NSE (`.NS`), BSE (`.BO`), and US tickers — the only free lib covering both markets with one symbol convention; replaces the fragile raw-endpoint client. **Requires Node 22+** (set Vercel runtime + `engines`). Server-side only.
- **Supabase pg_cron + pg_net** (built-in): the architecture-deciding scheduler — Vercel Hobby cron is daily-only, so `pg_net.http_post` hits a `CRON_SECRET`-guarded route every 2–4h.
- **@google/genai @2.11.0**: Gemini SDK for news summarization/digest — **the installed `@google/generative-ai` is dead** (deprecated 2025-11-30, archived); migrate call sites.
- **Zod @4.4.3**: validate CSV/XLSX rows, API inputs, external responses (fixes the no-input-validation concern). Use v4, not v3.
- **papaparse @5.5.4** (Robinhood CSV) + **exceljs @4.4.0** (Groww XLSX — *not* SheetJS `xlsx`, which has unpatched CVEs) + **rss-parser @3.13.0** (Google News / Indian publisher RSS).
- **Telegram Bot API via raw `fetch`** for push-only alerts/digest (zero deps, serverless-friendly); add **grammY @1.44.0** only if interactive commands arrive.

**Free-tier limits that constrain architecture:** Vercel Hobby cron = daily-only; Supabase free = 500MB DB + 7-day inactivity pause; Gemini free ≈ 10 RPM + low per-project daily cap (shared across features); Finnhub free = US/Canada tickers only (never NSE/BSE); Yahoo = no quota but unofficial/blockable. Alpha Vantage (25/day) and NewsAPI (24h delay) are explicitly unusable as primaries.

### Expected Features

Benchmarked against Ghostfolio, Portfolio Performance, INDmoney, Simply Wall St. See `.planning/research/FEATURES.md`.

**Must have (table stakes):**
- Auth + per-user RLS isolation — enabler for everything
- Holdings + watchlist CRUD persisted as transactions (survives refresh)
- Live/delayed prices both markets with auto-refresh + refresh-now + visible "as of" timestamp
- Per-holding and portfolio P&L, native currency + INR-converted combined total
- CSV import (Groww holdings XLSX + Robinhood transaction CSV) with preview/dedupe
- Ticker-matched news feed for held + watched tickers

**Should have (competitive differentiators):**
- AI-summarized, relevance-filtered news with "why it matters" (this app's edge — Simply Wall St charges for it)
- Daily Telegram digest (P&L + top movers + summarized news) — no mainstream tracker does Telegram
- Telegram price/significant-news alerts with cooldowns
- Clean dual-market (India + US) native-currency view with per-market day-change / market-hours awareness
- Deep-link existing research + YouTube-sentiment modules to real holdings (wiring only)

**Defer (v2+):**
- Dividend tracking (needs `DIVIDEND` transaction type — but design schema to allow it)
- Realized P&L / XIRR / TWR (needs complete transaction discipline first)
- Tax-report exports (India FIFO / US lots — a product in itself; average cost is fine for *display*)
- Broker API sync, real-time streaming, corporate-action auto-adjustment, all-asset-class tracking, news firehose — explicit anti-features

### Architecture Approach

A read-optimized UI over write-oriented pipelines, sharing Postgres. **Background jobs live as Next.js route handlers** (sharing `src/lib/` code, same deploy), triggered over HTTP by pg_cron — not as Supabase Edge Functions (reserved as a fallback if function-duration limits bite). Price/news data is fetched **once into global shared-cache tables** (`price_cache`, `news_items`) regardless of user count; per-user tables (`holdings`, `transactions`, `watchlist`, `alerts`) reference them by symbol, and per-user views are joins, not copies. See `.planning/research/ARCHITECTURE.md`.

**Major components:**
1. **Auth + persistence layer** — Supabase Auth (activate scaffolding, delete demo cookie) + RLS-scoped per-user tables; new `transactions` and `symbols` (instrument master) tables.
2. **Price refresh pipeline** — `lib/market-data/` behind a `PriceProvider` interface: batch-fetch quotes → upsert `price_cache` → evaluate alerts. On-demand "refresh now" shares the same core fn.
3. **News pipeline** — `lib/news/` staged as fetch → normalize → dedup (URL + content-hash) → source-side match (per-ticker RSS queries) → batched Gemini summarization of new items only.
4. **Notifications outbox + dispatcher** — alert evaluators write `notifications` rows; a dispatcher drains `pending` to Telegram (never call Telegram inline; free retries on next run).
5. **Server-hydrated Zustand** — keep existing stores/components; replace mock initializers with `hydrate()` from a typed DB→domain mapping layer; mutations write DB first, then optimistic store update.

### Critical Pitfalls

Top items from `.planning/research/PITFALLS.md` (8 critical pitfalls total):

1. **Unofficial Yahoo treated as reliable** — 429s and crumb errors hit cloud IPs fast. Fetch server-side on schedule, cache in DB, batch, backoff, show data age; provider interface for a fallback; **fail loudly, never fabricate a price.**
2. **NSE/BSE symbol identity confusion** — model `{isin, exchange, local_symbol, yahoo_symbol, name, currency}`; ISIN+exchange is identity, symbols are lookup keys; URL-encode (`M&M`); resolve imports by ISIN first. Must be right *before* import/prices are built on top.
3. **Multi-currency P&L mixing rupees and dollars** — store native, convert at render with a cached FX rate; a missing FX rate blocks aggregation (shows stale), never defaults to 1.0; write down the current-rate-conversion decision.
4. **Cost basis corrupted by splits/sells** — transactions model with derived qty/avg-cost; manual split/bonus action; >40% overnight move → "possible corporate action" flag, not a giant red loss.
5. **RLS that exists but doesn't protect** — `ENABLE RLS` + four policies (incl. `WITH CHECK` on insert) + `user_id` index per table; service-role key server-only (SSR-client-with-service-key trap: cookie session overrides it — use a separate plain admin client); run Security Advisor; write a two-user isolation test.
6. **Vercel cron mental model** — Hobby is daily-only + arbitrary-minute; use pg_cron for 2–4h, reserve one Vercel daily cron for digest; `CRON_SECRET` bearer check on every job route; chunked idempotent jobs under the duration cap.
7. **Gemini free tier as pipeline bottleneck** — batch, filter-before-AI, structured JSON output + Zod, persist `summarized_at`, track daily budget, degrade to headlines-only. Quota is per-project, shared with research/YouTube.
8. **Mock-Zustand to server-data migration breaking the UI in slow motion** — typed mapping layer, split server-state from client-state (don't `persist` server entities), build empty/loading/error states, **delete mock per feature** (mock-deleted = done).

## Implications for Roadmap

Dependencies run strictly downward — each phase consumes the previous one's output. This ordering matches the project's stated "first win" (real holdings + live prices before news) and the architecture's build order.

### Phase 1: Auth + RLS Foundation
**Rationale:** Every persistent row needs `user_id` under RLS; retrofitting isolation later = data migration. RLS failure is invisible in a single-user app, so it must be verified, not assumed.
**Delivers:** Real Supabase Auth (demo cookie deleted), RLS on all per-user tables, two-user isolation test passing, Security Advisor clean, the unauthenticated `/api/settings/keys` hole closed.
**Addresses:** Auth + per-user data isolation (table stakes).
**Avoids:** Pitfall #5 (RLS that doesn't protect), plus the service-role/SSR session-override trap.

### Phase 2: Schema + Persistence + Store Hydration
**Rationale:** Pattern-setting step — the transactions model and instrument identity must be correct before import and prices build on them. Every later feature reuses the hydration + typed `lib/db/` layer.
**Delivers:** `transactions` + `symbols` (ISIN+exchange master) tables; holdings/watchlist CRUD wired to Supabase (survive refresh); Zustand mock initializers replaced with `hydrate()`; typed DB→domain mapping layer; empty states.
**Addresses:** Holdings/watchlist persistence (table stakes).
**Avoids:** Pitfalls #2 (symbol identity), #4 (transactions-not-snapshot), #8 (migration breakage). Mock modules for holdings/watchlist deleted.

### Phase 3: Price Pipeline + P&L + Scheduling
**Rationale:** Needs real symbols from Phase 2. Establishes the scheduled-job + shared-cache + on-demand pattern that alerts/news/digest all reuse.
**Delivers:** `lib/market-data/` behind a `PriceProvider` interface (Yahoo `.NS`/`.BO`/US, batched); `price_cache` upserts; pg_cron + pg_net 2–4h schedule + `CRON_SECRET`-guarded route; on-demand refresh; FX caching; native-currency P&L + INR-converted total; visible staleness badges; >40% move flag.
**Uses:** yahoo-finance2@4 (Node 22), Supabase pg_cron/pg_net, Zod.
**Implements:** Price refresh pipeline + shared-cache pattern.
**Avoids:** Pitfalls #1 (Yahoo reliability), #3 (currency mixing), #6 (Vercel cron reality).

### Phase 4: CSV Import (Groww + Robinhood)
**Rationale:** Needs the transactions table (Phase 2); doing it after prices means imported holdings immediately show live P&L. Independent of news.
**Delivers:** Broker-specific parsers behind one interface (exceljs for Groww XLSX, papaparse for Robinhood CSV); locale-aware number/date normalization; import preview with per-row dedupe/skip + unmatched-symbol override; idempotent re-import via `import_batch_id`.
**Uses:** exceljs, papaparse, Zod.
**Avoids:** CSV format-drift + duplicate-import gotchas; Anti-pattern "holdings as import write model."

### Phase 5: Alerts + Telegram
**Rationale:** Needs fresh prices (Phase 3) — alerting on flaky data is spam. Small, self-contained; establishes the notifications-outbox pattern for the digest.
**Delivers:** Telegram bot + `/start` `chat_id` handshake (allowlisted); `notifications` outbox; alert evaluator inside the price job (cooldowns via `last_triggered_at`); dispatcher draining to `sendMessage` (plain/HTML parse mode, 4096-char splitting).
**Uses:** Telegram Bot API (raw fetch).
**Implements:** Notifications outbox + dispatcher.
**Avoids:** Telegram token-leak / MarkdownV2-escaping / rate-limit pitfalls; alert-spam UX pitfall.

### Phase 6: News Pipeline + Matching + Summarization
**Rationale:** Needs the symbol universe (Phase 2) and benefits from Telegram (Phase 5) for news alerts. Ship raw headlines first, add Gemini as a second pass — the pipeline works without AI, de-risking rate limits.
**Delivers:** `lib/news/` staged fetch (Finnhub for US, Google News + Indian publisher RSS for NSE/BSE) → normalize → dedup (URL + content-hash) → source-side ticker match → batched Gemini summarization of `summarized_at IS NULL` items → per-user relevance via array-overlap; budget tracking + headlines-only degradation.
**Uses:** rss-parser, @google/genai, Finnhub free tier (US only), Zod (structured JSON output).
**Implements:** News pipeline + summarization step.
**Avoids:** Pitfall #7 (Gemini bottleneck); news false-positive matching (word-boundary + company-name rules).

### Phase 7: Daily Digest
**Rationale:** Pure composition of Phases 3+5+6. Last. Fits the single Vercel daily cron.
**Delivers:** Once-daily job composing portfolio snapshot + top movers + summarized news → one Gemini call → outbox → Telegram.
**Uses:** Vercel daily cron, existing pipelines.

### Phase Ordering Rationale
- **Strict downward dependency:** auth → schema/persistence → prices → (import and alerts) → news → digest. News matching needs a real symbol universe; alerting needs a delivery channel — both fall out of the portfolio/price work rather than preceding it.
- **Pattern-setting front-loaded:** Phase 2 establishes hydration + typed DB layer; Phase 3 establishes the scheduled-job + shared-cache + secret-guarded-route pattern; Phase 5 establishes the outbox — later phases reuse these rather than reinventing.
- **Pitfall prevention is baked into phase boundaries:** the two hardest-to-reverse pitfalls (instrument identity #2, transactions-not-snapshot #4) live in Phase 2 before anything builds on them; RLS (#5) is a Phase 1 success criterion, not hardening.
- **AI is always a second pass:** prices/news pipelines must work with raw data before Gemini is layered on, so free-tier quota exhaustion can never block the core feature.

### Research Flags

Phases likely needing `/gsd:research-phase` during planning:
- **Phase 3 (Price/Scheduling):** verify *current* Vercel Hobby function-duration limits (changed with Fluid compute in 2025–2026) and exact pg_cron→pg_net invocation ergonomics; check yahoo-finance2 GitHub issues for fresh breakage before building.
- **Phase 4 (CSV Import):** Groww XLSX and Robinhood CSV exact layouts are LOW-confidence — obtain real export files and build fixture tests before finalizing parsers.
- **Phase 6 (News/Gemini):** verify actual Gemini free-tier RPD in AI Studio for this project (published numbers withdrawn; per-project truth only visible in console); confirm Finnhub free US-only restriction and Google News RSS redirect-URL handling at implementation.

Phases with standard patterns (can skip deeper research):
- **Phase 1 (Auth+RLS):** well-documented Supabase pattern; scaffolding exists — verification-heavy, not research-heavy.
- **Phase 2 (Persistence/hydration):** standard server-hydrated-Zustand retrofit; schema sketch already in ARCHITECTURE.md.
- **Phase 5 (Telegram):** stable long-lived Bot API; send-only path is trivial.
- **Phase 7 (Digest):** pure composition of prior phases.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified against npm registry; free-tier limits from official docs or multiple corroborating sources; Gemini exact RPD flagged LOW inline |
| Features | MEDIUM-HIGH | Competitor feature sets from official product pages; Groww/Robinhood CSV format specifics MEDIUM-LOW, need real-export verification |
| Architecture | HIGH | Component structure + Supabase/Vercel constraints verified against official docs; news-source specifics MEDIUM (unofficial by nature); schema sketch grounded in existing `supabase/schema.sql` |
| Pitfalls | MEDIUM-HIGH | Mix of official docs, GitHub issue threads, community post-mortems; volatile limits (Gemini/Vercel) flagged for re-verification at phase time |

**Overall confidence:** HIGH — the load-bearing structural decisions (transactions model, ISIN+exchange identity, pg_cron scheduling, native-currency storage, auth-first, shared-cache tables) are consistent across all four research files and well-sourced. Residual uncertainty is concentrated in externally-controlled specifics (exact free-tier quotas, broker export layouts, unofficial-source stability) that are best resolved with runtime verification during their phases, not more upfront research.

### Gaps to Address
- **Exact free-tier quotas (Gemini RPD, Vercel function duration):** volatile and per-project/plan-specific — check AI Studio + Vercel dashboard during Phase 3/6 planning; design jobs chunked/idempotent and AI batched regardless, so exact numbers don't change the design.
- **Broker export formats (Groww XLSX, Robinhood CSV):** LOW confidence on layout — acquire real export files, build defensive header-detection parsers + fixture tests in Phase 4; preview-before-commit protects users meanwhile.
- **Yahoo/Google-News unofficial-source stability:** can change without notice — the `PriceProvider` interface + shared cache + visible staleness make a source swap a one-module change; monitor GitHub issues before each price-touching phase.
- **FX cost-basis policy:** current-rate conversion with native per-holding P&L is the recommended default, but the decision (current vs purchase-date rate) must be written down explicitly during Phase 3 planning.
- **Corporate-action detection:** auto-detection is out of free-tier scope; schema must *allow* manual split/bonus entry (Phase 2), with the >40% flag as a safety net (Phase 3), and manual entry as a fast-follow.

## Sources

### Primary (HIGH confidence)
- npm registry (versions verified 2026-07-13); github.com/gadicc/yahoo-finance2 (v4 Node-22 requirement, unofficial caveats)
- vercel.com/docs/cron-jobs (Hobby daily-only, timing slop); supabase.com/docs (pg_cron + pg_net, free-tier 7-day pause, RLS, service-role/SSR trap)
- github.com/google-gemini/deprecated-generative-ai-js + ai.google.dev/gemini-api/docs/migrate (old SDK EOL, @google/genai replacement)
- Existing codebase: `supabase/schema.sql`, `src/store/`, `src/utils/supabase/*`, `.planning/codebase/` (ARCHITECTURE, CONCERNS)
- Competitor product pages: Ghostfolio, Portfolio Performance, Simply Wall St, INDmoney; core.telegram.org/bots/api

### Secondary (MEDIUM confidence)
- finnhub.io/docs + 2026 API comparisons (60/min free, US/Canada-only); Google News RSS analyses (100-item cap, redirect URLs)
- yfinance issues #2125/#2128/#2422 (2024–2025 rate-limit tightening); Supabase RLS misconfiguration write-ups
- NSE/BSE `.NS`/`.BO` symbol conventions; Robinhood/Groww export community tooling

### Tertiary (LOW confidence — needs validation)
- Exact Gemini free-tier RPD (published numbers withdrawn — verify in AI Studio)
- Groww XLSX / Robinhood CSV exact layouts (community tooling only — verify against real exports)
- Vercel Hobby exact function-duration caps (Fluid compute changed them — re-verify at Phase 3)

---
*Research completed: 2026-07-13*
*Ready for roadmap: yes*
