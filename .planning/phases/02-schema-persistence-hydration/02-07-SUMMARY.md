---
phase: 02-schema-persistence-hydration
plan: 07
subsystem: ui
tags: [nextjs, next-link, use-search-params, suspense, research-module]
mode: code-only / defer-verification

requires:
  - phase: 02-05
    provides: HoldingsTable/WatchlistTable hydrated from real getHoldings()/getWatchlist() rows (PORT-07)
provides:
  - Research deep-link entry point from real holding/watchlist rows (WIRE-01)
  - research/page.tsx honors ?ticker= URL param on load
affects: [phase-03-pricing-and-beyond-research-consumers]

tech-stack:
  added: []
  patterns:
    - "next/navigation useSearchParams() in a client-rendered page must be wrapped in a <Suspense> boundary for `next build` static generation to succeed (missing-suspense-with-csr-bailout) — confirmed by an actual build run, not assumed."

key-files:
  created: []
  modified:
    - src/components/dashboard/HoldingsTable.tsx
    - src/components/dashboard/WatchlistTable.tsx
    - src/app/(dashboard)/research/page.tsx

key-decisions:
  - "Research affordance is a small Search-icon Link (lucide-react `Search`), placed next to the exchange badge in HoldingsTable and next to the ticker in WatchlistTable, matching each table's existing visual density."
  - "Ticker param read once on mount only (matching plan wording), not on every URL change — deep-linking is an entry action, not a live sync between URL and page state."
  - "research/page.tsx split into an outer default-export wrapper (`<Suspense><ResearchPageContent /></Suspense>`) and an inner `ResearchPageContent` that calls useSearchParams() — required by `next build`, verified by actually running the build and observing the exact 'missing-suspense-with-csr-bailout' error before adding the wrapper, then confirming its absence after."

patterns-established:
  - "Deep-link pattern: /research?ticker=SYMBOL, ticker uppercased on read, falls back to existing HDFCBANK default when absent — additive to, not a regression of, direct navigation."

requirements-completed: [WIRE-01]

duration: ~7min
completed: 2026-07-14
---

# Phase 2 Plan 07: Research Deep-Link Summary

**Holdings and Watchlist rows now link to `/research?ticker=SYMBOL` via a small Search-icon affordance; research/page.tsx reads that param on mount (wrapped in a required Suspense boundary), falling back to the existing HDFCBANK default when absent.**

## Performance

- **Duration:** ~7 min (14:51 → 14:57 local, commit timestamps)
- **Completed:** 2026-07-14
- **Tasks:** 2/2 complete
- **Files modified:** 3

## Accomplishments
- Every row in `HoldingsTable` and `WatchlistTable` now has a working `/research?ticker={ticker}` link (ticker symbol, not instrumentId — research-service is ticker-keyed).
- `research/page.tsx` initializes `selectedTicker` from the `?ticker=` URL param on mount (uppercased), preserving the existing HDFCBANK default when the param is absent.
- Added the `<Suspense>` boundary around the page's `useSearchParams()` usage — confirmed necessary (not speculative) by running `next build` before and after the change.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Research deep-link to HoldingsTable and WatchlistTable rows** - `22f238a` (feat)
2. **Task 2: research/page.tsx reads the initial ticker from the URL** - `760a7fb` (feat)

An intermediate corrective commit `e516d93` was also made — see Deviations below.

**Plan metadata:** this SUMMARY + STATE.md/ROADMAP.md update (separate commit, per protocol)

## Files Created/Modified
- `src/components/dashboard/HoldingsTable.tsx` - added a `next/link` Search-icon affordance next to the exchange badge, linking to `/research?ticker={h.ticker}`
- `src/components/dashboard/WatchlistTable.tsx` - added the same affordance next to the ticker/name block, linking to `/research?ticker={item.ticker}`
- `src/app/(dashboard)/research/page.tsx` - imports `useSearchParams` from `next/navigation`; default export now wraps the (renamed) page body `ResearchPageContent` in `<Suspense fallback={null}>`; `ResearchPageContent` reads `tickerParam` on mount and uses it (uppercased) instead of the hardcoded `'HDFCBANK'` default when present

## Decisions Made
- Used a `Search` lucide icon rather than a text "Research" label, to match each table's existing icon-button density (Pencil/TrendingDown/GitBranch/Gift/Trash2 in HoldingsTable; X in WatchlistTable) instead of introducing a new text-link visual style.
- Kept the ticker-param read as "on mount only" (empty `useEffect` deps array), matching the plan's literal wording ("On mount, initialize selectedTicker...") rather than re-syncing on every URL change, since this is a one-shot deep-link entry point, not a live URL↔state binding.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking, environment] Added Suspense boundary around useSearchParams() in research/page.tsx**
- **Found during:** Task 2, `npm run build` verification (plan Task 2 explicitly anticipated this and instructed to check by running the build, not add speculatively)
- **Issue:** `next build` reported `useSearchParams() should be wrapped in a suspense boundary at page "/research"` (missing-suspense-with-csr-bailout) during static generation
- **Fix:** Renamed the page body to `ResearchPageContent` and wrapped it in `<Suspense fallback={null}>` inside the default-exported `ResearchPage`
- **Files modified:** `src/app/(dashboard)/research/page.tsx`
- **Verification:** Re-ran `next build` (with a syntactically valid dummy `NEXT_PUBLIC_SUPABASE_URL` override purely to get the build past an unrelated pre-existing prerender crash on `/alerts` — see note below) — all 19 routes generated cleanly including `○ /research` (static), no Suspense error.
- **Committed in:** `760a7fb` (Task 2 commit)

