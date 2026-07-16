---
phase: 05-alerts-telegram
plan: 03
subsystem: alerts
tags: [typescript, pure-functions, tdd, node-assert, alert-evaluation, idempotency]

# Dependency graph
requires:
  - phase: 03-prices-pnl
    provides: "the src/lib/prices/ zero-I/O pure-module + node:assert/strict test-script layout (ingest.ts / price-pnl-test.ts) this plan mirrors exactly"
provides:
  - "evaluateAlerts(alerts, pricesByInstrument, now) — the level+cooldown trigger rule with null/failed-price exclusion and strict direction boundaries, the honesty-critical core every later Phase 5 plan composes"
  - "computeAlertDedupeKey(alert, now) — the deterministic cooldown-window bucket key backing ALRT-05's idempotent outbox enqueue"
  - "isCooldownElapsed(lastTriggeredAt, cooldownMinutes, now) — the cooldown predicate, exported and directly unit-tested"
  - "src/lib/alerts/types.ts — shared alert-domain vocabulary (AlertDirection, AlertEvalRow, PriceSnapshot, TriggeredAlert) for 05-05's Supabase orchestration to consume"
affects: [05-alerts-telegram (05-05 evaluate-and-enqueue sweep is the direct consumer), 06-news-pipeline (dedupe_key column-design precedent), 07-daily-digest (dedupe_key column-design precedent)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Level+cooldown alert evaluation (not edge detection) — a pure function reading only an injected `now`, no clock, no I/O, mirroring src/lib/prices/ingest.ts's shape exactly."
    - "Never-fabricate-a-value discipline applied to alerting: null price AND fetch_error-flagged price are both excluded BEFORE the threshold comparison runs, not merged into it."
    - "Deterministic dedupe-window bucket key (price_alert:{id}:{floor(epoch/(cooldown*60))}) as a reusable idempotency-backstop shape for future outbox kinds."

key-files:
  created:
    - src/lib/alerts/types.ts
    - src/lib/alerts/evaluate.ts
    - scripts/alerts-eval-test.ts
  modified: []

key-decisions:
  - "isCooldownElapsed and computeAlertDedupeKey both exported (not kept private) so 05-05's sweep and this plan's own test script can unit-test/reuse them directly, matching ingest.ts's export-everything-testable style."
  - "Fetch-error exclusion checked strictly before the threshold comparison (never merged into one boolean) so the null/failed-price rule reads as an unambiguous early-exit gate, matching the plan's eyeball-verification requirement."

patterns-established:
  - "Pure alert-domain module pair (types.ts + evaluate.ts) with a single node:assert/strict test script, zero jest/vitest dependency — same house pattern as price-pnl-test.ts and import-primitives-test.ts."

requirements-completed: [ALRT-02, ALRT-03]

# Metrics
duration: 6min
completed: 2026-07-16
---

# Phase 5 Plan 03: Pure Alert Evaluation Core Summary

**`evaluateAlerts`/`computeAlertDedupeKey` in `src/lib/alerts/evaluate.ts` — the token-free, DB-free level+cooldown trigger rule and cooldown-window dedupe-key generator, TDD'd through 15 case groups under `node:assert/strict`.**

## Performance

- **Duration:** ~6 min
- **Tasks:** 2 (both TDD: RED+GREEN, no REFACTOR needed)
- **Files modified:** 3 (all created)

## Accomplishments
- `src/lib/alerts/types.ts` — the shared alert-domain vocabulary (`AlertDirection`, `AlertEvalRow`, `PriceSnapshot`, `TriggeredAlert`), declarations-only, zero I/O.
- `evaluateAlerts(alerts, pricesByInstrument, now)` — for each alert: skips inactive alerts, skips instruments with no price-map entry, skips `price === null` (never-fetched), skips `fetchError !== null` (last refresh failed — never alert on a knowingly-stale value), applies a strict direction comparison (`above`: `price > threshold`; `below`: `price < threshold`; exactly-equal never fires), then gates on `isCooldownElapsed`. Pure — reads only the injected `now`, never calls `Date.now()` internally.
- `isCooldownElapsed(lastTriggeredAt, cooldownMinutes, now)` — `true` if never-triggered (`null`) or strictly more than `cooldownMinutes * 60_000` ms have elapsed.
- `computeAlertDedupeKey(alert, now)` — `price_alert:{alert.id}:{floor(epoch_seconds/(cooldownMinutes*60))}`, proven identical within one cooldown window (crash-recovery re-enqueue dedupes via `uniq_notifications_outbox_dedupe`) and different across window boundaries and alert ids.
- `scripts/alerts-eval-test.ts` — 15 case groups covering all of the above, including the exact-threshold boundary, is_active gating, cooldown gating (both directions), null-price exclusion, fetch_error exclusion, missing price-map entries, a multi-alert/multi-instrument sweep, and all four dedupe-key properties from the plan.

## Task Commits

Each task was committed atomically (TDD: test → feat per task, no refactor needed):

1. **Task 1: types + evaluateAlerts (RED)** - `4d5ce8d` (test) — confirmed RED (module not found for `evaluate.ts`)
2. **Task 1: types + evaluateAlerts (GREEN)** - `38eac34` (feat) — 11/11 case groups pass
3. **Task 2: computeAlertDedupeKey (RED)** - `6f13857` (test) — confirmed RED (`computeAlertDedupeKey is not a function`)
4. **Task 2: computeAlertDedupeKey (GREEN)** - `d1d7080` (feat) — 15/15 case groups pass

_Note: no plan-metadata commit yet — this SUMMARY/STATE/ROADMAP update is the final commit for this plan, made after this file is written._

## Files Created/Modified
- `src/lib/alerts/types.ts` - `AlertDirection`/`AlertEvalRow`/`PriceSnapshot`/`TriggeredAlert`, declarations-only.
- `src/lib/alerts/evaluate.ts` - `isCooldownElapsed`, `evaluateAlerts`, `computeAlertDedupeKey`. Zero I/O, zero DB, zero internal clock reads.
- `scripts/alerts-eval-test.ts` - 15 case groups under `node:assert/strict`, `console.log('PASS')` + `process.exit(0)` on success, matching `price-pnl-test.ts`'s style including the "Do NOT weaken these assertions" header.

## Decisions Made
- Exported `isCooldownElapsed` as its own testable unit (not folded silently into `evaluateAlerts`) so both the test script and 05-05's future sweep can reuse the exact predicate.
- Kept the null-check and fetch-error-check as two separate early-`continue` statements rather than one combined boolean — makes the "excluded BEFORE the threshold comparison" ordering the plan's `<verify>` step calls for structurally obvious on read, not just true by accident of evaluation order.

## Deviations from Plan

None — plan executed exactly as written. `package.json` was correctly left untouched (its `test:alerts` script registration is 05-02's scope per the plan's explicit instruction); this plan verified via direct `npx tsx scripts/alerts-eval-test.ts` invocation throughout, as specified.

## Issues Encountered

**Parallel-executor git-index race (environment-flagged risk, materialized once):** the first commit (`git commit -m ...` with no pathspec, immediately after `git add scripts/alerts-eval-test.ts src/lib/alerts/types.ts`) swept in `package.json` and `scripts/telegram-logic-test.ts` from the concurrently-running 05-02 executor's shared index, even though only two files were explicitly staged beforehand. Caught immediately via `git show HEAD --stat`, fixed with `git reset --soft HEAD~1` followed by `git reset HEAD package.json scripts/telegram-logic-test.ts` (unstaging only the foreign files, preserving their working-tree content untouched for 05-02 to commit itself) and re-committing with only this plan's two files. Verified via a second `git show HEAD --stat` that only `scripts/alerts-eval-test.ts` and `src/lib/alerts/types.ts` landed. All three subsequent commits in this plan were staged and stat-verified the same way with zero further incidents.

`npx tsc --noEmit` twice surfaced transient errors in `scripts/telegram-logic-test.ts` (missing `src/lib/telegram/*` modules) during this plan's execution — both times confirmed via `grep -i alerts` on the tsc output to be zero references to this plan's files, and both times traced to the concurrently-running 05-02 executor's in-flight TDD RED phase on a fully disjoint file. Not fixed (out of scope per the SCOPE BOUNDARY rule), not logged to `deferred-items.md` (transient parallel-executor state, not a defect — matches the same finding independently made and documented in `05-01-SUMMARY.md`).

## User Setup Required

None - no external service configuration required. This plan has zero DB/network/token dependency by design; nothing is deferred from it.

## Next Phase Readiness

`src/lib/alerts/{types,evaluate}.ts` are complete, pure, and proven under `node:assert/strict` — 05-05 (the evaluate-and-enqueue sweep, Supabase orchestration reading `price_cache` and writing `notifications_outbox`/`price_alerts.last_triggered_at`) can now import `evaluateAlerts`/`computeAlertDedupeKey` directly and compose them with 05-01's schema without touching this plan's files. `npm run test:alerts` will become runnable the moment 05-02 registers it in `package.json` (not a blocker for this plan, which verified entirely via `npx tsx scripts/alerts-eval-test.ts`). No blockers.

---
*Phase: 05-alerts-telegram*
*Completed: 2026-07-16*

## Self-Check: PASSED

- FOUND: src/lib/alerts/types.ts
- FOUND: src/lib/alerts/evaluate.ts
- FOUND: scripts/alerts-eval-test.ts
- FOUND: .planning/phases/05-alerts-telegram/05-03-SUMMARY.md
- FOUND: commit 4d5ce8d (Task 1 RED)
- FOUND: commit 38eac34 (Task 1 GREEN)
- FOUND: commit 6f13857 (Task 2 RED)
- FOUND: commit d1d7080 (Task 2 GREEN)
