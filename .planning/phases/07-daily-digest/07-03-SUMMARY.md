---
phase: 07-daily-digest
plan: 03
subsystem: notifications
tags: [supabase, cron-route, server-actions, cross-phase-seam, telegram, digest]

# Dependency graph
requires:
  - phase: 07-daily-digest (07-01)
    provides: "digest_preferences table (own-row RLS, no row == disabled) + notifications_outbox 'daily_digest' kind pre-enumerated"
  - phase: 07-daily-digest (07-02)
    provides: "istDateKey/computeDigestDedupeKey, selectTopMovers, buildDailyDigestMessage — pure zero-I/O composition consumed directly here"
  - phase: 05-alerts-telegram
    provides: "enqueueNotifications/dispatchOutbox (transactional outbox engine), getTelegramLink, isAuthorizedRefreshRequest guard predicate, createAdminClient"
  - phase: 03-price-pnl (via 05)
    provides: "getPortfolioPnL — admin-safe, account/instrument-scoped P&L read"
  - phase: 06-news-pipeline (06-01, schema authored not yet applied)
    provides: "news_items.summary_status + news_item_instruments table shape — read by table name only, honest degradation while unapplied"
provides:
  - "getDailyDigestNews(admin, instrumentIds, sinceIso) — narrow Phase-6 news seam, de-dupes/sorts/caps at 5, degrades honestly to {items:[],degraded:true} on ANY query error"
  - "getDigestPreference(supabase, userId) — cookie-bound own-row read, no row == disabled"
  - "composeDigestForUser(admin, userId, now) — single shared compose path (account -> P&L -> watchlist union -> news -> buildDailyDigestMessage)"
  - "runDailyDigest(admin, now?) — cross-user sweep: enabled+linked users only, per-user try/catch isolation, DB-unique-index-backed once-per-IST-day idempotency"
  - "POST /api/digest/run — DIGEST_RUN_SECRET-guarded cron/manual entry point (runDailyDigest + dispatchOutbox)"
  - "setDigestEnabled(enabled) / sendTestDigest() Server Actions"
