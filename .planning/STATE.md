# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-13)

**Core value:** The user opens the app (or gets a Telegram message) and immediately knows what's happening with *their* stocks — real holdings, real prices, real news — without digging through noise.
**Current focus:** Phase 3 — Price Pipeline, P&L & Scheduling

## Current Position

Phase: 3 of 7 (Price Pipeline, P&L & Scheduling)
Plan: 4 of 6 in current phase complete (03-01, 03-02, 03-03, 03-04 — all SUMMARY-complete; 03-02 executed concurrently in an earlier session by a separate executor on non-overlapping files); Phase 2 (02-01 through 02-07) is fully CODE-COMPLETE from prior sessions.
Status: 03-04 CODE-COMPLETE and STATIC-VERIFIED. `refreshAllPrices(admin)` orchestration wired to a secret-guarded `POST /api/prices/refresh` route (for pg_cron) and an auth-gated `refreshPricesNow` Server Action (for the UI) — both funnel into the same write path, both use only the service-role admin client, and every failure path updates `fetch_error` only (never clobbers a good price/rate, never fabricates a new one). `npx tsc --noEmit` clean, `npm run test:price-pnl` still passing unchanged. `PRICE_REFRESH_SECRET` generated and added to `.env.local` (gitignored). No live Supabase call was made — 03-01's two migrations (fx_cache, price_cache re-key, pg_cron scheduling) remain authored + statically reviewed only, still pending explicit user consent to push to the hosted Supabase (project `ozkorwkhtamyaavuphhm`). `refreshPricesNow` is NOT yet wired to any UI button (that's 03-05's job) — PRICE-03 intentionally left Pending in REQUIREMENTS.md rather than over-claimed. The `exchangerate.host` `missing_access_key` issue from 03-03 remains unresolved and unaffected by this plan (FX failure is handled honestly but doesn't block price refresh).
Last activity: 2026-07-14 — 03-04 (refresh-service.ts orchestration, secret-guarded route, refreshPricesNow Server Action) completed, committed as three atomic commits.

Progress: [████...] ~67% (4/6 plans in Phase 3 code-complete/static-verified: 03-01 schema, 03-02 price/P&L pure logic, 03-03 network wrappers, 03-04 orchestration/route/action — see each plan's own SUMMARY for detail)

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
| Phase 03 P03 | 15min | 2 tasks | 2 files |
| Phase 03 P04 | 13min | 3 tasks | 4 files |

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
- [Phase 03]: fetchPrices/fetchFXRate (03-03) are pure network wrappers keyed only by symbol/currency-pair strings — no Supabase/instrument_id awareness; caller (03-04) owns symbol->instrument_id mapping and preserving last-known-good fx_cache/price_cache rows on failure
- [Phase 03]: Live finding (03-03): exchangerate.host's free /convert endpoint now returns missing_access_key in production — the "free, no key" FX source assumed in 03-RESEARCH.md is stale. fetchFXRate degrades correctly (honest error, no fabricated rate) but 03-04/later must register a key or swap FX providers before fx_cache can populate for real.
- [Phase 03]: refreshAllPrices (03-04) is the single write path for price_cache/fx_cache, accepts an already-constructed admin client rather than building one itself; cron route (secret-guarded, checked before any Supabase call) and refreshPricesNow Server Action (auth-gated via getUser()) both call it identically. PRICE-03 left Pending — backend done but not yet wired to a UI button (03-05) or live-verified (03-06).

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- REQUIREMENTS.md header stated "36 total" but the enumerated v1 IDs total **39** (AUTH 6, PORT 7, PRICE 7, IMPT 5, NEWS 5, ALRT 5, DGST 2, WIRE 2). Traceability count corrected to 39/39; header wording left for the user to confirm.
- [Phase 03, plan 03] exchangerate.host's free FX endpoint now requires a paid access key (`missing_access_key` error confirmed live) — 03-RESEARCH.md's "free, no key" assumption is stale. Must be resolved (API key or provider swap, e.g. Frankfurter/open.er-api.com) before 03-06's live FX refresh can populate `fx_cache` end-to-end. Does not block 03-03/03-04 (honest-failure contract fully met in both — refreshAllPrices records fetch_error and preserves the last-known-good rate, never blocks price refresh on FX failure).
- [Phase 03, plan 04] `refreshPricesNow` Server Action exists and is statically verified but has no UI caller yet (grep confirms zero references outside `src/server-actions/prices.ts`) — wiring a "refresh now" button is 03-05's scope. PRICE-03 left Pending in REQUIREMENTS.md accordingly.
- Research flags for phase-time verification: Vercel Hobby function-duration + pg_cron→pg_net ergonomics (Phase 3), Groww XLSX / Robinhood CSV real layouts (Phase 4), exact Gemini free-tier RPD + Finnhub US-only (Phase 6).
- [RESOLVED via decision] Plan 01-01 Task 3 was blocked by missing Docker. Superseded by the CODE-ONLY / DEFER-VERIFICATION decision — no Docker/live DB used. DEFERRED work carried forward: `supabase start`, applying migrations against a live DB, verifying RLS enforcement, and capturing real anon/service-role keys. Must be done before Phase 1 verification can pass.

## Session Continuity

Last session: 2026-07-14
Stopped at: Completed 03-04 (refreshAllPrices orchestration + secret-guarded POST /api/prices/refresh route + refreshPricesNow Server Action). `npx tsc --noEmit` clean, `npm run test:price-pnl` still passing unchanged (12/12). Both entry points write price_cache/fx_cache exclusively via the admin client with the never-clobber/never-fabricate discipline (update fetch_error only on failure, insert a null-value row only for a genuinely never-priced instrument/pair). PRICE_REFRESH_SECRET generated and added to .env.local (gitignored). No live Supabase call was made — purely static verification, consistent with this project's CODE-ONLY / DEFER-VERIFICATION mode. refreshPricesNow is not yet wired to a UI button (03-05's job); PRICE-03 intentionally left Pending in REQUIREMENTS.md. 03-03 (fetchPrices + fetchFXRate network wrappers): `npx tsc --noEmit` clean, live smoke test confirmed fetchPrices against real Yahoo Finance data; surfaced that exchangerate.host's free FX endpoint now requires a paid key (fetchFXRate degrades correctly, no fabricated rate — see Blockers/Concerns; refreshAllPrices in 03-04 confirmed to degrade around this honestly too). 03-01 (fx_cache table + price_cache re-keyed to instrument_id; pg_cron+pg_net 3-hourly refresh scheduling migration): migrations authored and statically verified only, live push to the now-existing hosted Supabase remains deferred pending orchestrator/user consent. 03-02 (price ingestion + P&L pure logic layer): fully TDD'd RED->GREEN, genuinely PASSING.
Resume file: None
