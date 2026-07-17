---
phase: 07-daily-digest
plan: 02
subsystem: notifications
tags: [telegram, html-messaging, date-bucketing, tdd, pure-functions]

# Dependency graph
requires:
  - phase: 05-alerts-telegram
    provides: "escapeHtml (src/lib/telegram/build-message.ts) — the single HTML text-node escaper, reused verbatim, never re-implemented"
  - phase: 07-daily-digest (07-01)
    provides: "kind='daily_digest' pre-enumerated in the notifications_outbox CHECK constraint, matching this plan's computeDigestDedupeKey prefix"
provides:
  - "istDateKey(now) — fixed UTC+5:30 IST calendar-date bucketing, no DST/timezone library, proven at the exact 18:30:00Z midnight rollover including a year boundary"
  - "computeDigestDedupeKey(userId, now) — daily_digest:{userId}:{istDate}, the once-per-day idempotency key for the outbox partial unique index"
  - "selectTopMovers(holdings, n) — priced-only, honest exclusion of pending/failed-price holdings, absolute-value-descending sort with sign preserved"
  - "buildDailyDigestMessage(input) — single HTML-parse-mode digest message: total value, signed day P&L, top movers, day's news, honest empty/degraded states, whole-item news truncation that never cuts mid-tag"
  - "npm run test:digest-compose — registered, 16 case groups, node:assert/strict"
