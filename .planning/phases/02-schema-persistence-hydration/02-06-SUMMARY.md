---
phase: 02-schema-persistence-hydration
plan: 06
subsystem: portfolio-ui
tags: [nextjs, server-components, cleanup, honest-empty-states]
mode: code-only / defer-verification

requires:
  - phase: 02-05
    provides: Dashboard/Holdings/Watchlist/Allocation hydrated from real data via getHoldings/getWatchlist; HoldingFormDialog/WatchlistFormDialog
provides:
  - Single real-account layout (no mock account switcher) — PORT-07
  - News page reading the REAL persisted watchlist via getWatchlist; honest empty news feed
  - Alerts page with honest empty alerts state, no mock profile
  - Mock portfolio store (usePortfolioStore.ts, mock-portfolio.ts) fully deleted from the codebase
affects: [phase-02-checkpoint, phase-03-pricing, phase-05-alerts, phase-06-news]

key-files:
  modified:
    - src/app/(dashboard)/layout.tsx
    - src/app/(dashboard)/news/page.tsx
    - src/app/(dashboard)/alerts/page.tsx
    - src/components/dashboard/NewsFeed.tsx
    - src/components/dashboard/AlertsTable.tsx
    - src/lib/types.ts
  deleted:
    - src/store/usePortfolioStore.ts
    - src/lib/mock-portfolio.ts

key-decisions:
  - "layout.tsx account label: static 'My Portfolio' string chosen over a client-side investment_accounts fetch — smaller diff, matches Phase 2's single-account-per-user scope decision (02-RESEARCH.md Open Question 1)."
  - "News page's Tracking Panel (trackedSymbols add/remove, sentiment toggle status bar) removed outright rather than kept as dead UI — it depended entirely on the mock store's newsPrefs, a Phase 6 concept with no backing table yet."
  - "NewsFeed/AlertsTable now import NewsItem/AlertItem from @/lib/types (identical shapes already existed there) instead of the deleted mock module — required for the deletion to not break the build."

patterns-established:
  - "Honest empty states for not-yet-built features: news=[] and alerts=[] passed explicitly, never mock data."

requirements-completed: [PORT-07]

duration: ~25min
completed: 2026-07-14
---

# Phase 2 Plan 06: Mock Store Removal + Layout/News/Alerts Cleanup Summary

**Deleted the mock portfolio Zustand store and its data module outright; layout.tsx now shows a single real account with no switcher; News reads the real persisted watchlist via `getWatchlist` while Alerts/News-feed show honest empty states for not-yet-built Phase 5/6 features. Repo-wide grep for the mock store returns zero matches and `npx tsc --noEmit` passes clean.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-14
- **Tasks:** 3 auto tasks (code authored, statically verified) + 1 checkpoint (DEFERRED, see below)

## Done — authored, static-verified

1. **Task 1 — `layout.tsx` simplified to a single real account** (commit `f6094f1`)
   - Removed `usePortfolioStore` import, `accountDropdownOpen` state, `accounts`/`selectedAccountId`/`switchAccount` usage, and the entire account-switcher dropdown UI (`ChevronDown`/`Check` icons dropped as now-unused).
   - Account name display replaced with a static `'My Portfolio'` label (chosen over a live `investment_accounts.name` fetch for a smaller diff — documented inline).
   - `userEmail` / logout logic untouched.
   - **Verified:** `grep "usePortfolioStore" layout.tsx` → no matches; `npx tsc --noEmit` → clean.

