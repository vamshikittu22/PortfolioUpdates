---
phase: 05-alerts-telegram
plan: 05
subsystem: alerts
tags: [supabase, admin-client, outbox, telegram, price-alerts, cron, server-actions]

# Dependency graph
requires:
  - phase: 05-alerts-telegram (05-01)
    provides: price_alerts/telegram_links/notifications_outbox schema + claim_due_notifications RPC
  - phase: 05-alerts-telegram (05-03)
    provides: evaluateAlerts + computeAlertDedupeKey pure evaluation core
  - phase: 05-alerts-telegram (05-04)
    provides: enqueueNotifications + dispatchOutbox retryable outbox engine
  - phase: 05-alerts-telegram (05-02)
    provides: buildPriceAlertMessage HTML message builder
provides:
  - evaluateAndEnqueueAlerts(admin) sweep — loads all active alerts + cached prices, evaluates, enqueue-first + stamps last_triggered_at
  - Both price-refresh entry points now trigger the alert sweep + outbox dispatch at their tail, failure-isolated
affects: [05-09 (live checkpoint — this is what gets exercised end to end)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tail composition at call sites instead of modifying the frozen orchestration function (refreshAllPrices stays untouched; sweep+dispatch composed after it returns)"
    - "Enqueue-first, stamp-second ordering as the crash-recovery/dedupe backstop (two non-transactional statements + dedupe_key unique index)"
    - "Inner try/catch isolates a downstream optional step (alerts) from the primary operation's success/failure (price refresh)"

key-files:
  created:
    - src/lib/alerts/sweep.ts
  modified:
    - src/app/api/prices/refresh/route.ts
    - src/server-actions/prices.ts
    - src/lib/notifications/outbox.ts

key-decisions:
  - "evaluateAndEnqueueAlerts requires an admin client (cross-user reach, same rationale as discoverInstrumentIds) — never a cookie-bound client"
  - "Evaluation reads price_cache, not in-flight fetch results, so the same evaluator works identically whether called from the refresh tail or a standalone dispatch run"
  - "Re-exported DispatchSummary from notifications/outbox.ts (it previously only existed in notifications/types.ts, ungated) so call sites can import both dispatchOutbox and its result type from one module, per the plan's exact import shape"

patterns-established:
  - "Failure-isolated tail composition: a wrapped inner try/catch means a Telegram outage reports as a field in the JSON/action result, never a 500 or thrown Server Action"

requirements-completed: [ALRT-03, ALRT-05]

# Metrics
duration: 12min
completed: 2026-07-16
---

# Phase 5 Plan 5: Alert Sweep + Refresh-Tail Composition Summary

**`evaluateAndEnqueueAlerts` sweep (admin client, enqueue-first) now runs at the tail of both `/api/prices/refresh` and `refreshPricesNow`, dispatching the outbox immediately after, with the alert step fully failure-isolated from the price refresh's own success/failure.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-16T22:41:00Z (approx.)
- **Completed:** 2026-07-16T22:50:00Z
- **Tasks:** 2 completed
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- `src/lib/alerts/sweep.ts` composes 05-02/05-03/05-04's pure/IO layers into one admin-client orchestration function that loads all active alerts + their current cached prices, evaluates, and enqueue-first-then-stamps each trigger
- Both refresh entry points (secret-guarded cron route, auth-gated `refreshPricesNow` Server Action) now evaluate + dispatch alerts immediately after a price refresh completes, with the alert step wrapped so it can never fail the refresh itself
- `refreshAllPrices` (Phase 3's frozen single write path) is byte-for-byte unchanged — confirmed via `git diff` showing only additive tail composition at both call sites
- `refreshPricesNow` now also revalidates `/alerts`; the cron route deliberately adds no `revalidatePath` (outside a render context)

## Task Commits

Each task was committed atomically:

1. **Task 1: evaluateAndEnqueueAlerts sweep (admin, enqueue-first)** - `22de67b` (feat)
2. **Task 2: Piggyback evaluate+dispatch onto both refresh entry points (failure-isolated)** - `963ff45` (feat)

**Plan metadata:** (this commit, docs: complete plan)

_Note: Task 2's commit was made with an explicit pathspec (`git commit ... -- <3 files>`) rather than a broad `git commit` of the full index, because a concurrently running 05-06 executor had its own `src/server-actions/telegram.ts` staged in the shared git index at commit time — `git show HEAD --stat` confirmed only the intended 3 files landed._

## Files Created/Modified
- `src/lib/alerts/sweep.ts` - `evaluateAndEnqueueAlerts(admin)`: loads active `price_alerts` joined to instrument display + `investment_accounts.user_id`, loads matching `price_cache` rows, runs the pure `evaluateAlerts`, and for each trigger pre-renders `buildPriceAlertMessage` then calls `enqueueNotifications` BEFORE updating `last_triggered_at`
- `src/app/api/prices/refresh/route.ts` - after `refreshAllPrices` returns, runs `evaluateAndEnqueueAlerts` + `dispatchOutbox` inside an inner try/catch, folding the result into the JSON response's `alerts` field; no `revalidatePath`
- `src/server-actions/prices.ts` - same tail composition as the cron route, plus `revalidatePath('/alerts')`; return type extended with a required `alerts: RefreshAlertsResult` field on success
- `src/lib/notifications/outbox.ts` - added `export type { DispatchSummary }` re-export (see Deviations)

## Decisions Made
- Composition happens only at the two call sites, not inside `refreshAllPrices` or via a new wrapper function — matches the plan's explicit rationale (05-RESEARCH-schema-outbox: smaller diff, keeps Phase 3's proven write path frozen)
- `evaluateAndEnqueueAlerts`'s enqueue-and-stamp are documented as two separate non-transactional statements; the `dedupe_key` unique index + enqueue-first ordering is the explicit crash-recovery backstop, not a substitute for a transaction

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Re-exported `DispatchSummary` from `src/lib/notifications/outbox.ts`**
- **Found during:** Task 2 (`npx tsc --noEmit` after wiring both refresh entry points)
- **Issue:** The plan's exact spec is `import { dispatchOutbox, type DispatchSummary } from '@/lib/notifications/outbox'`, but `outbox.ts` only imported `DispatchSummary` from `./types` internally without re-exporting it — `tsc` failed with `TS2459: Module declares 'DispatchSummary' locally, but it is not exported` in both new call sites
- **Fix:** Added a one-line `export type { DispatchSummary };` re-export in `outbox.ts`, right after its existing type-only import
- **Files modified:** `src/lib/notifications/outbox.ts`
- **Verification:** `npx tsc --noEmit` clean; `npm run build` compiles
- **Committed in:** `963ff45` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to satisfy the plan's own specified import shape; no scope creep — single-line addition to an existing 05-04 file, no behavior change to `enqueueNotifications`/`dispatchOutbox`.

## Issues Encountered
- A concurrently running 05-06 executor (disjoint files: `src/lib/telegram/{redeem,read}.ts`, `src/server-actions/telegram.ts`, `src/app/api/telegram/webhook/route.ts`) had its own file staged in the shared git index at the moment this plan's Task 2 was ready to commit (`git status --short` showed `A  src/server-actions/telegram.ts` alongside this plan's 3 intended files). Resolved by committing with an explicit pathspec (`git commit -m "..." -- <3 files>`) instead of committing the full index, then confirming via `git show HEAD --stat` that exactly the 3 intended files landed and `telegram.ts` remained staged-but-uncommitted by this plan, as expected (matches the "parallel executor git index race" mitigation from prior sessions).

