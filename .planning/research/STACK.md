# Stack Research

**Domain:** Personal stock portfolio manager with market-news intelligence (India NSE/BSE + US), free-tier-only additions to an existing Next.js 16 + Supabase app
**Researched:** 2026-07-13
**Confidence:** HIGH overall (versions verified against npm registry and official docs; free-tier limits verified against provider docs or multiple corroborating sources; exceptions flagged inline)

**Scope note:** This researches only what's being ADDED. The existing stack (Next.js 16.2.9, React 19, TypeScript 5, Tailwind 4, Zustand 5, Radix, Recharts, `@supabase/ssr` 0.12.0 / `@supabase/supabase-js` 2.108.2) is documented in `.planning/codebase/STACK.md` and is not re-litigated here.

## Recommended Stack

### Core Additions

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| yahoo-finance2 | 4.0.0 | Stock quotes/charts for NSE (`.NS`), BSE (`.BO`), and US tickers via one library | The only free source that covers Indian AND US equities with one symbol convention. v4 handles Yahoo's cookie/crumb dance, validates responses, and is typed. The codebase already hits raw `query2.finance.yahoo.com` endpoints and fails silently — the library replaces that fragile hand-rolled client. Requires Node 22+ (Vercel supports Node 22.x runtime). Server-side only (CORS blocks browser use) — call from API routes, which is the existing pattern. HIGH confidence (npm registry + github.com/gadicc/yahoo-finance2). |
| Supabase pg_cron + pg_net | built-in (hosted platform) | Scheduled refresh every 2–4 hours | **The architecture-deciding fact: Vercel Hobby cron jobs can only run once per day** (expressions like `0 */3 * * *` fail at deploy). pg_cron is enabled on the Supabase free tier and, combined with pg_net, can `http_post` to any URL on a schedule — point it at a secret-protected Next.js API route (`/api/jobs/refresh`) every 2–4 hours. Bonus: the DB activity helps keep the free project from being paused. HIGH confidence (supabase.com/docs/guides/cron, vercel.com/docs/cron-jobs/usage-and-pricing). |
| Vercel Cron | platform feature | Daily digest trigger (once/day) | Hobby plan allows up to 100 cron jobs but each at most daily, invoked sometime within the scheduled hour. One daily job for the Telegram digest fits this exactly. Keep the 2–4h price refresh on pg_cron. HIGH confidence (Vercel docs). |
| Telegram Bot API (raw `fetch`) | Bot API (HTTPS) | Push alerts + daily digest | For **push-only** notifications (price moves, news alerts, digest), `fetch("https://api.telegram.org/bot<token>/sendMessage", ...)` needs zero dependencies and zero long-lived process — ideal for serverless. Free, no approval process, ~30 msg/sec limit (far above this app's needs). Don't add a bot framework until you need interactive commands. HIGH confidence (core Telegram docs, stable for years). |
| grammY | 1.44.0 | Telegram bot framework — only if/when interactive commands are added | If the bot grows commands ("/portfolio", "/refresh"), grammY is the serverless-first choice: `webhookCallback(bot, "https")` drops into a Next.js route handler, no polling process needed. HIGH confidence (npm registry + grammy.dev/hosting/vercel). |
| Zod | 4.4.3 | Validate CSV/XLSX rows, API route inputs, external API responses | Standard TS-first validation. Also fixes a known codebase concern (no input validation on API routes). Zod 4 is the current major; new code should import from `zod` (v4 API) — don't install v3. HIGH confidence (npm registry). |
| @google/genai | 2.11.0 | Gemini SDK for news summarization | **The installed `@google/generative-ai` 0.24.1 is dead** — deprecated Nov 30 2025, repo archived Dec 2025, no bug fixes. New AI code (news summarization, digest generation) should use the unified `@google/genai` SDK; migrate existing call sites opportunistically. HIGH confidence (github.com/google-gemini/deprecated-generative-ai-js, ai.google.dev/gemini-api/docs/migrate). |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| papaparse | 5.5.4 | Robinhood CSV parsing | Robinhood exports account activity as CSV. Battle-tested, streams large files, header-row mapping. Pair with Zod schemas per row. |
| @types/papaparse | latest 5.x | Types for papaparse | Dev dependency (papaparse ships no types). |
| exceljs | 4.4.0 | Groww XLSX parsing | **Groww exports holdings/statements as .xlsx (Excel), not CSV** — a CSV-only import path can't ingest Groww's native export. ExcelJS is actively maintained on npm (unlike SheetJS `xlsx`, see What NOT to Use). Read-only usage: load workbook, iterate rows, validate with Zod. |
| rss-parser | 3.13.0 | Parse Google News RSS + Indian finance RSS feeds | Mature and stable (last publish 2023 — the RSS format doesn't change; not a risk). Handles RSS 2.0/Atom, custom fields. Server-side in API routes / scheduled jobs. |

### External Services (free tiers — limits constrain architecture)

| Service | Free-Tier Limit | Role | Confidence |
|---------|-----------------|------|------------|
| Yahoo Finance (via yahoo-finance2) | No official quota (unofficial API); be a polite client — batch with `quote([symbols])`, refresh every 2–4h, cache in Supabase | **Primary price source, both markets.** NSE = `RELIANCE.NS`, BSE = `RELIANCE.BO`, US = `AAPL` | HIGH that it works; inherent MEDIUM reliability risk (unofficial — Yahoo can change/block; mitigated by caching last-known prices in DB) |
| Google News RSS (`news.google.com/rss/search?q=...&hl=en-IN&gl=IN&ceid=IN:en`) | Free, no key; ~100 items/feed; links are Google redirect URLs; no SLA | **Primary news source for Indian tickers** (query by company name, e.g. "HDFC Bank" + `when:1d`), and fallback for US. Poll from the scheduled job, dedupe by title/URL hash in Supabase | MEDIUM (widely used, unofficial, format can change silently) |
| Publisher RSS: Economic Times Markets, Moneycontrol, Livemint, NSE India announcements RSS | Free, no key | Supplementary Indian market news firehose; filter items against held/watched tickers by name matching | MEDIUM |
| Finnhub `/company-news` | 60 calls/min free, but **US (and Canada) tickers only — international coverage is paid** | **Primary news source for US tickers** — ticker-tagged, JSON, generous rate limit. Do NOT plan on it for NSE/BSE | MEDIUM (finnhub.io/docs + multiple 2026 reviews agree on the US-only free restriction) |
| Marketaux | ~100 requests/day, ~3 articles/request on free plan | Optional supplement (has sentiment + entity tagging, covers India). Too thin as a primary at 3 articles/request | LOW-MEDIUM (pricing page blocked fetch; limits from multiple secondary sources — verify at signup) |
| Gemini API (`gemini-2.5-flash` / `gemini-2.5-flash-lite`) | Free tier ≈ 10 RPM and a low daily cap (sources report anywhere from ~20–250 RPD for 2.5-flash after Dec 2025 quota changes; flash-lite is higher) | News summarization + digest. **Design for scarcity: batch all new articles into one summarization call per refresh cycle (6–12 calls/day), never one call per article.** Check actual project quota in AI Studio | LOW on exact numbers (Google removed published numbers from docs; AI Studio shows per-project truth), HIGH on the design implication |
| Telegram Bot API | Free; ~30 msg/sec | Alerts + digest delivery | HIGH |
| Supabase free tier | 500MB DB, 2 active projects, 500K edge-function invocations/mo, 5GB egress, **project pauses after 7 days of inactivity** | Persistence + Auth + RLS + cron. Pause risk is real for a hobby app — the pg_cron job doing real DB writes every 2–4h doubles as a keep-alive | HIGH (supabase.com/pricing, docs) |
| Alpha Vantage | 25 requests/day, 5/min | **Do not build on this.** 25/day can't refresh even a modest two-market portfolio. Keep as emergency manual-lookup fallback at most | HIGH (alphavantage.co/support) |

## Installation

```bash
# Core additions
npm install yahoo-finance2 zod @google/genai

# Import + news pipeline
npm install papaparse exceljs rss-parser

# Only when interactive bot commands are needed
npm install grammy

# Dev dependencies
npm install -D @types/papaparse
```

Note: `yahoo-finance2@4` requires Node >= 22. Set the project's Node version to 22.x (Vercel project settings + `"engines": { "node": ">=22" }`).

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| yahoo-finance2 (both markets) | Finnhub quotes (60/min free) | As a US-only secondary price source if Yahoo starts blocking; never for NSE/BSE (paid) |
| yahoo-finance2 for NSE | `stock-nse-india` / direct NSE endpoints | Only if self-hosting on a residential/VPS IP. NSE's unofficial API requires a cookie handshake and aggressively blocks datacenter/cloud IPs — it will not work reliably from Vercel/Supabase infra |
| pg_cron + pg_net → Next.js route | cron-job.org (free, minute-level precision, execution alerts) | If you'd rather not manage SQL cron config, or as an independent second trigger. Equally valid; pg_cron chosen because it's already inside the stack, zero new accounts |
| pg_cron + pg_net → Next.js route | Supabase Edge Function on pg_cron schedule | If a job needs >60s runtime beyond Vercel Hobby's function limits. Costs: logic leaves the Next.js codebase (Deno runtime), so use only when function duration forces it |
| pg_cron + pg_net | GitHub Actions `schedule:` | Avoid for time-sensitive jobs: 10–30+ min delays are routine, and workflows are silently auto-disabled after 60 days without repo activity |
| Raw Telegram `fetch` → grammY when needed | Telegraf 4.x | Fine library, works serverless; grammY has better docs for the Vercel webhook path and lighter footprint. No strong reason to prefer Telegraf here |
| Google News RSS + Finnhub | NewsAPI.org | Its free "Developer" tier is non-commercial, 100 req/day, and articles are delayed 24 hours — a 24h delay defeats a news-intelligence app |
| exceljs (Groww XLSX) | Ask user to convert XLSX → CSV manually | Acceptable v0 shortcut if import UX allows "CSV only"; native XLSX ingestion is a small lift with exceljs and removes a papercut |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `xlsx` (SheetJS) from npm | npm version frozen at 0.18.5 with unpatched high-severity CVEs (ReDoS, prototype pollution); maintainer only ships fixes via their own CDN registry, which complicates lockfiles/CI | exceljs 4.4.0 |
| `@google/generative-ai` (already installed) | Deprecated 2025-11-30, archived, no fixes, no access to current API features | `@google/genai` 2.11.0 |
| `node-telegram-bot-api` | Polling-oriented (needs a long-lived process — doesn't fit Vercel serverless), stagnant, weak TypeScript support | Raw Bot API fetch, or grammY webhooks |
| Alpha Vantage as a primary price feed | 25 req/day total; a 15-holding two-market portfolio refreshed 6×/day needs ~90+ calls | yahoo-finance2 |
| Finnhub for Indian tickers | Free tier is US/Canada only; NSE/BSE data and news require paid plans | yahoo-finance2 (prices), Google News RSS (news) |
| Vercel cron for the 2–4h refresh | Hobby plan rejects sub-daily schedules at deploy time | Supabase pg_cron + pg_net (or cron-job.org) |
| Direct NSE India API calls from Vercel | Cloud IP blocking + cookie handshake = silent intermittent failures (the exact failure mode the app already suffers) | yahoo-finance2 `.NS`/`.BO` symbols |
| NewsAPI.org free tier | 24-hour article delay, non-commercial license | Google News RSS + Finnhub company-news |
| zod v3 | v4 is current (4.4.3); starting new validation code on v3 buys a migration later | zod 4 |

## Stack Patterns by Variant

**Scheduled refresh flow (every 2–4h):**
- pg_cron job → `pg_net.http_post` → `POST /api/jobs/refresh` on the Vercel deployment with an `Authorization: Bearer ${CRON_SECRET}` header (validate with Zod + constant-time compare)
- Route: fetch quotes via `yahooFinance.quote([...allHeldAndWatchedSymbols])` (one batched call), upsert into a `prices` table, fetch news feeds, dedupe, single batched Gemini summarization call, insert alerts, fire Telegram messages for threshold breaches
- Because it runs against Supabase, this same job is the free-tier keep-alive

**On-demand "refresh now":**
- Same route logic invoked from the UI (authenticated user instead of cron secret); Yahoo has no hard quota, so on-demand live fetches are fine — just debounce in the UI and cache results

**If Yahoo Finance starts failing (contingency):**
- Prices degrade gracefully to last-cached DB values with a staleness timestamp (never silent mock data — that's the current bug being fixed)
- US tickers can fail over to Finnhub free quotes; Indian tickers have no good free fallback — surface staleness honestly

**If the bot needs commands later:**
- Add grammY, expose `POST /api/telegram/webhook` with `webhookCallback(bot, "https")`, register via `setWebhook`. Keep push notifications on the same bot token

**News matching (India vs US):**
- US ticker → Finnhub `/company-news?symbol=AAPL` (structured, ticker-tagged)
- Indian ticker → Google News RSS query by company name (maintain a `symbol → company name` mapping table; Yahoo `quote` responses provide `longName` for free)

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| yahoo-finance2@4 | Node >= 22 | Hard requirement; set Vercel Node runtime to 22.x. Also runs on Deno/Bun/Cloudflare if jobs ever move |
| zod@4 | TypeScript >= 5.5 (strict) | Project is TS 5 strict — verify minor version; zod 4 needs a recent TS 5.x |
| grammy@1.44 | Next.js route handlers (Node runtime) | Use `webhookCallback(bot, "https")`; avoid Edge runtime (plugin ecosystem is Node-oriented) |
| @google/genai@2 | Node 20+ | Coexists with the deprecated SDK during migration; don't mix both in new code |
| exceljs@4.4 / papaparse@5.5 | Node serverless | Both pure-JS, no native deps — Vercel-safe |
| pg_cron + pg_net | Supabase hosted (all plans) | Enable both extensions in dashboard; jobs should stay under ~10 min and ≤8 concurrent |

## Sources

- npm registry (registry.npmjs.org) — exact latest versions verified 2026-07-13: yahoo-finance2 4.0.0, grammy 1.44.0, papaparse 5.5.4, zod 4.4.3, rss-parser 3.13.0, exceljs 4.4.0, @google/genai 2.11.0 — HIGH
- github.com/gadicc/yahoo-finance2 — v4 status, Node 22+ requirement, serverless guidance, unofficial-API caveats — HIGH
- vercel.com/docs/cron-jobs/usage-and-pricing — Hobby = daily-only cron, hour-window invocation precision, 100 jobs/project — HIGH
- supabase.com/docs/guides/cron, /guides/functions/schedule-functions, /guides/database/extensions/pg_cron — pg_cron on free tier, pg_net → HTTP invocation pattern, job concurrency guidance — HIGH
- supabase.com/pricing + multiple 2026 reviews — free tier: 500MB DB, 7-day inactivity pause, 500K edge invocations — HIGH
- github.com/google-gemini/deprecated-generative-ai-js + ai.google.dev/gemini-api/docs/migrate — old SDK EOL 2025-11-30, `@google/genai` replacement — HIGH
- ai.google.dev/gemini-api/docs/rate-limits — free-tier numbers no longer published; per-project limits shown in AI Studio; secondary sources conflict (20–1500 RPD claims) — LOW on exact RPD, flagged for validation at implementation
- alphavantage.co/support + macroption.com — 25 req/day / 5 per min free tier — HIGH
- finnhub.io/docs/api/company-news + 2026 API comparisons (qveris.ai, nb-data.com) — 60 calls/min free, international (incl. India) paid-only — MEDIUM
- grammy.dev/hosting/vercel — `webhookCallback(bot, "https")` adapter, Node vs Edge notes — HIGH
- git.sheetjs.com issues #3098/#2934 + snyk — npm `xlsx@0.18.5` unpatched vulnerabilities, CDN-only fixes — HIGH
- cloro.dev Google News RSS analysis + scraping guides — ~100-item cap, redirect URLs, no SLA, fine for low-volume polling — MEDIUM
- GitHub community discussions #156282 — Actions cron delays (10–30+ min) and 60-day auto-disable — MEDIUM
- Groww help center + Robinhood support (via search) — Groww exports XLSX/PDF; Robinhood exports CSV — MEDIUM (verify against a real export file during import-feature build)

---
*Stack research for: free-tier portfolio manager additions (prices, news, AI digest, Telegram, scheduling) on Next.js 16 + Supabase*
*Researched: 2026-07-13*
