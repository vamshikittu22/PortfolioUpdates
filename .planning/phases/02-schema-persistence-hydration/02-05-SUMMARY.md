---
phase: 02-schema-persistence-hydration
plan: 05
subsystem: portfolio-ui
tags: [nextjs, server-components, server-actions, hydration, dialogs, honest-empty-states]
mode: code-only / defer-verification

requires:
  - phase: 02-04
    provides: getHoldings/getWatchlist/searchInstruments queries + add/sell/edit/delete/split/bonus Server Actions
  - phase: 02-02
    provides: deriveHoldings weighted-average-cost aggregation (reached via getHoldings)
provides:
  - Dashboard / Holdings / Watchlist / Allocation views reading real persisted data (PORT-07)
  - HoldingFormDialog — add/edit/sell/split/bonus UI wired to Server Actions (PORT-01, PORT-02, PORT-03, PORT-05)
  - WatchlistFormDialog — instrument-search-backed watchlist add (PORT-03)
  - searchInstrumentsAction — Server Action wrapper over searchInstruments
affects: [phase-02-06-cleanup, phase-03-pricing]

key-files:
  created:
    - src/components/dashboard/HoldingFormDialog.tsx
    - src/components/dashboard/WatchlistFormDialog.tsx
  modified:
    - src/app/(dashboard)/page.tsx
    - src/app/(dashboard)/holdings/page.tsx
    - src/components/dashboard/HoldingsTable.tsx
    - src/components/dashboard/WatchlistTable.tsx
    - src/components/dashboard/AllocationChart.tsx
    - src/server-actions/portfolio.ts (added searchInstrumentsAction)

key-decisions:
  - "Pending prices render an em-dash, never NaN or a fabricated number — Phase 3 pricing does not exist yet. Explicit code comments mark this as an honest pending state."
  - "KPIs derive from cost basis only; no market value is invented pre-Phase-3."
  - "Server Components fetch via getHoldings/getWatchlist; dialogs are 'use client' boundaries invoked from them."

patterns-established:
  - "Honest pending/empty states: em-dash for unknown price, real empty-state copy instead of mock rows."

requirements-completed: [PORT-01, PORT-02, PORT-03, PORT-05, PORT-07]

duration: ~11min (executor cut off by session limit; finalized by orchestrator)
completed: 2026-07-14
---

# Phase 2 Plan 05: UI Hydration + Mutation Dialogs Summary

**Dashboard, Holdings, Watchlist, and Allocation now read real persisted data through the 02-04 query layer, with add/edit/sell/split/bonus and watchlist dialogs wired to Server Actions. Pending prices show an honest em-dash — never a fabricated number. Code authored and committed; live-DB/browser verification DEFERRED.**

## Performance

- **Duration:** ~11 min of executor work before the session limit terminated it; orchestrator verified, committed, and summarized.
- **Completed:** 2026-07-14
- **Tasks:** 3 (all code authored)

## Done — code authored, static-verified

1. **PORT-07 — real-data hydration** (commit `98101ae`)
   - `src/app/(dashboard)/page.tsx` and `holdings/page.tsx` are Server Components reading `getHoldings()` / `getWatchlist()`.
   - `HoldingsTable`, `WatchlistTable`, `AllocationChart` render persisted rows with real empty states ("No holdings yet — add your first position to get started.").
   - **Verified:** `grep mock-portfolio` returns **no matches** across all five 02-05 files — the mock store is not imported by any hydrated view.

2. **PORT-01/02/03/05 — mutation dialogs** (commit `df82bbb`)
   - `HoldingFormDialog` imports and calls `addHolding`, `sellHolding`, `recordSplit`, `recordBonus` from `@/server-actions/portfolio`; used by `holdings/page.tsx` and in four places in `HoldingsTable` (add/edit/sell/split-bonus entry points).
   - `WatchlistFormDialog` calls `addToWatchlist` + `searchInstrumentsAction`; used by `WatchlistTable`.
   - `searchInstrumentsAction` added to `src/server-actions/portfolio.ts` as a thin Server Action wrapper over the 02-04 `searchInstruments` query.

3. **Honest pending-value handling**
   - `currentPrice` is `undefined` pre-Phase-3; both tables render `—` with explicit comments: *"an honest pending state, never a fabricated number or NaN."*
   - **Verified:** no bare `toFixed`/`NaN` on unknown prices; KPIs use cost basis only.

## DEFERRED / Unverified (blocked on a live DB + browser)

Per the CODE-ONLY / DEFER-VERIFICATION mode. Nothing below was executed; nothing fabricated.

- **Live add/edit/sell/split/bonus round-trips NOT exercised** — no live Supabase.
- **Persistence-survives-refresh NOT verified** — deferred to the 02-06 human checkpoint.
- **`revalidatePath` render effects NOT observed** against a running app.
- **Instrument search against real seeded rows NOT run.**

### Must-Have Truths status

| Truth | Status |
| ----- | ------ |
| Dashboard/holdings/watchlist/allocation read persisted data with real empty states | Code authored + static-verified (no mock imports); runtime DEFERRED |
| User can add/edit/delete holdings and watchlist entries | Dialogs wired to Server Actions; runtime DEFERRED |
| Split/bonus recordable without a false loss | Wired to recordSplit/recordBonus (math proven in 02-02 tests); runtime DEFERRED |
| No fabricated price/NaN shown pre-Phase-3 | Verified (em-dash guards) |

## Task Commits

1. **Dialogs + searchInstrumentsAction** — `df82bbb`
2. **Page/component hydration** — `98101ae`

## Deviations from Plan

**1. [Environment] Executor terminated by session limit before committing** — the agent completed all three tasks' code (dialogs typecheck, are imported, and are wired to every required Server Action) but was cut off before `git commit` and SUMMARY. The orchestrator verified the work (tsc, grep for wiring / mock removal / fabricated values), committed it as **two** commits instead of three atomic per-task commits, and authored this SUMMARY. No code was lost or invented.

**2. [Known, resolved in 02-06] Transient tsc error in `news/page.tsx`** — 02-05 changed `WatchlistTable` to the new `src/lib/types` `WatchlistItem`, but `src/app/(dashboard)/news/page.tsx` still passes the legacy `mock-portfolio` `WatchlistItem`, producing:
`TS2322: Type 'mock-portfolio.WatchlistItem[]' is not assignable to type 'types.WatchlistItem[]'`.
This is **expected at this point in the wave order** — migrating the News page off the mock store is plan **02-06**'s explicit scope. The project will not typecheck clean until 02-06 lands. Flagged here so it is not mistaken for a defect.

## Issues Encountered

- Session limit (resets 2:40pm America/Chicago) terminated the executor mid-plan; recovery handled by the orchestrator as described above.

## Next Phase Readiness

- 02-06 must migrate `news/page.tsx` off `mock-portfolio` (this restores a clean `npx tsc --noEmit`), delete the mock store, and run the blocking live checkpoint.
- 02-07 can add research deep-links from the now-real holdings/watchlist rows.

---
*Phase: 02-schema-persistence-hydration*
*Completed: 2026-07-14*