## User Setup Required
None - no external service configuration required by this plan (live Telegram send/trigger verification remains explicitly deferred to 05-09, matching the plan's own DEFERRED verification section).

## Next Phase Readiness
- The full alert pipeline is now code-complete end to end: schema (05-01) → pure evaluation (05-03) → pure Telegram message/error logic (05-02) → outbox engine (05-04) → this plan's sweep + refresh-tail wiring (05-05). Only the handshake Server Actions (05-06, in progress concurrently) and the `/alerts` UI rewrite (05-08) remain before 05-09's live checkpoint can exercise a real trigger end to end.
- `npx tsc --noEmit` and `npm run build` both clean project-wide as of this plan's final commit.
- Live triggering (a real threshold crossing enqueueing exactly once, a real Telegram delivery, and cooldown suppressing a re-send) is explicitly DEFERRED to 05-09 per this plan's own `<verification>` section — no real bot token or applied migration exists yet in this environment.

---
*Phase: 05-alerts-telegram*
*Completed: 2026-07-16*

## Self-Check: PASSED

All created/modified files confirmed present on disk (`src/lib/alerts/sweep.ts`, `src/app/api/prices/refresh/route.ts`, `src/server-actions/prices.ts`, `src/lib/notifications/outbox.ts`); both task commits (`22de67b`, `963ff45`) confirmed present in `git log --oneline --all`.