**2. [Environment / shared working tree] Corrective commit for accidentally-included concurrent-executor file**
- **Found during:** Task 1 commit — `git status` showed `src/app/(dashboard)/layout.tsx` as unstaged-modified (belonging to the concurrently-running 02-06 executor's scope) immediately before my `git add`, but it appeared in `git commit`'s resulting tree anyway (the other process staged it into the shared index between my status check and my commit — this repo has two executors operating on the same working directory concurrently).
- **Issue:** Commit `22f238a` unintentionally included 02-06's in-progress `layout.tsx` edit (mock-portfolio-store account-switcher removal), which was not part of 02-07's scope and not yet ready to be committed under 02-06's own message.
- **Fix:** Created corrective commit `e516d93` that resets the index for `layout.tsx` back to its pre-22f238a blob (via `git hash-object` + `git update-index --cacheinfo`) without touching the working-tree file, so 02-06's uncommitted edit remained intact and unstaged for that executor to commit properly itself. Confirmed working as intended: 02-06 subsequently committed `layout.tsx` cleanly in its own commits (`f6094f1`, `f69babc`).
- **Files modified:** `src/app/(dashboard)/layout.tsx` (index-only correction; no working-tree content change)
- **Verification:** `git show --stat 22f238a` now shows only the 2 intended 02-07 files; `git log` confirms 02-06 later committed `layout.tsx` under its own messages.
- **Committed in:** `e516d93`

---

**Total deviations:** 2 (1 Rule 3 blocking/environment fix required by the plan's own verification step, 1 shared-working-tree correction with no code-behavior impact)
**Impact on plan:** No scope creep. The Suspense fix was explicitly anticipated and required by the plan's own Task 2 instructions. The corrective commit only untangles which commit a pre-existing, independently-authored file's change belongs to — it does not alter any 02-07 or 02-06 code content.

## Issues Encountered
- Working directory is shared with a concurrently-running executor (plan 02-06), causing one incidental cross-staging incident (see Deviation 2 above), resolved without data loss.
- `npm run build` fails on the unrelated `/alerts` route with `Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL` because `.env.local` holds `PLACEHOLDER_SUPABASE_URL` (no live Supabase in this environment, per project-wide CODE-ONLY mode). This is pre-existing and unrelated to 02-07's files. To confirm the Suspense fix specifically (which requires static generation to reach the `/research` route), the build was re-run with a syntactically-valid-but-fake `NEXT_PUBLIC_SUPABASE_URL` override passed only as a shell env var for that single diagnostic command — `.env.local` itself was NOT modified, and no live data or live-DB behavior was fabricated or claimed.

## Done — code authored, static-verified

1. **WIRE-01 — Research deep-links from real rows**
   - `HoldingsTable`/`WatchlistTable` rows link to `/research?ticker={ticker}` (commit `22f238a`)
   - `research/page.tsx` reads `?ticker=` on mount, uppercases it, falls back to `HDFCBANK` default when absent (commit `760a7fb`)
   - **Verified:** `npx tsc --noEmit` clean (project-wide, zero errors). `grep "research?ticker="` matches both table files. `grep "useSearchParams"` matches research/page.tsx. `npm run build` (with diagnostic env override, see above) completes successfully, all 19 routes generate including static `/research`, no Suspense error.

## Deferred / Unverified (needs live DB + browser)

Per the CODE-ONLY / DEFER-VERIFICATION mode. Nothing below was executed; nothing fabricated.

- **Clicking a real holding/watchlist row through to `/research?ticker=X` in a running browser** — requires a live DB with at least one seeded holding/watchlist row (blocked on the 02-06 live checkpoint / Supabase instance).
- **Confirming the research module actually resolves a report for tickers sourced from real portfolio rows** rather than the module's own mock/demo ticker set — `research-service.ts` was not modified in this plan and its own ticker coverage is out of scope here; if a held ticker isn't in the research module's demo dataset, the existing "could not be resolved" error state will show (expected, unchanged behavior).
- **`next build`'s unrelated `/alerts` prerender failure against the real (placeholder) `.env.local`** — remains failing until a live Supabase URL/keys are populated; tracked as pre-existing project-wide deferred verification debt (STATE.md), not a 02-07 regression.

### Must-Have Truths status

| Truth | Status |
| ----- | ------ |
| Clicking a "Research" affordance on a held/watched ticker opens Research pre-loaded for that ticker, not always HDFCBANK | Code authored + static-verified (link href + URL-param read both confirmed via grep/tsc/build); actual click-through in a running app DEFERRED (no live DB rows to click) |
| Navigating to /research directly (no query param) still shows the existing default demo behavior | Preserved by design (fallback to `'HDFCBANK'` unchanged when `tickerParam` is null); DEFERRED runtime confirmation |

## Next Phase Readiness

- WIRE-01 is code-complete; the remaining WIRE requirement(s) and all DB-dependent runtime verification for Phase 2 (02-01 through 02-07) are consolidated in STATE.md's "DEFERRED verification debt" list, to be cleared once a live Supabase instance exists.
- No blockers introduced for later phases; research module's own data source (mock/Gemini-backed) is untouched, so Phase 3+ pricing work is unaffected by this plan.

---
*Phase: 02-schema-persistence-hydration*
*Completed: 2026-07-14*

## Self-Check: PASSED

All 3 modified source files + this SUMMARY.md confirmed present on disk; commits `22f238a`, `e516d93`, `760a7fb` confirmed present in `git log`.