2. **Task 2 — News + Alerts pages migrated off the mock store** (commit `29adf73`)
   - `news/page.tsx` converted to a Server Component: fetches the account via `getAccountId`, then the REAL watchlist via `getWatchlist` from `@/lib/supabase/portfolio` (same pattern as plan 02-05), passed to `WatchlistTable`. `NewsFeed` receives `news={[]}` — an honest empty state, Phase 6 not live.
   - The "Tracking Panel" (trackedSymbols chips, add-symbol input, sentiment ON/OFF status bar) removed entirely — it depended wholly on the mock store's `newsPrefs`, which has no backing table. Filters/Preferences toolbar buttons kept as inert affordances (no mock-data dependency).
   - `alerts/page.tsx` simplified to a plain component passing `alerts={[]}` to `AlertsTable` (honest "No active alerts" empty state) and a static heading (no per-account profile name).
   - **Verified:** `grep "usePortfolioStore" news/page.tsx alerts/page.tsx` → no matches; both still export valid default components; `npx tsc --noEmit` → clean (this also resolved the known transient error flagged in 02-05's SUMMARY, since `news/page.tsx` now passes the correct `@/lib/types` `WatchlistItem[]`).

3. **Task 3 — Mock store deleted, zero references confirmed repo-wide** (commit `f69babc`)
   - Deleted `src/store/usePortfolioStore.ts` and `src/lib/mock-portfolio.ts`.
   - `NewsFeed.tsx` and `AlertsTable.tsx` still imported `NewsItem`/`AlertItem` type-only from the mock module — migrated both to import from `@/lib/types` instead (identical shapes already existed there from plan 02-05's type migration; this fix was required for the deletion to not break the build — Rule 3, blocking issue).
   - Updated two stale comments in `src/lib/types.ts` that referenced the now-deleted `mock-portfolio.ts` file.
   - **Verified:** `grep -rl "usePortfolioStore\|mock-portfolio" src` (project root) → **zero files**; `npx tsc --noEmit` for the whole project → **clean**.

### Must-Have Truths status

| Truth | Status |
| ----- | ------ |
| No file imports usePortfolioStore or mock-portfolio — both deleted | **Verified** — repo-wide grep returns zero files |
| Sidebar/header show the real signed-in user's single account, not a 3-account mock switcher | **Verified** (code) — static `'My Portfolio'` label, no switcher UI, no mock import; runtime rendering DEFERRED (no live Supabase to sign in against) |
| News/Alerts compile and render honest empty states; News still shows the REAL persisted watchlist | **Verified** (code) — `getWatchlist` wired in; honest `news=[]`/`alerts=[]`; runtime data-fetch DEFERRED (no live Supabase) |
| Human confirms add/refresh/partial-sell/split correctness on a live DB | **DEFERRED** — see Task 4 below |

## DEFERRED — Task 4 (checkpoint:human-verify, blocking gate)

**Not attempted. No pass fabricated.** This environment has no Docker and no live Supabase (per `.planning/STATE.md`'s carried-forward CODE-ONLY / DEFER-VERIFICATION mode). The 8-step live-DB verification in the plan (apply 5 migrations, sign up, add/refresh/partial-sell/split a holding, watchlist add/remove, cross-user RLS isolation) requires a real Supabase instance and a browser session that do not exist here.

This is recorded as an explicit deferral, matching the precedent set in `.planning/phases/01-auth-rls-foundation/01-01-SUMMARY.md`. It becomes item 9 in `.planning/STATE.md`'s "DEFERRED verification debt" list — once a live Supabase exists, re-run the 8 steps in `02-06-PLAN.md` Task 4's `how-to-verify` and confirm:
1. Migrations apply cleanly (5 total: 2 Phase 1 + 3 Phase 2).
2. Sign-up → Dashboard lands correctly.
3. Add TCS @ ₹3850 × 10 → avg cost ₹3850.00, no NaN/crash on pending-price columns.
4. Hard refresh → holding persists.
5. Partial-sell 4 @ ₹4000 → quantity 6, avg cost STAYS ₹3850.00.
6. 2-for-1 split (+10) → quantity 20, avg cost ~₹1925.00, no false-loss indicator anywhere.
7. Watchlist add/remove reflects immediately without a manual refresh.
8. A second user in an incognito session sees none of the above (RLS).

## Task Commits

1. **Task 1: layout.tsx single-account simplification** — `f6094f1`
2. **Task 2: News/Alerts pages migrated off mock store** — `29adf73`
3. **Task 3: mock store deleted, zero references confirmed** — `f69babc`

(Commit order above reflects the actual git history, not strict task-number order — see Deviations below for why.)

## Deviations from Plan

### Environment-driven

**1. [Concurrent execution collision] Shared working tree with the parallel 02-07 executor**
- **Found during:** Task 1
- **Issue:** Plan 02-06 and plan 02-07 are both wave-4 plans depending only on 02-05 (independent of each other per their `depends_on` frontmatter), so the orchestrator ran both as parallel executors against the *same* git working directory. Immediately after this executor wrote Task 1's edit to `layout.tsx` (before this executor had committed it), the concurrent 02-07 executor's own commit (`22f238a feat(02-07): add Research deep-links...`) accidentally swept up this executor's uncommitted `layout.tsx` change alongside its own `HoldingsTable.tsx`/`WatchlistTable.tsx` edits. The 02-07 executor detected this and self-corrected with `e516d93 chore(02-07): exclude concurrent 02-06 layout.tsx edit accidentally staged by shared working tree`, which reverted `layout.tsx` in git history back to its pre-edit state while leaving this executor's in-progress working-tree edit untouched.
- **Resolution:** No content was lost. This executor re-verified the on-disk `layout.tsx` content matched the intended Task 1 result (grep + `npx tsc --noEmit`), then staged and committed *only* `layout.tsx` itself (explicitly excluding `src/app/(dashboard)/research/page.tsx`, which the 02-07 executor was still actively editing in the same working tree) as commit `f6094f1`. This is why `f6094f1` (Task 1) has a later commit hash than `29adf73` (Task 2) — Task 2's news/alerts commit was made first, in between the collision and its cleanup.
- **Files affected:** `src/app/(dashboard)/layout.tsx` only. `research/page.tsx` was never touched by this executor.
- **Verification:** Post-recovery `grep "usePortfolioStore" layout.tsx` → no matches; `npx tsc --noEmit` → clean; `git show f6094f1 --stat` confirms only `layout.tsx` in that commit.

### Auto-fixed Issues

**2. [Rule 3 - Blocking] `NewsFeed.tsx`/`AlertsTable.tsx` type imports would have broken on mock-store deletion**
- **Found during:** Task 3
- **Issue:** Neither file was in the plan's `files_modified` list, but both did `import type { NewsItem } from '@/lib/mock-portfolio'` / `import type { AlertItem } from '@/lib/mock-portfolio'`. Deleting `mock-portfolio.ts` (the plan's explicit Task 3 action) would have broken these imports and failed `npx tsc --noEmit` for the whole project — the plan's own Task 3 verify step.
- **Fix:** Repointed both imports to `@/lib/types`, which already exports identically-shaped `NewsItem`/`AlertItem` interfaces (added in plan 02-05's type migration). No shape changes needed.
- **Files modified:** `src/components/dashboard/NewsFeed.tsx`, `src/components/dashboard/AlertsTable.tsx`
- **Verification:** `grep -rl "mock-portfolio" src` → zero files; `npx tsc --noEmit` → clean.
- **Committed in:** `f69babc` (Task 3 commit)

---

**Total deviations:** 1 environment collision (no content lost, self-recovered) + 1 auto-fixed blocking issue.
**Impact on plan:** No scope creep — both were necessary to land the plan's own stated success criteria (zero mock-store references, clean tsc).

## Issues Encountered

- Concurrent-executor git collision on `layout.tsx` (see Deviation 1). Resolved without data loss by both executors independently verifying file content against grep/tsc before committing.

## Self-Check

- `[ -f src/store/usePortfolioStore.ts ]` → **MISSING** (correctly deleted)
- `[ -f src/lib/mock-portfolio.ts ]` → **MISSING** (correctly deleted)
- `grep -rl "usePortfolioStore\|mock-portfolio" src` → **zero files** (repo-wide, confirmed)
- `npx tsc --noEmit` → **clean, zero errors** (confirmed immediately before writing this summary)
- Commit `f6094f1` exists: `git log --oneline | grep f6094f1` → found
- Commit `29adf73` exists: `git log --oneline | grep 29adf73` → found
- Commit `f69babc` exists: `git log --oneline | grep f69babc` → found

## Self-Check: PASSED

## Next Phase Readiness

- PORT-07 is now fully code-complete: every UI surface reads real persisted data or shows an honest empty/pending state, and the mock store no longer exists anywhere in `src/`.
- Phase 2's closing checkpoint (Task 4, this plan) remains the single blocking gate before Phase 2 can be marked verified — it requires a live Supabase and is added as item 9 to `.planning/STATE.md`'s deferred-verification debt list.
- 02-07 (Research deep-links, WIRE-01) is being executed in parallel by a separate wave-4 executor; no further action needed from this plan.

---
*Phase: 02-schema-persistence-hydration*
*Completed: 2026-07-14*
