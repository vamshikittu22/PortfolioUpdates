# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-13)

**Core value:** The user opens the app (or gets a Telegram message) and immediately knows what's happening with *their* stocks — real holdings, real prices, real news — without digging through noise.
**Current focus:** Phase 3 — Price Pipeline, P&L & Scheduling

## Current Position

Phase: 3 of 7 (Price Pipeline, P&L & Scheduling)
Plan: 2 of 6 in current phase complete (03-01, 03-02 — both SUMMARY-complete; 03-02 executed concurrently in the same session by a separate executor on non-overlapping files); Phase 2 (02-01 through 02-07) is fully CODE-COMPLETE from prior sessions.
Status: 03-01 CODE-COMPLETE, STATIC-VERIFIED, LIVE-APPLY DEFERRED. A live hosted Supabase now exists (project `ozkorwkhtamyaavuphhm`, credentials in `.env.local`) with all 5 prior migrations (Phase 1 + Phase 2) already applied and `npm run test:rls` / `npm run test:derive-holdings` passing against it — this supersedes the "no Docker / no live Supabase" note carried forward from Phase 1/2 for those 5 migrations. However, 03-01's two NEW migrations (`price_fx_schema.sql`, `price_refresh_cron.sql`) were only authored + statically reviewed this run per explicit plan instructions (no `supabase db push`/`db reset` executed) — live push is the orchestrator's job, pending explicit user consent.
Last activity: 2026-07-14 — 03-01 (fx_cache table + price_cache re-keyed to instrument_id with nullable price/source, fetch_error, corporate_action_flag; pg_cron/pg_net migration scheduling 3-hourly refresh with URL/secret read from current_setting, no hardcoded values) authored, all grep/git-diff-stat verification checks passed, committed as two atomic commits.

