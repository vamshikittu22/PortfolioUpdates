# PortfolioUpdates (FolioIntel)

## What This Is

A personal portfolio manager for tracking the owner's own stocks across Indian (NSE/BSE, via Groww) and US (via Robinhood) markets, with timely news updates about held and watched companies as its heartbeat. Built as a Next.js dashboard with AI-assisted research and news summarization, designed for one user today but architected so it could go public later.

## Core Value

The user opens the app (or gets a Telegram message) and immediately knows what's happening with *their* stocks — real holdings, real prices, real news — without digging through noise.

## Requirements

### Validated

<!-- Inferred from existing codebase (see .planning/codebase/). Working today, though some run on mock/fallback data. -->

- ✓ Dashboard shell: KPI cards, holdings table, watchlist, allocation chart, alerts table, news feed UI — existing
- ✓ Multi-account portfolio structure with account switcher (Zustand store) — existing
- ✓ AI research module: ticker search → full equity research report (fundamentals, valuation, scenarios, red flags, scoring) via Gemini + Yahoo Finance, with file cache — existing
- ✓ YouTube analysis: track finance channels, extract transcripts, AI ticker/sentiment extraction — existing
- ✓ Dark/light theming, responsive dashboard layout (Tailwind 4 + Radix UI) — existing
- ✓ Multi-LLM provider abstraction (Gemini primary; OpenAI/Claude/OpenRouter/Nvidia/HF fallbacks) — existing

### Active

<!-- Current scope. Building toward these. -->

- [ ] Real holdings persistence: manual add/edit/delete of holdings and watchlist entries, stored in Supabase (survives refresh)
- [ ] CSV import of holdings from Groww and Robinhood statement exports
- [ ] Live prices from free sources (Yahoo Finance et al.) for both NSE/BSE and US tickers: auto-refresh every 2–4 hours + on-demand "refresh now" to current price
- [ ] Real authentication via Supabase Auth (replace demo cookie login), with per-user data isolation (RLS) from the start
- [ ] Real news pipeline: fetch news from free sources matched to held/watched tickers (India + US)
- [ ] AI-summarized news: filter and summarize so only portfolio-relevant items surface, with "why it matters"
- [ ] Daily digest: once-a-day portfolio + news summary
- [ ] Alerts/notifications via Telegram bot (price moves, significant news)
- [ ] Portfolio P&L computed from real buy price vs current price (per holding and total)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Broker API live sync (Kite Connect, Schwab API, etc.) — no free/public API for Groww or Robinhood; CSV import covers the need. Revisit if broker situation changes.
- WhatsApp notifications — requires Meta Business API approval and costs; Telegram first, WhatsApp maybe later
- Paid market data feeds / real-time tick data — free-resources-only constraint; 2–4h refresh + on-demand is acceptable
- Trading/order execution — this is a tracker and intelligence tool, not a trading platform
- Mobile native app — web-first; responsive layout is enough for now

## Context

- Substantial existing codebase: Next.js 16.2.9 (App Router), React 19, TypeScript 5, Tailwind 4, Radix UI, Zustand 5, Recharts, Framer Motion. See `.planning/codebase/` for full map.
- **The gap:** the app looks finished but runs on mock data. Holdings/watchlist/news/alerts are hardcoded in the Zustand store (nothing persists); login is demo credentials with a plain unsigned cookie; there is no news API integration at all; Yahoo Finance fetches fail silently to mock values.
- Supabase (`@supabase/ssr`, `@supabase/supabase-js`) is installed and scaffolded (clients, middleware, auth callback) but effectively bypassed — the persistence and auth foundation exists, it just needs to be actually used.
- Cached research for HDFCBANK confirms Indian-market usage; user also holds US stocks via Robinhood.
- Known security issues to fix along the way (from `.planning/codebase/CONCERNS.md`): hardcoded demo credentials, forgeable session cookie, unauthenticated `/api/settings/keys` endpoint that writes to `.env.local`, no input validation, zero tests.
- Oversized API routes (research analyze route is 683 lines) — refactor opportunistically when touching them, not as a dedicated phase.

## Constraints

- **Budget**: Free-tier resources only — free market data (Yahoo Finance etc.), free news sources, Supabase free tier, Gemini free tier, Telegram bot API (free)
- **Tech stack**: Keep existing Next.js 16 / React 19 / TypeScript / Supabase / Zustand stack — substantial working code, no rewrite
- **Data freshness**: Prices auto-refresh every 2–4 hours; on-demand refresh must fetch current live price
- **Markets**: Must support both NSE/BSE and US tickers (symbol formats, currencies INR/USD, market hours differ)
- **Architecture**: Real auth + per-user data isolation (Supabase RLS) from the start — "could go public later"

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Real holdings + live prices before news pipeline | User's chosen "first win" — accurate portfolio makes it a daily habit; news matching needs real tickers anyway | — Pending |
| CSV import over broker API sync | Groww and Robinhood have no free public APIs; CSV export is universal and free | — Pending |
| Telegram over WhatsApp for notifications | Free bot API, no approval process; WhatsApp needs Meta Business API | — Pending |
| Supabase for persistence + auth | Already installed and scaffolded in codebase; free tier; RLS gives per-user isolation for later multi-user | — Pending |
| Supabase as single source of truth, run locally in dev | Local Postgres/Supabase CLI gives fast offline dev; identical schema/RLS deploys to prod. Avoids building a custom local↔cloud sync engine, which would delay core features and add conflict-resolution complexity for no single-user payoff. Always-on host is required anyway for background news refresh + Telegram digest/alerts. | — Pending |
| Free data sources only (Yahoo Finance etc.) | Personal project, no budget; 2–4h freshness acceptable with on-demand live refresh | — Pending |
| Keep research + YouTube modules | Most built-out features; complement the news core value | — Pending |

---
*Last updated: 2026-07-13 after initialization*
