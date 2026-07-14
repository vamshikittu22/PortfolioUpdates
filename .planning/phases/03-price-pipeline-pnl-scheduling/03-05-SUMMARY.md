---
phase: 03-price-pipeline-pnl-scheduling
plan: 05
subsystem: ui
tags: [nextjs, server-components, react, pnl, staleness, corporate-action, fx, server-actions]

# Dependency graph
requires:
  - phase: 03-price-pipeline-pnl-scheduling
    provides: "calculateHoldingPnL/calculatePortfolioTotals/convertToBaseCurrency (03-02), refreshPricesNow Server Action (03-04) — this plan wires them into the UI, reimplements neither"
  - phase: 02-schema-persistence-hydration
    provides: "getHoldings/getWatchlist/getAccountId query layer (02-04) and the Server-Component page structure (02-05) this plan extends, not re-architects"
provides:
  - "getPortfolioPnL(supabase, accountId, baseCurrency) — single server-side glue point combining real holdings + price_cache + fx_cache into UI-ready P&L + staleness + corporate-action data"
  - "StalenessBadge — shared as-of/stale/error/pending badge, single implementation for all staleness display"
  - "RefreshPricesButton — client island wired to refreshPricesNow, embedded in holdings/page.tsx header"
  - "Dashboard + Holdings pages rendering real price/day-change/total-change/FX-breakdown, replacing Phase 2's static em-dash placeholders"
affects: [03-06-live-checkpoint]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "get-portfolio-pnl.ts is the ONLY place a Supabase client meets the pure P&L math — reads only, cookie-bound client is safe (unlike 03-04's admin-only writes)"
    - "fxUnavailable: when a non-base-currency holding exists but no FX rate is cached, that holding is EXCLUDED from the cross-currency aggregate (not converted at a fabricated 1:1) while its own row still shows real native numbers"
    - "staleness asOf is only ever a genuine last-successful-fetch timestamp (never a failed-attempt timestamp) because 03-04's write path only advances updated_at on success"

key-files:
  created:
    - src/lib/prices/get-portfolio-pnl.ts
    - src/components/dashboard/StalenessBadge.tsx
    - src/components/dashboard/RefreshPricesButton.tsx
  modified:
    - src/app/(dashboard)/page.tsx
    - src/app/(dashboard)/holdings/page.tsx
    - src/components/dashboard/HoldingsTable.tsx

key-decisions:
  - "PRICE-03/PRICE-04 left Pending in REQUIREMENTS.md despite the UI now being code-complete — both need live proof (a real refresh, a real staleness transition) that only 03-06's checkpoint can provide, per this plan's explicit DEFERRED verification list and the environment's no-Docker/pending-migration constraints."
  - "When fxUnavailable, non-base holdings are filtered OUT of calculatePortfolioTotals's input entirely rather than passed with fxRate=1 — the plan's text allowed either interpretation but filtering is the only one that can never silently produce a wrong aggregate."
  - "HoldingsTable gained a new 'Day Change' column (not in the original 6-column layout) because PRICE-05's day-change truth has no other home in the existing table shape — an additive, in-scope UI change, not an architectural one."

patterns-established:
  - "Server-side data-glue modules (get-portfolio-pnl.ts) intersect a Phase-2 domain type with a Phase-3 pure-logic result type (Holding & HoldingPnL & {...}) rather than inventing a parallel type — downstream components consume the intersection directly."

requirements-completed: [PRICE-05, PRICE-06, PRICE-07]

# Metrics
duration: 20min
completed: 2026-07-14
---

# Phase 3 Plan 5: Dashboard/Holdings pricing UI Summary

**Dashboard and Holdings pages now render real per-holding price, day-change, and total-change from price_cache/fx_cache via a new getPortfolioPnL glue function, with a shared StalenessBadge, a corporate-action warning pill, an FX-breakdown-visible portfolio total, and a working "Refresh now" button — all built on Phase 2's existing Server-Component pages without re-architecting them; live rendering against real cached rows is deferred to 03-06 per this environment's no-Docker/pending-migration constraints.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-14T22:29:00Z (approx)
- **Completed:** 2026-07-14T22:32:02Z
- **Tasks:** 3
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments

- `getPortfolioPnL(supabase, accountId, baseCurrency)` reuses `getHoldings` (Phase 2) and `calculateHoldingPnL`/`calculatePortfolioTotals` (03-02) unchanged — one `price_cache` query and one `fx_cache` query (no query-in-a-loop over holdings), verified by grep and by `npx tsc --noEmit` passing clean.
- Staleness thresholds are tied to PRICE-02's ~3-hour refresh cadence (fresh < 30min, stale < 6h, very-stale ≥ 6h, documented in-code) and correctly derive the "error with last-known price" vs "error with no price ever" distinction from the fact that 03-04's write path only advances `updated_at` on a successful fetch — never on a failed one.
- `fxUnavailable` handling: when a non-base-currency holding exists and no FX rate is cached, that holding's own price/P&L is still shown normally, but it is excluded from the cross-currency `portfolioTotal` aggregate rather than silently converted at a fabricated 1:1 rate — both `page.tsx` and `holdings/page.tsx` surface an explicit "FX rate unavailable — ... holdings excluded from total" warning in this case.
- `HoldingsTable.tsx` now shows real Current Price / Day Change / Total Return columns gated on `status === 'priced'` (not on field-definedness), a `StalenessBadge` per row, and an amber "Possible corporate action — verify before trading" pill that never hides the price/row (per 03-RESEARCH.md Pitfall 5) — the em-dash pending path from Phase 2 still exists, just now correctly conditional.
- `RefreshPricesButton` (`'use client'`, first line) calls `refreshPricesNow` (03-04) via `useTransition`, shows a spinning icon while pending, surfaces `result.error` inline (never swallowed, same pattern as `HoldingFormDialog`), and relies on the Server Action's own `revalidatePath('/')`/`revalidatePath('/holdings')` for the page to refresh — confirmed against this Next.js version's own docs (`node_modules/next/dist/docs/01-app/01-getting-started/09-revalidating.md`) and against Phase 2's `src/server-actions/portfolio.ts`, which already relies on the identical behavior for every existing mutation.
- Dashboard KPI cards ("Portfolio Value", "Day P&L") now show real base-currency totals with an FX-breakdown subtitle (e.g. "incl. USD holdings @ 83.50 USD→INR") when a non-base holding exists, or an honest "No live prices yet" / "—" when no holding is priced yet — never a fabricated $0 masquerading as "nothing invested."
- `npx tsc --noEmit` clean across the whole project. `npm run test:price-pnl` (12/12) and `npm run test:derive-holdings` (7/7) both still pass unchanged — this plan touched zero files in either pure-logic layer.

## Task Commits

Each task was committed atomically:

1. **Task 1: get-portfolio-pnl.ts data glue** - `bdb1b8d` (feat)
2. **Task 3: RefreshPricesButton + StalenessBadge** - `5fc9ca9` (feat) — built before Task 2 since Task 2 consumes both
3. **Task 2: wire Dashboard + Holdings pages + HoldingsTable** - `f7ba53d` (feat)

**Plan metadata:** (this commit, below)

## Files Created/Modified

- `src/lib/prices/get-portfolio-pnl.ts` — `getPortfolioPnL`, `StalenessInfo`/`StalenessLevel`/`PricedHolding`/`PortfolioPnLResult` types; the one place holdings + price_cache + fx_cache converge into P&L-ready data.
- `src/components/dashboard/StalenessBadge.tsx` — shared fresh/stale/very-stale/error/pending badge; single implementation used everywhere staleness is shown.
- `src/components/dashboard/RefreshPricesButton.tsx` — client island calling `refreshPricesNow`, inline error surfacing, no manual `router.refresh()`.
- `src/app/(dashboard)/page.tsx` — Dashboard KPIs now show real Portfolio Value / Day P&L with FX breakdown, sourced from `getPortfolioPnL`.
- `src/app/(dashboard)/holdings/page.tsx` — fetches `base_currency`, calls `getPortfolioPnL`, embeds `RefreshPricesButton` next to "Add Asset", adds a "Total P&L" line + FX-unavailable warning to the Holdings Summary panel.
- `src/components/dashboard/HoldingsTable.tsx` — accepts `PricedHolding[]` instead of bare `Holding[]`; renders real price/day-change/total-change gated on `status === 'priced'`, `StalenessBadge` per row, corporate-action pill.

