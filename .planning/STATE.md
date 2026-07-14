# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-13)

**Core value:** The user opens the app (or gets a Telegram message) and immediately knows what's happening with *their* stocks — real holdings, real prices, real news — without digging through noise.
**Current focus:** Phase 2 — Schema, Persistence & Hydration

## Current Position

Phase: 2 of 7 (Schema, Persistence & Hydration)
Plan: 4 of 7 in current phase complete — 02-01, 02-02, 02-03, 02-04 CODE-COMPLETE (SUMMARYs written); wave 1 (independent plans) + wave 2 (02-04, depends on 02-01/02-02) now done
Status: CODE-COMPLETE, VERIFICATION DEFERRED — CODE-ONLY mode (no Docker, no live Supabase), carried forward from Phase 1. 02-02's own verification (npm run test:derive-holdings) is NOT deferred — it is a pure function with zero DB dependency and was actually run: PASS. 02-04's static verification (tsc --noEmit + grep checks: deriveHoldings reuse, no admin client in mutations, revalidatePath >= 8) is NOT deferred and was actually run: PASS. Plans 02-01/02-03/02-04's live-DB behavior remain runtime-unverified pending a live DB.
Last activity: 2026-07-14 — 02-04 (PORT-01/02/03/05/06: data access layer — src/lib/supabase/portfolio.ts reads reusing deriveHoldings, src/server-actions/portfolio.ts with 8 Server Action mutations, RLS-only authorization, no admin client) built, tsc clean, grep checks passing, committed.

Progress: [████░░░] 57% (4/7 plans) code authored / partial runtime-verified (02-02's pure-logic test + 02-04's static checks genuinely passing; DB-dependent behavior still deferred)

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

Resume: re-run `/gsd:execute-phase 2` (all SUMMARYs present through 02-01/02-03 → continues at 02-02/02-04) once a DB exists, OR run `/gsd:verify-work 1` / `/gsd:verify-work 2` after manual testing.

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
Stopped at: Completed 02-04-PLAN.md (data access layer: src/lib/supabase/portfolio.ts reads + src/server-actions/portfolio.ts 8 mutations, tsc clean, grep checks passing). Wave 2 (02-04) now code-complete. Ready for wave 3 (02-05 through 02-07, page hydration reading through this layer).
Resume file: None
