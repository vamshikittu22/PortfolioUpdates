---
phase: 02-schema-persistence-hydration
plan: 02
subsystem: database
tags: [typescript, tdd, portfolio-math, weighted-average-cost, transactions-ledger]

# Dependency graph
requires: []
provides:
  - "src/lib/types.ts — shared domain types (Transaction, Instrument, Holding, WatchlistItem, NewsItem, AlertItem) replacing mock-portfolio.ts's type exports"
  - "deriveHoldings(transactions) -> Map<instrumentId, {quantity, avgCost}> pure function implementing weighted-average-cost aggregation for BUY/SELL/SPLIT/BONUS"
  - "npm run test:derive-holdings — zero-dependency runnable proof (no live Supabase needed)"
affects: [02-04 (data layer / Server Components that call deriveHoldings), 02-05, 02-06, 02-07, phase 4 (import) which will feed transactions into this function]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD via tsx + node:assert/strict test scripts (no jest/vitest) — same dependency-free convention as scripts/rls-isolation-test.ts"
    - "Pure-function domain math kept separate from data-fetching layer (src/lib/portfolio/) so it is unit-testable without a database"

key-files:
  created:
    - src/lib/types.ts
    - src/lib/portfolio/derive-holdings.ts
    - scripts/derive-holdings-test.ts
  modified:
    - package.json (added test:derive-holdings script)
    - package-lock.json (npm install synced missing tsx devDependency into node_modules)

key-decisions:
  - "Zero-quantity (fully sold-out) instruments are OMITTED from deriveHoldings' result map rather than included with quantity: 0 — a zero-quantity row is not a 'holding'."
  - "deriveHoldings groups transactions by instrumentId first, then sorts each instrument's sub-list by transactionDate (createdAt as tiebreaker) before reducing — proven by an out-of-order-array test case."
  - "mock-portfolio.ts is left in place (not deleted) — other files still import from it; migration off it is deferred to a later plan per the plan's explicit instruction."

patterns-established:
  - "Weighted-average-cost ledger reducer: BUY adds to cost basis and quantity; SELL removes quantity/cost basis proportionally at current avgCost (never perturbing avgCost itself); SPLIT/BONUS add quantity with cost basis unchanged (dilutes avgCost, no false loss)."

requirements-completed: [PORT-04, PORT-05]

# Metrics
duration: 15min
completed: 2026-07-14
---

# Phase 2 Plan 02: deriveHoldings — transaction ledger to holding aggregation Summary

**Pure weighted-average-cost `deriveHoldings()` function turning a BUY/SELL/SPLIT/BONUS transaction ledger into per-instrument holdings, proven by 7 passing assertions run via `npm run test:derive-holdings` with zero external dependencies (no live Supabase).**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-07-14
- **Tasks:** 1 TDD feature (RED -> GREEN; no REFACTOR needed)
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments
- `src/lib/types.ts` created with the shared domain types (`Transaction`, `Instrument`, `Holding`, `WatchlistItem`, `NewsItem`, `AlertItem`) that later Phase 2 plans (02-04+) will import, replacing `mock-portfolio.ts`'s type exports without deleting that file yet.
- `deriveHoldings()` implemented in `src/lib/portfolio/derive-holdings.ts`: groups transactions by `instrumentId`, sorts chronologically, reduces via a running weighted-average-cost method. Partial sells leave `avgCost` unchanged; SPLIT/BONUS dilute `avgCost` without producing a false loss; fully-sold-out instruments are omitted with no divide-by-zero.
- `scripts/derive-holdings-test.ts` — a real, runnable, dependency-free test (`node:assert/strict`, `tsx`) covering the 7 required cases (single BUY, partial SELL, SPLIT, BONUS, full exit, multi-instrument isolation, out-of-order array input). Confirmed genuinely RED against a stub before implementing, then GREEN after implementation — real, non-deferred verification (no database needed).

## Task Commits

TDD flow committed atomically as RED then GREEN (no REFACTOR commit needed — the implementation was already factored into named helpers `sortChronologically` / `reduceInstrumentTransactions` on the first GREEN pass):

1. **RED: add failing test for deriveHoldings** - `eecaab0` (test) — `src/lib/types.ts`, stub `derive-holdings.ts` (returns `new Map()` unconditionally), `scripts/derive-holdings-test.ts`, `package.json` script, `package-lock.json`. Verified failing (AssertionError on Case 1) before proceeding.
2. **GREEN: implement deriveHoldings** - `6e54545` (feat) — real weighted-average-cost implementation. All 7 assertions pass.

**Plan metadata:** (this commit) `docs(02-02): complete deriveHoldings plan`

## Files Created/Modified
- `src/lib/types.ts` - Shared domain types for Phase 2+ (Transaction, Instrument, Holding, WatchlistItem, NewsItem, AlertItem)
- `src/lib/portfolio/derive-holdings.ts` - Pure `deriveHoldings(transactions): Map<instrumentId, {quantity, avgCost}>` function
- `scripts/derive-holdings-test.ts` - 7-case assert-based test script, runnable via `npm run test:derive-holdings`
- `package.json` - Added `"test:derive-holdings": "tsx scripts/derive-holdings-test.ts"` script
- `package-lock.json` - `npm install` synced the already-declared `tsx` devDependency into `node_modules` (it was missing; see Deviations)

## Decisions Made
- Fully-sold-out instruments (derived quantity 0) are **omitted** from the result map rather than returned with `quantity: 0`, per the plan's recommended (and now implemented) choice.
- Sort by `transactionDate` first, `createdAt` as tiebreaker (present on the `Transaction` type only optionally via a loose cast, since the shared `Transaction` interface in `types.ts` does not include `createdAt` — real DB rows will carry it, and the sort function tolerates its absence).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing `tsx` dependency**
- **Found during:** first `npm run test:derive-holdings` run (RED verification step)
- **Issue:** `package.json` already declared `tsx@^4.20.6` as a devDependency (from the Phase 1 `test:rls` setup), but `node_modules/tsx` was not actually installed — `npm run test:derive-holdings` failed with `'tsx' is not recognized`. This blocked the mandatory non-deferred verification for this plan.
- **Fix:** Ran `npm install` to sync `node_modules` with `package.json`. This installed `tsx` and 2 other already-declared-but-missing packages; no new dependencies were added to `package.json` itself.
- **Files modified:** `package-lock.json` (lockfile refreshed to match already-declared deps)
- **Verification:** `npm run test:derive-holdings` then ran successfully (RED failure observed, then GREEN pass after implementation)
- **Committed in:** `eecaab0` (RED commit, since the fix was needed to even observe RED)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to run the plan's own mandated non-deferred verification. No scope creep — no new dependency was added, only an existing declared one was actually installed.

## Issues Encountered
None beyond the dependency-install deviation above.

## User Setup Required
None - no external service configuration required. This plan is fully self-contained (no database, no env vars).

## Next Phase Readiness
- `deriveHoldings` and `src/lib/types.ts` are ready for the Phase 2 data layer (plan 02-04) to import and call against real Supabase `transactions` rows.
- `npm run test:derive-holdings` is a permanent regression guard — any future change to the aggregation algorithm (e.g., adding a new transaction type) should keep this green.
- `mock-portfolio.ts` still exists and is still used by other files; its removal is intentionally deferred to a later plan.

---
*Phase: 02-schema-persistence-hydration*
*Completed: 2026-07-14*

## Self-Check: PASSED

- FOUND: src/lib/types.ts
- FOUND: src/lib/portfolio/derive-holdings.ts
- FOUND: scripts/derive-holdings-test.ts
- FOUND commit: eecaab0
- FOUND commit: 6e54545
