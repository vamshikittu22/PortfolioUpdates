---
phase: 03-price-pipeline-pnl-scheduling
plan: 02
subsystem: prices
tags: [pure-functions, tdd, pnl, fx-conversion, yahoo-finance, corporate-action, node-assert]

# Dependency graph
requires:
  - phase: 02-schema-persistence-hydration
    provides: "deriveHoldings (src/lib/portfolio/derive-holdings.ts) and shared domain types (src/lib/types.ts) — Holding/Currency shapes this plan's P&L functions consume"
provides:
  - "parseYahooChartResponse — safe Yahoo chart-response parser, returns null on any malformed input, never fabricates a price"
  - "detectCorporateAction — >40% overnight-move heuristic (strict boundary)"
  - "shouldSkipRefresh — 60s dedup guard against thundering-herd refreshes"
  - "isAuthorizedRefreshRequest — secret-guarded auth predicate for the refresh route, unset-secret always denies"
  - "convertToBaseCurrency — sign-preserving, identity-safe FX conversion"
  - "calculateHoldingPnL — honest 'pending' vs 'priced' per-holding P&L"
  - "calculatePortfolioTotals — cross-currency aggregation with visible native subtotals"
affects: [03-03-network-wrappers, 03-04-route-orchestration, 03-05-pnl-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-function business logic layer, proven via node:assert/strict scripts (no jest/vitest), mirrors scripts/derive-holdings-test.ts / test:rls convention"
    - "Never-fabricate-a-value discipline: parse failures return null, unpriced holdings return status:'pending' with null numeric fields, not 0"

key-files:
  created:
    - src/lib/prices/ingest.ts
    - src/lib/prices/pnl-calculator.ts
    - scripts/price-pnl-test.ts
  modified:
    - package.json

key-decisions:
  - "No new devDependency for testing — kept node:assert/strict + tsx convention consistent with test:rls and test:derive-holdings instead of introducing jest/vitest."
  - "calculatePortfolioTotals sums costBasis (converted to base currency) for ALL holdings including pending ones, but only sums currentValue/unrealizedPnL/dayChange for priced holdings — matches plan's documented aggregation contract exactly."

patterns-established:
  - "Price/P&L pure logic isolated in src/lib/prices/*, with zero I/O — downstream network (03-03), route (03-04), and UI (03-05) plans import from here instead of re-deriving this math."

requirements-completed: [PRICE-01, PRICE-05, PRICE-06, PRICE-07]

# Metrics
duration: 10min
completed: 2026-07-14
---

# Phase 3 Plan 2: Price ingestion + P&L pure logic layer Summary

**Six pure functions (Yahoo chart parsing, corporate-action detection, refresh dedup/auth, FX conversion, holding/portfolio P&L) implemented TDD and proven by a real, currently-passing `npm run test:price-pnl` — no live network or database required.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-14T17:00:00-05:00 (approx)
- **Completed:** 2026-07-14T17:06:00-05:00
- **Tasks:** 2 (RED, GREEN — no REFACTOR needed)
- **Files modified:** 4 (2 created source files, 1 created test script, 1 modified package.json)

## Accomplishments

- `parseYahooChartResponse` never throws and never fabricates a price on malformed/empty Yahoo chart responses — returns `null` instead, verified against a missing-`chart.result` case and an all-`null`-close-array case.
- `detectCorporateAction` implements the >40% overnight-move heuristic with the exact documented boundary (`40` itself is `false`).
- `shouldSkipRefresh` and `isAuthorizedRefreshRequest` give 03-04's route handler pure, unit-tested guards against thundering-herd refresh and an unconfigured/open secret.
- `calculateHoldingPnL` returns an honest `status:'pending'` shape (all numeric fields `null`, never `0`) when no price is cached, and correct day-change/total-change math once a price exists.
- `calculatePortfolioTotals` aggregates mixed-currency holdings into a base-currency total while keeping `nativeSubtotals` visible per currency — the FX effect is provably recoverable, not hidden in one opaque number.
- All 12 case groups from the plan pass via `npm run test:price-pnl`; `npx tsc --noEmit` is clean; re-running the script twice produces identical output (pure, no hidden state).

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — failing test + stubs** - `efaee05` (test) — stubs throw `'not implemented'`; `npm run test:price-pnl` confirmed to fail before implementation existed.
2. **Task 2: GREEN — implement all six functions** - `23dfedb` (feat) — `npm run test:price-pnl` confirmed to pass; `npx tsc --noEmit` confirmed clean.

REFACTOR step was not needed — the six public signatures were stable and `calculatePortfolioTotals` already reuses `convertToBaseCurrency` internally; no repeated logic to extract.

**Plan metadata:** (this commit, below)

## Files Created/Modified

- `src/lib/prices/ingest.ts` — `parseYahooChartResponse`, `detectCorporateAction`, `shouldSkipRefresh`, `isAuthorizedRefreshRequest`
- `src/lib/prices/pnl-calculator.ts` — `convertToBaseCurrency`, `calculateHoldingPnL`, `calculatePortfolioTotals`, plus `HoldingPnL`/`PortfolioTotal` types
- `scripts/price-pnl-test.ts` — 12 case-group assertion script mirroring `scripts/derive-holdings-test.ts` conventions
- `package.json` — added `"test:price-pnl": "tsx scripts/price-pnl-test.ts"`

## Decisions Made

- Kept the dependency-free `node:assert/strict` + `tsx` test convention already established by `test:rls` / `test:derive-holdings` rather than introducing a test framework — plan explicitly required this.
- `calculatePortfolioTotals` sums cost basis (currency-converted) across every holding regardless of pending/priced status, but only sums current value / unrealized P&L / day change for `priced` holdings — this exact split is what the plan's "pending holdings contribute their cost basis but null current value" line specifies, and Case 12 (all-pending) asserts the converted cost-basis total is non-zero while current value/P&L stay at 0/null with no `NaN`.

## Deviations from Plan

None - plan executed exactly as written. All six function contracts, the 12 case groups, the `test:price-pnl` npm script, and the "never fabricate a value" discipline match the plan's `<behavior>` section verbatim.

## Issues Encountered

None. RED phase genuinely failed (stub `throw new Error('not implemented')` surfaced in the first assertion, `parseYahooChartResponse`'s Case 1), GREEN phase genuinely passed all 12 case groups on the first implementation attempt, and `npx tsc --noEmit` was clean with no follow-up fixes required.

**Concurrent execution note:** Plan 03-01 (pg_cron migration) was executing in the same working tree concurrently, touching only `supabase/migrations/*`. Staged and committed only this plan's files (`git add` scoped to `package.json`, `scripts/price-pnl-test.ts`, `src/lib/prices/*`) at every commit, verified via `git status` beforehand, to avoid sweeping in 03-01's untracked migration file.

## User Setup Required

None - no external service configuration required. This plan has zero network/database dependency by design.

## Next Phase Readiness

- 03-03 (network wrappers) can call `parseYahooChartResponse` directly on real fetch responses without re-deriving parsing logic.
- 03-04 (route/orchestration) can call `shouldSkipRefresh`, `isAuthorizedRefreshRequest`, and `detectCorporateAction` as pure guards before touching Supabase.
- 03-05 (P&L UI) can call `calculateHoldingPnL` / `calculatePortfolioTotals` directly against holdings from `deriveHoldings` (Phase 2) plus cached prices/FX rates, with an honest pending state ready to render.
- No blockers or concerns for downstream plans.

---
*Phase: 03-price-pipeline-pnl-scheduling*
*Completed: 2026-07-14*

## Self-Check: PASSED

- FOUND: src/lib/prices/ingest.ts
- FOUND: src/lib/prices/pnl-calculator.ts
- FOUND: scripts/price-pnl-test.ts
- FOUND: efaee05 (test commit)
- FOUND: 23dfedb (feat commit)
