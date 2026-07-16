---
phase: 05-alerts-telegram
plan: 07
subsystem: api
tags: [supabase, server-actions, rls, price-alerts, next.js]

# Dependency graph
requires:
  - phase: 05-alerts-telegram (05-01)
    provides: price_alerts table (account-ownership RLS, UNIQUE(account_id,instrument_id,direction), cooldown_minutes floor 60/default 1440)
  - phase: 05-alerts-telegram (05-03)
    provides: src/lib/alerts/{types,evaluate}.ts alert domain vocabulary (not directly imported here, but the schema/column shapes this plan writes against are shared with it)
provides:
  - "createPriceAlert/updatePriceAlert/togglePriceAlert/deletePriceAlert Server Actions over price_alerts"
  - "searchInstrumentsAction re-exported from src/server-actions/alerts.ts for real-master ticker selection"
  - "getPriceAlerts(supabase, accountId) -> PriceAlertView[] read (alerts + instrument display + cached price)"
affects: [05-08 (/alerts UI rewrite consumes both of these directly), 05-09 (live CRUD + RLS verification)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "requireAuthedContext copied verbatim per Server Action file (cookie-bound client, auth.getUser throw-if-null, getAccountId) rather than shared across files"
    - "Postgres 23505 -> friendly duplicate-constraint error message, never a raw DB error surfaced to the UI"

key-files:
  created:
    - src/server-actions/alerts.ts
    - src/lib/alerts/read.ts
  modified: []

key-decisions:
  - "Re-exported searchInstrumentsAction via `export { searchInstrumentsAction } from './portfolio'` rather than duplicating the implementation, keeping one real-instrument-search code path for both holdings and alerts (PORT-06 extended to ALRT-02)."
  - "getPriceAlerts loads price_cache in a second query batched by instrument_id (not a join) — same two-query shape as get-portfolio-pnl.ts's readPriceCache, avoiding a fragile nested-select across a table with no FK to price_alerts."

patterns-established:
  - "Friendly 23505 mapping for user-facing unique-constraint violations belongs at the Server Action boundary, keyed on error.code, matching portfolio.ts:288's addToWatchlist precedent."

requirements-completed: [ALRT-02]

# Metrics
duration: 8min
completed: 2026-07-16
---

# Phase 5 Plan 07: Price-alert CRUD Server Actions + getPriceAlerts read Summary

**Cookie-bound, RLS-authorized create/update/toggle/delete over `price_alerts` plus a joined alerts+instrument+cached-price reader, both statically verified (tsc clean, grep-gated) with live CRUD deferred to 05-09.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-16T22:27:00Z (approx)
- **Completed:** 2026-07-16T22:35:34Z
- **Tasks:** 2
- **Files modified:** 2 (both new)

## Accomplishments

- `src/server-actions/alerts.ts` — `createPriceAlert`/`updatePriceAlert`/`togglePriceAlert`/`deletePriceAlert`, all cookie-bound and RLS-authorized (never the admin client), with `23505` mapped to a friendly duplicate-direction error and every mutation revalidating `/alerts`.
- Real-master ticker selection reused via `export { searchInstrumentsAction } from './portfolio'` — no second implementation of instrument search exists.
- `src/lib/alerts/read.ts` — `getPriceAlerts` joins `price_alerts` to instrument display columns in one query, then batch-loads `price_cache` by `instrument_id`, returning `PriceAlertView[]` with an honestly-null `currentPrice` when never fetched.

## Task Commits

Each task was committed atomically:

1. **Task 1: Price-alert CRUD Server Actions** - `bf0e11b` (feat)
2. **Task 2: getPriceAlerts read (alerts + instrument display + cached price)** - `3318b43` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/server-actions/alerts.ts` - createPriceAlert/updatePriceAlert/togglePriceAlert/deletePriceAlert + re-exported searchInstrumentsAction
- `src/lib/alerts/read.ts` - getPriceAlerts(supabase, accountId) -> PriceAlertView[]

## Decisions Made

- See `key-decisions` in frontmatter. Both decisions matched precedent already established in `portfolio.ts`/`get-portfolio-pnl.ts` — no new pattern needed invention, only extension to the `price_alerts` table.

## Deviations from Plan

None - plan executed exactly as written. Both tasks matched their spec's field names, validation rules (`threshold > 0`, `cooldownMinutes >= 60`), and grep-verifiable shapes on the first pass.

## Issues Encountered

None. One other executor (05-04) ran concurrently on disjoint files (`src/lib/telegram/api.ts`, `src/lib/notifications/*`, `src/app/api/notifications/dispatch/route.ts`); both this plan's commits were confirmed atomic via `git show HEAD --stat` immediately after committing — no cross-contamination occurred (unlike the git-index races seen in 05-01/05-02/05-03).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 05-08 (`/alerts` UI rewrite) can import `createPriceAlert`/`updatePriceAlert`/`togglePriceAlert`/`deletePriceAlert`/`searchInstrumentsAction` from `src/server-actions/alerts.ts` and `getPriceAlerts` from `src/lib/alerts/read.ts` directly — both are code-complete and typecheck-clean against the authored 05-01 schema.
- Live CRUD (actually creating/editing/deleting an alert against the DB, confirming RLS admits the owner and rejects a second user) remains explicitly DEFERRED to 05-09 — `supabase/migrations/20260716221450_alerts_telegram.sql` is still not pushed to the live hosted DB (carried forward from 05-01/05-03's DEFERRED state, unchanged by this plan).
- No blockers for 05-08.

---
*Phase: 05-alerts-telegram*
*Completed: 2026-07-16*

## Self-Check: PASSED

- FOUND: src/server-actions/alerts.ts
- FOUND: src/lib/alerts/read.ts
- FOUND: .planning/phases/05-alerts-telegram/05-07-SUMMARY.md
- FOUND: bf0e11b (Task 1 commit)
- FOUND: 3318b43 (Task 2 commit)