Progress: [██.....] ~33% (2/6 plans in Phase 3 code-complete/static-verified: 03-01 schema, 03-02 price/P&L pure logic — see each plan's own SUMMARY for detail)

### DEFERRED verification debt (must clear before Phase 1 and 2 truly pass)
Requires a live Supabase (Docker `npx supabase start` OR a hosted project), then:
1. Apply all 5 migrations (2 Phase 1 + 3 Phase 2) against the DB, in order.
2. Write real anon + service-role keys into `.env.local` (currently PLACEHOLDER_*).
3. `npm run test:rls` → must print PASS (two-user isolation + price_cache/news_items/transactions/watchlist_items write-hole proof).
4. `npx supabase db lint --level warning` → clean on shared tables (Security Advisor).
5. Browser E2E (plan 01-04 Task 2): sign up → dashboard, logout → /login, login → real email, refresh persists, forged sb-cookie bounces to /login, `curl /api/settings/keys` unauth → 401.
6. Confirm the 16 seed instrument rows insert cleanly and `(isin, exchange)` UNIQUE constraint holds (02-01).
7. Confirm YouTube channel add/toggle/remove persist against real `yt_channels` rows, survive refresh, and are RLS-isolated per user (02-03).
8. Confirm `getHoldings`/`getWatchlist`/`searchInstruments` (02-04) return correctly-shaped joined rows against a real DB, and that all 8 Server Action mutations (02-04) succeed, revalidate, and are RLS-rejected for cross-account instrumentId references.
9. Confirm the full Phase 2 persistence + hydration slice against a live DB (02-06 Task 4, the phase's closing checkpoint): add a holding, refresh survives; partial-sell keeps avg cost unchanged; 2-for-1 split drops avg cost to ~half with NO false-loss indicator; watchlist add/remove reflects live; a second user in incognito sees none of it (RLS).
10. Confirm clicking a real holding/watchlist row's Research affordance opens `/research?ticker=X` pre-loaded for that ticker in a running browser (02-07) — code/URL-param wiring is statically verified; only the click-through against real seeded rows is deferred.

Resume: all 7 plans in Phase 2 (02-01 through 02-07) are now SUMMARY-complete. A live Supabase now exists and the DEFERRED items above involving the 5 Phase 1/2 migrations (test:rls, test:derive-holdings) are confirmed passing against it. Phase 3 is now underway: plan 03-01 (schema) is code-complete; plan 03-02 also has a SUMMARY from a concurrent run. Next: continue Phase 3 plans 03-03 onward, then push the accumulated new migrations (03-01's two files plus any from later plans) to the live DB with explicit user consent before Phase 3's live-verification checkpoint (03-06).

## Performance Metrics

**Velocity:**
- Total plans completed: 1
- Average duration: 17 min
- Total execution time: ~0.3 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 1 | 4 | 17 min |

**Recent Trend:**
- Last 5 plans: 01-01 (17 min, 3 tasks, 6 files)
- Trend: —

*Updated after each plan completion*

**Plan detail:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| 01-01 | 17 min | 3 | 6 |
| Phase 02 P01 | 12min | 3 tasks | 3 files |
| Phase 02 P03 | 12min | 2 tasks | 2 files |
| Phase 02 P02 | 15min | 1 tasks | 5 files |
| Phase 02 P04 | 15min | 2 tasks | 2 files |
| Phase 02 P06 | 25min | 3 tasks | 6 files |
| Phase 02 P07 | 7min | 2 tasks | 3 files |
| Phase 03 P01 | 2min | 3 tasks | 2 files |
| Phase 03 P02 | 10min | 2 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 7-phase strict-downward dependency order (auth → schema → prices → import/alerts → news → digest), converged on by all four research files.
- [Roadmap]: Two hardest-to-reverse choices front-loaded — instrument identity is ISIN+exchange (Phase 2) and holdings modeled as a transactions ledger (Phase 2), before import/prices build on them.
- [Roadmap]: ALRT-04 (significant-news Telegram alert) mapped to Phase 6, not Phase 5 — it needs news matching and reuses the Phase 5 outbox.
- [Roadmap]: AI (Gemini) is always a second pass — price/news pipelines must work on raw data before summarization is layered on.
- [Phase 01]: Phase 1 runs in CODE-ONLY / DEFER-VERIFICATION mode: no Docker and no live Supabase, so stack start, live migration apply, and real-key capture are deferred; .env.local holds labeled placeholders.
- [Phase 02]: Continued CODE-ONLY / DEFER-VERIFICATION mode: instruments/transactions/watchlist migrations authored and statically verified only, live apply deferred (no Docker/live Supabase).
- [Phase 02]: Data access layer (02-04): reads via injected SupabaseClient reusing deriveHoldings; 8 Server Actions mutate only via cookie-bound client (never admin), revalidate / /holdings /news
- [Phase 02]: [Phase 02, plan 07]: Research deep-link entry point (WIRE-01) — ticker param read once on mount; useSearchParams() required a Suspense boundary in research/page.tsx, confirmed by running next build.
- [Phase 02]: [Phase 02, plan 06]: Mock portfolio store (usePortfolioStore.ts, mock-portfolio.ts) deleted outright, closing out PORT-07 — layout.tsx uses a static single-account label instead of a fetched name (smaller diff, matches the single-account-per-user scope decision); News/Alerts pages pass honest empty arrays for not-yet-built Phase 5/6 data instead of any mock fallback.
- [Phase 03]: price_cache re-keyed from symbol to instrument_id; price/source made nullable to represent honest never-fetched state
- [Phase 03]: Price ingestion + P&L pure logic isolated in src/lib/prices/* with zero I/O; never-fabricate-a-value discipline (parse failures -> null, unpriced holdings -> status:'pending' with null fields, not 0); proven by npm run test:price-pnl (node:assert/strict, no jest/vitest)

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- REQUIREMENTS.md header stated "36 total" but the enumerated v1 IDs total **39** (AUTH 6, PORT 7, PRICE 7, IMPT 5, NEWS 5, ALRT 5, DGST 2, WIRE 2). Traceability count corrected to 39/39; header wording left for the user to confirm.
- Research flags for phase-time verification: Vercel Hobby function-duration + pg_cron→pg_net ergonomics (Phase 3), Groww XLSX / Robinhood CSV real layouts (Phase 4), exact Gemini free-tier RPD + Finnhub US-only (Phase 6).
- [RESOLVED via decision] Plan 01-01 Task 3 was blocked by missing Docker. Superseded by the CODE-ONLY / DEFER-VERIFICATION decision — no Docker/live DB used. DEFERRED work carried forward: `supabase start`, applying migrations against a live DB, verifying RLS enforcement, and capturing real anon/service-role keys. Must be done before Phase 1 verification can pass.

## Session Continuity

Last session: 2026-07-14
Stopped at: Completed both wave-1 Phase 3 plans. 03-01 (fx_cache table + price_cache re-keyed to instrument_id with nullable price/source/fetch_error/corporate_action_flag; pg_cron+pg_net 3-hourly refresh scheduling migration, secret/URL read from current_setting — no hardcoded values): migrations authored and statically verified only, live push to the now-existing hosted Supabase remains deferred pending orchestrator/user consent. 03-02 (price ingestion + P&L pure logic layer — parseYahooChartResponse, detectCorporateAction, shouldSkipRefresh, isAuthorizedRefreshRequest, convertToBaseCurrency, calculateHoldingPnL, calculatePortfolioTotals): fully TDD'd RED->GREEN, `npm run test:price-pnl` genuinely PASSING (not deferred — pure logic, zero DB/network dependency), `npx tsc --noEmit` clean.
Resume file: None
