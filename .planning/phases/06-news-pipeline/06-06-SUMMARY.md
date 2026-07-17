---
phase: 06-news-pipeline
plan: 06
subsystem: ui
tags: [supabase, rls, nextjs-rsc, news-feed, portfolio-filtering]

# Dependency graph
requires:
  - phase: 06-news-pipeline (06-01)
    provides: news_items ALTER (title_hash/summary_status/summarized_at) + news_item_instruments join table with closed RLS
  - phase: 06-news-pipeline (06-02)
    provides: src/lib/news/types.ts module (RawNewsItem/NewsSummaryResult/InstrumentMatch — not directly consumed by this plan but the sibling module tree it lives alongside)
  - phase: 02-portfolio (via src/lib/supabase/portfolio.ts)
    provides: getHoldings/getWatchlist cookie-bound read functions
provides:
  - "getNewsFeed(supabase, accountId) — cookie-bound, RLS-scoped, portfolio-filtered (held ∪ watched) news read, newest-first, capped at 100"
  - "/news page rewired to real persisted data end to end (NEWS-03), inert Filters/Preferences toolbar removed"
affects: [06-10 (live-verify checkpoint), 06-04/06-05/06-07 (ingest/summarize/alert-sweep plans that populate the tables this reads)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getNewsFeed follows the getPriceAlerts/getHoldings read-layer convention: accepts an already-constructed cookie-bound SupabaseClient, never builds or accepts the admin client"
    - "firstOf<T> generic normalizer for Supabase's object-or-array to-one relation quirk (mirrors sweep.ts:57-60, generalized beyond the InstrumentDisplayRow-specific firstInstrument in portfolio.ts/alerts/read.ts)"
    - "Read-layer query-error degrades to an honest empty result + console.warn instead of throwing, so a not-yet-migrated table can never crash the page (extends the existing null-value honesty pattern to the query-failure case)"

key-files:
  created:
    - src/lib/news/read.ts
  modified:
    - src/app/(dashboard)/news/page.tsx

key-decisions:
  - "getNewsFeed catches the news_item_instruments query error and returns [] with console.warn rather than throwing, because 06-01's migration is authored-but-not-pushed live — the honest empty state must render instead of crashing the RSC (this generalizes the plan's null-handling honesty rule to the query-failure case, which the plan's Task 2 verify step explicitly anticipated)"
  - "category derivation checks matchedInstrumentIds against heldIds only (else 'Watchlist') since every queried row is by construction tied to a held-or-watched instrument — 'Macro' is documented as honestly unreachable this phase, matching the plan"

requirements-completed: [NEWS-03, NEWS-05]

# Metrics
duration: 12min
completed: 2026-07-17
---

# Phase 6 Plan 06: Real portfolio-filtered news read layer Summary

**`getNewsFeed` reads `news_item_instruments` joined to `news_items` through the cookie-bound RLS client, filtered to the caller's held+watched instruments, and `/news` now renders it in place of the hardcoded `news={[]}`.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-17T16:34:00-05:00 (approx, first file read)
- **Completed:** 2026-07-17T16:46:00-05:00
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 edited)

## Accomplishments
- `src/lib/news/read.ts` — `getNewsFeed(supabase, accountId)`: loads held + watched instrument ids in parallel via the dirty-but-import-only `getHoldings`/`getWatchlist`, queries `news_item_instruments` joined to `news_items` filtered by `.in('instrument_id', ...)`, groups multi-instrument-matched articles into a single item, maps to the display `NewsItem` shape with honest null handling, sorts newest-first by real `Date` comparison, caps at 100.
- `/news` RSC now fetches watchlist + news in parallel (`Promise.all`) and passes the real feed into `<NewsFeed news={news} />`; the two inert toolbar buttons (Filters, Preferences) and their now-unused `Filter`/`Settings2` lucide imports are removed as an honest removal, not dead-code left in place.

## Task Commits

Each task was committed atomically:

1. **Task 1: getNewsFeed read layer (cookie client, portfolio-filtered, newest first)** - `6775124` (feat)
2. **Task 2: Rewire /news page (real data in, inert buttons out)** - `ae65aaf` (feat)

**Plan metadata:** (this commit) `docs(06-06): complete news-read-layer plan`