affects: [07-04, 07-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cross-phase seam via table-name-only queries (never importing the other phase's module tree) with honest degradation on any query error — not just the specific undefined-table/column codes"
    - "Single shared compose function reused by both the cross-user sweep and the one-off test-send action, so the two paths can never render different messages"
    - "Best-effort pre-check counter (skippedDuplicate) layered on top of a DB unique-index guarantee — the counter can undercount under a race, the index never lets a duplicate through"

key-files:
  created:
    - src/lib/digest/news.ts
    - src/lib/digest/read.ts
    - src/lib/digest/run.ts
    - src/app/api/digest/run/route.ts
    - src/server-actions/digest.ts
  modified: []

key-decisions:
  - "getDailyDigestNews degrades on EVERY query error, not just 42P01/42703 — a news problem must never kill the portfolio digest, matching the refresh-tail failure-isolation rationale already used for alerts."
  - "runDailyDigest pre-checks notifications_outbox for existing dedupe_key rows BEFORE the per-user loop to report an honest skippedDuplicate count; documented as best-effort bookkeeping layered on top of the DB partial-unique-index, which remains the actual correctness guarantee (enqueueNotifications' ignoreDuplicates upsert is otherwise silent about duplicates)."
  - "composeDigestForUser only passes a non-null totalCurrentValue/totalDayChange when at least one holding is actually status:'priced' — never renders a 0 total as if it were a real price, matching DGST-01's honest-pending requirement."
  - "sendTestDigest enqueues with dedupeKey: null so a one-off test send always goes through even after the day's real digest already fired — matches the digest_preferences migration's documented null-dedupe-key precedent from alerts_telegram.sql."

patterns-established:
  - "src/lib/digest/run.ts mirrors src/lib/alerts/sweep.ts's discipline exactly: admin client always passed in, never constructed; sequential per-user loop (never Promise.all); enqueue-then-report ordering."

requirements-completed: [DGST-01, DGST-02]

# Metrics
duration: 20min
completed: 2026-07-17
---

# Phase 07 Plan 03: Digest I/O Layer Summary

**runDailyDigest cross-user sweep + secret-guarded /api/digest/run cron route + setDigestEnabled/sendTestDigest Server Actions, composing 07-02's pure message builder through the Phase-5 outbox with a Phase-6 news seam that degrades honestly while the news schema is unapplied.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-17T16:36:00-05:00
- **Completed:** 2026-07-17T16:56:02-05:00
- **Tasks:** 3
- **Files modified:** 5 created (+ 1 gitignored `.env.local` placeholder, not committed)

## Accomplishments
- `getDailyDigestNews` — the ONLY Phase-6 coupling point in Phase 7, reading `news_item_instruments`/`news_items` by table name (never importing `src/lib/news/*`), de-duplicating an article matched to multiple held/watched instruments down to one appearance, sorted newest-first, capped at 5, degrading to `{items:[],degraded:true}` on any query error (not just the specific 42P01/42703 codes)
- `getDigestPreference` — cookie-bound own-row read of `digest_preferences`, honest `enabled:false` when no row exists
- `composeDigestForUser` — the single shared compose path (account resolve → `getPortfolioPnL` → `getWatchlist` union → `getDailyDigestNews` over the last 24h → `selectTopMovers`/`buildDailyDigestMessage` from 07-02) used by BOTH the sweep and the test-send action, so they can never drift into different message framing
- `runDailyDigest` — the cross-user sweep: loads all `enabled=true` preferences, batch-filters to `status='linked'` Telegram users (skipping+counting the rest), pre-checks today's dedupe keys for an honest `skippedDuplicate` count, then per-user try/catch composes+enqueues sequentially (never `Promise.all`), returning `{considered, enqueued, skippedUnlinked, skippedDuplicate, failed, newsDegraded}`
- `POST /api/digest/run` — structurally cloned from `/api/notifications/dispatch`: `isAuthorizedRefreshRequest` guard against `DIGEST_RUN_SECRET` runs BEFORE `createAdminClient()`, then `runDailyDigest` + `dispatchOutbox`, honest counts returned, confirmed present in `npm run build`'s route table
- `setDigestEnabled`/`sendTestDigest` Server Actions — cookie-bound own-row upsert for the toggle; the test-send action auth-gates via `getUser()`, inline-errors on an unlinked Telegram account, composes via the shared path, enqueues with `dedupeKey: null` (bypasses the daily bucket by design), dispatches, and reports honest counts — declared as real async functions, no bare re-exports (the alerts.ts Rule-3 bundler trap avoided from the start)
- `DIGEST_RUN_SECRET` added as a labeled placeholder in gitignored `.env.local`, kept separate from `PRICE_REFRESH_SECRET`/`NOTIFY_DISPATCH_SECRET` for independent rotation

## Task Commits

Each task was committed atomically:

1. **Task 1: getDailyDigestNews seam + getDigestPreference read** - `978f405` (feat)
2. **Task 2: runDailyDigest orchestration sweep** - `eab0b8a` (feat)
3. **Task 3: /api/digest/run route + digest Server Actions + env placeholder** - `204ebfa` (feat)

**Plan metadata:** (this commit) `docs(07-03): complete digest I/O layer plan`

## Files Created/Modified
- `src/lib/digest/news.ts` - `getDailyDigestNews(admin, instrumentIds, sinceIso)`, the narrow Phase-6 seam
- `src/lib/digest/read.ts` - `getDigestPreference(supabase, userId)`, cookie-bound own-row read
- `src/lib/digest/run.ts` - `composeDigestForUser` + `runDailyDigest`, admin client passed in, never built
- `src/app/api/digest/run/route.ts` - secret-guarded cron/manual entry point
- `src/server-actions/digest.ts` - `setDigestEnabled` + `sendTestDigest`
- `.env.local` (gitignored, not committed) - `DIGEST_RUN_SECRET` placeholder added

## Decisions Made
- News-seam error handling degrades on ANY error (not a narrow 42P01/42703-only check) — a news outage or an unanticipated schema drift must never take down the portfolio-only digest.
- `skippedDuplicate` is deliberately documented as best-effort: the real guarantee is the DB partial unique index on `dedupe_key`; the pre-check select is only there to make the sweep's own summary counts honest, not to be the enforcement mechanism.
- `baseCurrency` from `investment_accounts.base_currency` is cast to the `Currency` type with an `'INR'` fallback when unset, matching the existing dashboard default-currency precedent rather than introducing a new default rule.

## Deviations from Plan

None - plan executed exactly as written. All five files match the plan's specified shapes (types, exports, query structure, guard ordering) with no Rule 1-4 triggers encountered.

## Issues Encountered
- A concurrent Phase 6 executor (06-08, `src/lib/news/fetch-news.ts`) had files staged in the shared git index between Task 2 and Task 3's commits (visible in `git log --oneline`: `098a501`/`ae3cb71` land between `eab0b8a` and `204ebfa`). Every task commit in this plan used an explicit trailing pathspec and was verified atomic via `git show HEAD --stat` immediately after — no cross-contamination on any of the three commits.
- The plan's own illustrative comment text (`` `export { } from` ``) in an early draft of `src/server-actions/digest.ts`'s header would have false-matched the verify grep `grep -n "export {"` even though it was inside a comment, not a real re-export. Reworded the comment to avoid the substring before committing; the actual verify grep returns nothing.

## Next Phase Readiness
- `runDailyDigest` + `/api/digest/run` + `setDigestEnabled`/`sendTestDigest` all exist, `tsc`/`build` clean, `/api/digest/run` confirmed in the build's route table.
- `sendTestDigest` is the only locally-verifiable live path (the cron route is deploy-gated, same treatment as `price_refresh_cron.sql`/`alerts_telegram.sql`'s webhook) — ready for 07-04's UI wiring and 07-05's live verification checkpoint.
- Live behavior (real enqueue/dispatch, cron POST, Phase-6 news rows actually present) remains explicitly DEFERRED to 07-05, consistent with every prior phase's live-verification checkpoint precedent — Phase 6 has not yet executed/applied its migration, so live news inclusion cannot be exercised yet; the seam is proven to degrade honestly in its absence.

---
*Phase: 07-daily-digest*
*Completed: 2026-07-17*

## Self-Check: PASSED

All created files and commit hashes verified present:
- FOUND: src/lib/digest/news.ts
- FOUND: src/lib/digest/read.ts
- FOUND: src/lib/digest/run.ts
- FOUND: src/app/api/digest/run/route.ts
- FOUND: src/server-actions/digest.ts
- FOUND: .planning/phases/07-daily-digest/07-03-SUMMARY.md
- FOUND: 978f405, eab0b8a, 204ebfa
