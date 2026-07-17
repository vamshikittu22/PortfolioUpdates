---
phase: 06-news-pipeline
plan: 03
subsystem: news
tags: [regex, matching, pure-function, tdd, news-pipeline]

# Dependency graph
requires:
  - phase: 06-news-pipeline
    provides: seed instrument shape (symbol + display name) established in earlier phases' instruments table
provides:
  - "matchInstruments(text, candidates) — case-sensitive whole-token symbol matching + case-insensitive full-phrase company-name matching, false-positive traps regression-pinned"
  - "stripCompanySuffixes(name) — legal-suffix-stripping helper, exported for reuse by 06-08's Google News query builder"
affects: [06-04, 06-05, 06-06, 06-07, 06-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Custom regex lookaround boundaries `(?<![A-Za-z0-9])...(?![A-Za-z0-9])` instead of bare `\\b` for symbol/name token matching — avoids `\\b` misfiring next to non-word characters in symbols like M&M, BAJAJ-AUTO, BRK.B"
    - "Pure matcher: string + candidates in, matches out, zero I/O — mirrors src/lib/alerts/evaluate.ts's shape"

key-files:
  created:
    - src/lib/news/match.ts
    - scripts/news-match-test.ts
  modified: []

key-decisions:
  - "Declared a local MatchCandidate/InstrumentMatchResult type in match.ts rather than importing from src/lib/news/types.ts, per plan's explicit wave-1 file-isolation requirement (that file is owned by the concurrently-running 06-02 plan)"
  - "Symbol rule wins matchedVia label when both symbol and company-name rules hit the same candidate — one result per candidate max, matching the plan spec exactly"

patterns-established:
  - "Legal-suffix stripping (Ltd/Limited/Inc/Incorporated/Corp/Corporation/Plc/Co/Company + dangling '&'/periods/commas) repeated until stable, exported for downstream query-building reuse"

requirements-completed: [NEWS-02]

# Metrics
duration: 8min
completed: 2026-07-17
---

# Phase 06 Plan 03: Word-boundary/company-name instrument matcher Summary

**Pure `matchInstruments` function distinguishing case-sensitive whole-token ticker-symbol hits from case-insensitive full-phrase company-name hits, with the exact false-positive traps (INFYX, reinfy, attics, lowercase infy, "Lt. Governor", M&M's ampersand, partial "Tata" vs "Tata Motors") regression-pinned via TDD.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-17 (session start, exact timestamp not captured before first tool call)
- **Completed:** 2026-07-17T21:31:52Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2 (both newly created)

## Accomplishments
- `src/lib/news/match.ts` — `matchInstruments(text, candidates)`: per-candidate symbol rule (case-sensitive, custom lookaround boundaries, regex-escaped) checked first, then company-name rule (case-insensitive, full-phrase, legal-suffix-stripped, min-length-3 guarded) as fallback; at most one result per candidate, symbol wins the `matchedVia` label when both hit.
- `stripCompanySuffixes(name)` exported as a standalone helper (repeats suffix/punctuation stripping until stable) for reuse by 06-08's Google News query builder.
- `scripts/news-match-test.ts` — 9 case groups + a `stripCompanySuffixes` direct-coverage group, all using `node:assert/strict`, pinning every false-positive trap named in the plan's `must_haves.truths`.

## Task Commits

Each task was committed atomically (TDD RED then GREEN):

1. **Task 1 RED** - `5bac6bc` (test) — `scripts/news-match-test.ts`, confirmed failing (module missing) before GREEN.
2. **Task 1 GREEN** - `5c768a6` (feat) — `src/lib/news/match.ts`, all 9 test case groups pass, `npx tsc --noEmit` clean.

**Plan metadata:** committed separately as a SUMMARY-only commit (see below).

_No REFACTOR commit needed — GREEN implementation matched the plan's specified shape on the first pass._

## Files Created/Modified
- `src/lib/news/match.ts` - `matchInstruments` (symbol + company-name matching) and exported `stripCompanySuffixes` helper; local `MatchCandidate`/`InstrumentMatchResult` types (no import from the concurrently-written `src/lib/news/types.ts`)
- `scripts/news-match-test.ts` - node:assert/strict proof, 9 case groups + suffix-stripping coverage, run via `npx tsx scripts/news-match-test.ts` (also now registered as `npm run test:news-match` once the concurrent 06-02 executor landed `package.json`)

## Decisions Made
- Followed the plan's exact regex construction (`(?<![A-Za-z0-9])...(?![A-Za-z0-9])` custom lookarounds, no `'i'` flag for symbols, `'i'` flag + `\s+` whitespace normalization for names) verbatim — no deviation from the specified implementation shape.
- Test candidates modeled on the real seed instruments named in the plan (INFY/Infosys Ltd, TCS/Tata Consultancy Services Ltd, LT/Larsen & Toubro Ltd, M&M/Mahindra & Mahindra Ltd, AAPL/Apple Inc, TSLA/Tesla Inc), plus two test-scoped extra candidates (Tata Motors Ltd for the full-phrase case, a synthetic 2-char-stripped-name candidate for the min-length guard case) added only to the specific test functions that need them, so they can't contaminate other case groups.

## Deviations from Plan

None — plan executed exactly as written. The GREEN implementation matches the plan's prescribed regex construction, suffix list, and matching precedence verbatim; no Rule 1-4 auto-fixes were needed.

## Issues Encountered

None. `npm run test:news-match` was not yet registered in `package.json` when Task 1 began (06-02, the concurrent package.json owner, had not landed it yet) — ran `npx tsx scripts/news-match-test.ts` directly per the plan's own fallback instruction. By the time this plan's work was verified, 06-02 had landed `package.json` with `test:news-match` already registered; re-ran via `npm run test:news-match` to confirm it also passes through the npm script path. `src/lib/news/` already contained 06-02's concurrently-written `types.ts` and `dedupe.ts` when this plan started — neither was read, imported from, nor modified, preserving wave-1 file isolation. An untracked `.planning/phases/06-news-pipeline/deferred-items.md` from a concurrent executor was observed but left untouched (not this plan's file).

## User Setup Required

None - no external service configuration required. This is a pure, zero-I/O function.

## Next Phase Readiness
- `matchInstruments`/`stripCompanySuffixes` are ready for later Phase 6 plans (ingest/dedupe/matching wiring, 06-08's query builder) to import from `src/lib/news/match.ts`.
- `npx tsc --noEmit` clean project-wide at time of this plan's completion (confirmed after both commits landed alongside the concurrent 06-01/06-02 work).
- No blockers for downstream plans; the false-positive traps most likely to bite a naive matcher (case-insensitive symbol collisions, boundary misfires next to `&`/`.`, partial company-name matches) are now regression-pinned.

---
*Phase: 06-news-pipeline*
*Completed: 2026-07-17*

## Self-Check: PASSED

- FOUND: src/lib/news/match.ts
- FOUND: scripts/news-match-test.ts
- FOUND: .planning/phases/06-news-pipeline/06-03-SUMMARY.md
- FOUND: commit 5bac6bc (test RED)
- FOUND: commit 5c768a6 (feat GREEN)