_Note: no TDD tasks in this plan — both were `type="auto"`._

## Files Created/Modified
- `src/lib/news/read.ts` - `getNewsFeed`: portfolio-filtered, RLS-scoped, newest-first news read with honest null/error degradation
- `src/app/(dashboard)/news/page.tsx` - real `getNewsFeed` wiring, inert toolbar buttons removed, header comment rewritten to describe the real data source

## Decisions Made
- Query-error degradation (empty array + `console.warn`) was added proactively in Task 1 rather than discovered as a crash during Task 2's smoke test — the plan's own Task 2 verify step explicitly called this out as a required guard "if the smoke test shows a crash," and since a live Supabase project exists but `news_item_instruments` is authored-not-pushed (06-01, consent-gated per STATE.md), building it defensively into `read.ts` from the start avoided a two-pass fix. This is a direct application of the plan's own written intent, not a new architectural choice.
- `firstOf<T>` was written as a small generic rather than copy-pasting the `InstrumentDisplayRow`-specific `firstInstrument` from `portfolio.ts`/`alerts/read.ts`, since `read.ts`'s row shape (`NewsItemRow`) is different — same normalization idea, sweep.ts's generic-name precedent (`firstOf`) followed per the plan's explicit instruction (line 68: "sweep.ts:57-60 precedent").

## Deviations from Plan

None — plan executed exactly as written. The query-error-degrades-to-empty guard in `read.ts` was explicitly anticipated in the plan's own Task 2 verify step ("if the query errors, getNewsFeed should return [] with a console.warn ... add that guard in read.ts if the smoke test shows a crash") and implemented directly in Task 1 rather than as a reactive fix, since it was clear from context (06-01's migration not yet pushed live) that it would be needed.

## Issues Encountered

- **Transient `npm run build` type-check failure, out of scope (concurrent 07-02 in-flight TDD RED state).** `npm run build`'s type-check step failed on `scripts/digest-compose-test.ts` (missing `buildDailyDigestMessage` export from `src/lib/digest/compose.ts`) — traced to the concurrently-running 07-02 executor's TDD RED commit (`39e56b6`), whose GREEN target had not yet landed. Re-ran once after a ~60s wait per the environment notes; the failure persisted but progressed (module-not-found -> missing-export), confirming it is 07-02's own in-flight progression, not a stuck/static error. Neither `src/lib/news/read.ts` nor `src/app/(dashboard)/news/page.tsx` were referenced by any error in either `npx tsc --noEmit` or `npm run build`. Logged to `.planning/phases/06-news-pipeline/deferred-items.md` (06-06 entry), not fixed — outside this plan's disjoint-file scope.

## User Setup Required

None - no external service configuration required. The `news_item_instruments`/`news_items` tables this read layer queries exist only as an authored-but-unpushed migration (06-01); live click-through with real persisted rows is explicitly deferred to the 06-10 checkpoint, matching the plan's own success criteria.

## Next Phase Readiness
- `/news` is code-complete and statically verified against the 06-01 schema shape: `npx tsc --noEmit` clean on this plan's own files (verified via targeted grep isolating sibling in-flight noise); the plan's specified greps (`createAdminClient` absent, `news={[]}` absent, `Filter`/`Settings2` absent, dirty `portfolio.ts`/`types.ts` diffs unchanged) all pass.
- Once 06-01's migration is pushed live and 06-04/06-05/06-07 (fetch/summarize/alert-sweep) populate real rows, `/news` will render them with zero further code changes — this plan is the read-side half of NEWS-03, independently shippable per the plan's own design rationale.
- Blocker carried forward (not new to this plan): live migration push for `20260717120000_news_pipeline.sql` remains consent-gated, same standing deferral as Phase 4/5's migrations (STATE.md STILL-OPEN items 6/7), now joined by this phase's migration as a third pending file — a future `supabase db push` must remain selective and must never include the deliberately-held-back `price_refresh_cron.sql`.

---
*Phase: 06-news-pipeline*
*Completed: 2026-07-17*

## Self-Check: PASSED

- FOUND: src/lib/news/read.ts
- FOUND: src/app/(dashboard)/news/page.tsx
- FOUND commit: 6775124 (Task 1)
- FOUND commit: ae65aaf (Task 2)
