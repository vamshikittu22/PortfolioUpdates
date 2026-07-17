---
phase: 06-news-pipeline
plan: 07
subsystem: notifications
tags: [telegram, outbox, news, alerts, html-escaping, dedupe, supabase]

# Dependency graph
requires:
  - phase: 06-news-pipeline
    provides: "news_items schema (headline/summary/importance/summary_status) + news_item_instruments join table (06-01)"
  - phase: 05-alerts-telegram
    provides: "notifications_outbox schema + enqueueNotifications/dispatchOutbox engine + escapeHtml/buildPriceAlertMessage conventions + the news_alert:{userId}:{urlHash} dedupe-key shape prescribed at evaluate.ts:102"
provides:
  - "buildNewsAlertMessage — pure HTML parse_mode news-alert message builder (escaped, href-hardened, 4096-truncated)"
  - "computeNewsAlertDedupeKey — permanent (non-time-bucketed) news_alert:{userId}:{urlHash} idempotency key"
  - "sweepNewsAlerts(admin) — cross-user sweep: recent High-importance summarized news matched to genuinely-held instruments -> pre-rendered news_alert outbox rows"
affects: [06-09 (route composing sweepNewsAlerts + dispatchOutbox), 06-10 (live-verify checkpoint)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Permanent (non-time-bucketed) dedupe key for one-shot-forever notifications, contrasted with computeAlertDedupeKey's cooldown-window bucket key"
    - "Enqueue-only sweep with zero schema state (no stamping step) — the dedupe key alone is the idempotence contract"
    - "Attribute-context hardening: strip literal quote characters from an interpolated URL before placing it inside an href=\"...\" attribute, in addition to the shared escapeHtml text-node escaping"

key-files:
  created:
    - src/lib/news/build-news-message.ts
    - src/lib/news/alert-sweep.ts
    - scripts/news-alert-test.ts
  modified: []

key-decisions:
  - "candidates (the NewsAlertSweepResult field) counts qualifying NEWS ITEMS (recent, summarized, High-importance, matched to >=1 instrument), not (item, user) pairs — the plan's signature left this ambiguous and this is the more natural reading of the word."
  - "A missing/null news_items.source defaults to '' rather than a fabricated placeholder like 'Unknown source' — an honest empty anchor text over an invented one."
  - "Symbols in the alert message are the sorted intersection of the article's matched instruments and the user's held instruments, not all matched instruments — a user should never see a ticker in an alert they don't actually hold."

patterns-established:
  - "News-alert sweeps (any future kind reusing this shape) should default to permanent dedupe keys unless a real cooldown/repeat-fire concept exists for that kind."

requirements-completed: [ALRT-04]

# Metrics
duration: 12min
completed: 2026-07-17
---

# Phase 06 Plan 07: News Alert Sweep Summary

**Pure HTML news-alert message builder + permanent url-hash dedupe key, and a cross-user admin sweep that matches High-importance summarized news to genuinely-held instruments and enqueues pre-rendered `news_alert` outbox rows with zero schema state.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-17T21:39:00Z (approx, first commit 16:39:43 local)
- **Completed:** 2026-07-17T21:44:06Z (local commit timestamp, final task commit)
- **Tasks:** 2
- **Files modified:** 3 (all created)

## Accomplishments
- `buildNewsAlertMessage` composes the `📰 <b>{symbols}</b>: {headline}` / optional why-it-matters line / `<a href="{url}">{source}</a>` HTML message, escaping every external field (symbols, headline, whyItMatters, source) via the shared `@/lib/telegram/build-message` `escapeHtml`, additionally stripping literal `"` from the URL before it lands inside the `href` attribute, and truncating to Telegram's 4096-char limit.
- `computeNewsAlertDedupeKey` produces the exact `news_alert:{userId}:{urlHash}` shape prescribed at `src/lib/alerts/evaluate.ts:102` — permanent (no time bucket), so one article can never re-notify the same user, ever, with zero additional schema state.
- `sweepNewsAlerts(admin)` clones `src/lib/alerts/sweep.ts`'s structural discipline: loads recent (48h) `summarized`/`High` news items joined to `news_item_instruments`, derives each user's genuinely-held instruments across all their accounts via `deriveHoldings` (net quantity > 0 only), and for every (item, user) intersection pre-renders the message and calls `enqueueNotifications` with `kind: 'news_alert'` — enqueue-only, no dispatch, no cooldown stamp.
- `scripts/news-alert-test.ts` proves the pure functions under `node:assert/strict`: escaping order (`&` before `<`/`>`, no double-escape), the "no orphan blank line" whyItMatters branch, href quote-stripping, exact 4096-char truncation, and dedupe-key shape/determinism/uniqueness. `npm run test:news-alert` is green.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure message builder + dedupe key (tested)** - `05bce5e` (feat)
2. **Task 2: sweepNewsAlerts — cross-user significant-news enqueue** - `c5fc0ba` (feat)

**Deferred-items log:** `f946bcf` (docs — logged a transient sibling-executor tsc/build error, out of scope, not a task commit)

**Plan metadata:** (this SUMMARY.md commit, made separately per the no-bookkeeping-in-executor rule for STATE/ROADMAP/REQUIREMENTS)

_Note: neither task used TDD (this is an execute-type plan); Task 1's implementation and its test were written and committed together as one `feat` commit per the plan's explicit instruction._

## Files Created/Modified
- `src/lib/news/build-news-message.ts` - Pure `buildNewsAlertMessage` + `computeNewsAlertDedupeKey`, reusing `escapeHtml` from `@/lib/telegram/build-message`
- `src/lib/news/alert-sweep.ts` - `sweepNewsAlerts(admin)`, the cross-user news→outbox enqueue sweep
- `scripts/news-alert-test.ts` - `node:assert/strict` proof of both pure functions (7 case groups)

## Decisions Made
- `NewsAlertSweepResult.candidates` counts qualifying news items (not item×user pairs) — documented in the return type's JSDoc since the plan's prose was ambiguous on this point.
- `source` defaults to `''` (not a fabricated string) when `news_items.source` is null — matches the house rule against fabricated display values.
- Displayed symbols in a given alert are the sorted intersection of the article's matched instruments and that specific user's held instruments (never the full matched set) — a user only ever sees tickers they actually hold.

## Deviations from Plan

None — plan executed exactly as written. All five `must_haves.truths` and both `artifacts` entries are satisfied as specified; no architectural changes, no missing dependencies, no bugs required fixing beyond normal first-pass implementation.

## Issues Encountered

- Transient sibling-executor `tsc`/`npm run build` type-check failure (`scripts/digest-compose-test.ts` missing `buildDailyDigestMessage` from `src/lib/digest/compose.ts`) was observed during both verification runs. Traced to the concurrently-running 07-02 executor's own in-flight TDD RED state on a completely disjoint file — confirmed via grep that no error referenced any of this plan's three files, and `npm run build`'s Next.js compile phase itself reached "Compiled successfully" before failing only on the unrelated sibling type-check. Logged to `.planning/phases/06-news-pipeline/deferred-items.md` (commit `f946bcf`), not fixed, per the executor scope-boundary rule.

## User Setup Required

None - no external service configuration required. Live delivery (real Telegram send of a `news_alert` row) is exercised at the 06-10 checkpoint, same deferral pattern as every other Phase 5/6 delivery-path plan this session.

## Next Phase Readiness
- `sweepNewsAlerts` + `dispatchOutbox` composition is ready for 06-09's route to wire together (mirrors how `refreshAllPrices` composes `evaluateAndEnqueueAlerts` + `dispatchOutbox`).
- No migration was added or needed by this plan — `kind: 'news_alert'` was already pre-enumerated in both the TS union (`notifications/types.ts`) and the SQL CHECK (05-01's migration), confirmed via `git show --stat` on both commits (only this plan's three files touched, zero `supabase/migrations/*` changes).
- No blockers for 06-08/06-09/06-10.

---
*Phase: 06-news-pipeline*
*Completed: 2026-07-17*

## Self-Check: PASSED

- FOUND: src/lib/news/build-news-message.ts
- FOUND: src/lib/news/alert-sweep.ts
- FOUND: scripts/news-alert-test.ts
- FOUND: .planning/phases/06-news-pipeline/06-07-SUMMARY.md
- FOUND: commit 05bce5e (Task 1)
- FOUND: commit c5fc0ba (Task 2)
- FOUND: commit f946bcf (deferred-items.md log)