## Decisions Made

- Left `PRICE-03` and `PRICE-04` Pending in `REQUIREMENTS.md` even though the UI wiring is code-complete: this plan's own `<verification>` section explicitly defers "actually seeing a real price render," "clicking Refresh now and observing the table update," and "confirming the staleness badge transitions" to 03-06's live checkpoint — marking them Complete now would over-claim, consistent with 03-04's precedent for `PRICE-03`.
- `fxUnavailable` holdings are filtered out of `calculatePortfolioTotals`'s input array entirely (rather than passed through with `fxRate: 1`) — the plan's `<action>` text permitted either reading, but filtering is the only approach that can never silently produce a wrong aggregate number for a currency pair with no real rate.
- Added a "Day Change" column to `HoldingsTable` beyond the plan's literal 6-column starting layout, because PRICE-05's explicit "day-change" truth had no existing column to land in — an additive UI change within the file already listed in `files_modified`, not a new architectural surface.
- Base currency is resolved with a small, separate `investment_accounts.base_currency` query in each page rather than extending Phase 2's `getAccountId` signature — keeps that reused function's contract unchanged (still just resolves an id) per the "reuse Phase 2's query layer" constraint.

## Deviations from Plan

None requiring a stop — all within Rules 1-3 (see Decisions Made above for the two judgment calls made where the plan text left room for either reading; both chosen to be the honest/never-fabricate option, consistent with the project's established discipline).

## Issues Encountered

None. `npx tsc --noEmit` was clean on every intermediate check (after Task 1, after Task 3, after Task 2). `npm run test:price-pnl` and `npm run test:derive-holdings` were unaffected since this plan added/modified zero files in `src/lib/prices/pnl-calculator.ts`, `src/lib/prices/ingest.ts`, or `src/lib/portfolio/derive-holdings.ts`.

## User Setup Required

None new. This plan is pure UI/glue code with zero new external service configuration. The two carried-forward environment blockers (03-01's two migrations not yet pushed to the live Supabase; `exchangerate.host`'s `missing_access_key` FX issue from 03-03) remain unchanged and unaffected by this plan — the UI code written here is correct against the NEW schema shape but genuinely cannot render real data until those are resolved, which is 03-06's scope.

## Next Phase Readiness

- 03-06's live checkpoint can now exercise the full user-visible slice once the migrations are pushed: load `/holdings`, see real prices/staleness/corporate-action flags on any instrument `refreshAllPrices` has successfully priced, click "Refresh now" and observe the table update without a manual reload, and confirm the FX-unavailable warning appears honestly for USD holdings until the `exchangerate.host` key issue is resolved.
- No blockers introduced by this plan. Two pre-existing blockers (migrations not pushed, FX key) remain exactly as documented in `.planning/STATE.md`'s Blockers/Concerns section — unchanged, not newly discovered here.
- `WatchlistTable.tsx` still shows the Phase-2 em-dash pricing placeholder untouched — out of this plan's scope (`files_modified` frontmatter did not include it; watchlist pricing was never part of PRICE-03..07's truths, which are holdings-P&L-specific).

---
*Phase: 03-price-pipeline-pnl-scheduling*
*Completed: 2026-07-14*

## Self-Check: PASSED

- FOUND: src/lib/prices/get-portfolio-pnl.ts
- FOUND: src/components/dashboard/StalenessBadge.tsx
- FOUND: src/components/dashboard/RefreshPricesButton.tsx
- FOUND: src/app/(dashboard)/page.tsx
- FOUND: src/app/(dashboard)/holdings/page.tsx
- FOUND: src/components/dashboard/HoldingsTable.tsx
- FOUND commit: bdb1b8d
- FOUND commit: 5fc9ca9
- FOUND commit: f7ba53d