affects: [07-03, 07-04, 07-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fixed-offset timezone math (no Intl/tz-database) for deterministic date bucketing across environments"
    - "Whole-item truncation loop (build skeleton, then append lines one-at-a-time within budget) as the safe alternative to naive slice() for multi-item HTML messages"

key-files:
  created:
    - src/lib/digest/types.ts
    - src/lib/digest/compose.ts
    - scripts/digest-compose-test.ts
  modified:
    - package.json

key-decisions:
  - "istDateKey uses new Date(now.getTime() + 5.5*3600*1000).toISOString().slice(0,10) — fixed offset only, since IST has no DST; avoids any Intl/timezone-database dependency and stays fully deterministic in tests and prod alike."
  - "buildDailyDigestMessage's truncation algorithm deliberately diverges from buildPriceAlertMessage's naive slice(0,4096): it builds the non-news skeleton (header/snapshot/fx-note/movers) first, then appends news lines one WHOLE line at a time only while they fit the remaining budget, so truncation can only ever drop entire news items and never lands mid-<b>-tag (which would 400 the whole Telegram send)."
  - "Snapshot rendering has three honest branches (no holdings / prices pending / priced-with-total) rather than ever defaulting a missing total to 0, matching the house 'never fabricate a value' rule already used in evaluateAlerts."

patterns-established:
  - "Digest composition module (src/lib/digest/) mirrors src/lib/alerts/'s pure-core shape: types.ts declarations-only, compose.ts pure logic with zero I/O, a single node:assert/strict script proving it, injectable `now` everywhere."

requirements-completed: [DGST-01]

# Metrics
duration: 7min
completed: 2026-07-17
---

# Phase 07 Plan 02: Digest Composition Core Summary

**Pure TDD-proven digest composition: fixed-offset IST date bucketing with an 18:30Z midnight rollover, honest priced-only top-mover selection, and an HTML digest message builder whose truncation algorithm only ever drops whole news items — never cuts mid-tag like a naive `slice()` would.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-07-17T16:38:33-05:00
- **Completed:** 2026-07-17T16:45:07-05:00
- **Tasks:** 2 TDD tasks (4 sub-commits: RED/GREEN each)
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- `istDateKey`/`computeDigestDedupeKey` give the outbox its once-per-day idempotency bucket, proven at the exact 18:30:00Z IST rollover instant (including a 31-Dec→1-Jan year rollover)
- `selectTopMovers` excludes pending/failed-price holdings honestly rather than fabricating a 0% mover, sorted by absolute-value with sign preserved
- `buildDailyDigestMessage` renders the complete DGST-01 message (total, signed day P&L, movers, news) with every externally-sourced string escaped via the existing `escapeHtml`, honest empty/degraded states for every missing-data case, and a whole-item truncation algorithm proven never to exceed 4096 chars or cut mid-tag even with 50 oversized news items
- `npm run test:digest-compose` registered as the sole wave-1 package.json change for Phase 7, per the taken-script-name list in 07-RESEARCH.md

## Task Commits

Each task was committed atomically as RED then GREEN:

1. **Task 1 RED: failing istDateKey/computeDigestDedupeKey/selectTopMovers tests** - `f1217ff` (test)
2. **Task 1 GREEN: implement IST date bucket, digest dedupe key, top movers** - `4fb7444` (feat)
3. **Task 2 RED: failing buildDailyDigestMessage tests** - `39e56b6` (test)
4. **Task 2 GREEN: implement digest HTML message builder with whole-item truncation** - `24d3fc9` (feat)

**Plan metadata:** (this commit) `docs(07-02): complete digest composition plan`

## Files Created/Modified
- `src/lib/digest/types.ts` - `DigestHoldingInput`/`DigestNewsItem`/`DigestMessageInput` declarations-only shared vocabulary
- `src/lib/digest/compose.ts` - `istDateKey`, `computeDigestDedupeKey`, `selectTopMovers`, `buildDailyDigestMessage`, all pure/zero-I/O
- `scripts/digest-compose-test.ts` - 16 case groups over node:assert/strict, injectable `now` throughout, house style matching `scripts/alerts-eval-test.ts`
- `package.json` - registered `test:digest-compose`

## Decisions Made
- Fixed UTC+5:30 offset arithmetic for `istDateKey` rather than `Intl.DateTimeFormat` with an IANA zone — IST has no DST, so the fixed offset is simpler, has zero timezone-database dependency, and is trivially deterministic in any Node build.
- Truncation loop appends whole news lines within budget rather than reusing `buildPriceAlertMessage`'s `slice()` — documented inline in `compose.ts` with the exact Telegram 400 "can't parse entities" failure mode this avoids (07-RESEARCH.md Pitfall 3).
- Every "missing data" branch (no holdings, prices pending, fx unavailable, no/degraded news) renders explicit honest wording rather than defaulting to a fabricated number or silently omitting the section.

## Deviations from Plan

None — plan executed exactly as written. Both TDD tasks followed RED (module/function missing → test run fails) then GREEN (implementation added → test run passes) with `npx tsc --noEmit` clean at completion.

## Issues Encountered
- A concurrent Phase 6 executor (06-07) observed this plan's genuine in-flight TDD RED state (`buildDailyDigestMessage` not yet exported) during its own `tsc` verification and correctly logged it as an out-of-scope transient sibling error in `.planning/phases/06-news-pipeline/deferred-items.md` (commit `f946bcf`) rather than fixing it — no action needed on this plan's side; the function was implemented and committed GREEN (`24d3fc9`) shortly after.
- One transient unrelated `tsc` error was observed mid-execution in `scripts/news-parse-test.ts` (`Cannot find module '../src/lib/news/parse-feeds'`), caused by another concurrent Phase 6 executor's in-flight file — out of scope for this plan, not fixed, and had resolved on its own by the final `tsc --noEmit` check.

## Next Phase Readiness
- `src/lib/digest/{types,compose}.ts` are ready for 07-03's orchestration layer to import directly — `computeDigestDedupeKey`/`istDateKey` for the outbox enqueue, `selectTopMovers` over real holdings, `buildDailyDigestMessage` fed with real snapshot/news data.
- No blockers. `src/lib/digest/*` imports nothing from `src/lib/news/` and performs zero I/O, confirmed by grep and by this plan's own test running with no network/DB dependency.

---
*Phase: 07-daily-digest*
*Completed: 2026-07-17*

## Self-Check: PASSED

All created files and commit hashes verified present:
- FOUND: src/lib/digest/types.ts
- FOUND: src/lib/digest/compose.ts
- FOUND: scripts/digest-compose-test.ts
- FOUND: .planning/phases/07-daily-digest/07-02-SUMMARY.md
- FOUND: f1217ff, 4fb7444, 39e56b6, 24d3fc9
