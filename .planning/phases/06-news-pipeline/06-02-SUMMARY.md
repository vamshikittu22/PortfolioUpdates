---
phase: 06-news-pipeline
plan: 02
subsystem: api
tags: [news, dedup, sha256, tdd, npm-scripts, google-genai, fast-xml-parser]

# Dependency graph
requires:
  - phase: 06-news-pipeline
    provides: "06-01: news_items.title_hash column + partial-unique index this plan's dedup key targets"
provides:
  - "src/lib/news/dedupe.ts: normalizeTitle, computeTitleHash, canonicalizeUrl — pure NEWS-02 dedup primitives"
  - "src/lib/news/types.ts: RawNewsItem, NewsSummaryResult, InstrumentMatch — Phase 6 domain types"
  - "package.json: @google/genai + fast-xml-parser deps; all five test:news-* npm scripts registered"
affects: [06-news-pipeline (ingest/dedupe-writer, sweep, and any plan hashing article titles or canonicalizing article URLs)]

# Tech tracking
tech-stack:
  added: ["@google/genai@2.12.0", "fast-xml-parser@5.10.1"]
  patterns:
    - "Pure dedup primitives (no I/O, no Date.now, no randomness) proven RED->GREEN via node:assert/strict, row-hash.ts/alerts-eval-test.ts house style"
    - "Sole wave-1 package.json owner registers ALL of a phase's eventual test:* scripts up front (05-02 precedent), even for files created by later plans"

key-files:
  created:
    - src/lib/news/dedupe.ts
    - src/lib/news/types.ts
    - scripts/news-dedupe-test.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "normalizeTitle strips text after the LAST ' - ' separator for every source (not just Google News) to keep cross-source hashing consistent — accepted false-collapse risk for publisher titles that legitimately contain ' - ', documented in dedupe.ts header"
  - "Apostrophes (straight + curly) are removed (zero-width), not replaced with a space, so possessive/contraction forms (Steel's / Steels) normalize identically; all other punctuation becomes a space"

patterns-established:
  - "title_hash is the PRIMARY cross-source dedup key (Google redirect URLs never equal publisher URLs per 06-RESEARCH-external §2); canonicalizeUrl is a secondary same-feed URL-variant collapse key only"

requirements-completed: [NEWS-02]

# Metrics
duration: 8min
completed: 2026-07-17
---

# Phase 06 Plan 02: News Dedup Primitives + Phase 6 Dependency Bootstrap Summary

**Pure, TDD-proven title-normalization/sha256-hash/URL-canonicalization primitives for cross-source news dedup, plus the sole-wave-1-owner package.json commit installing `@google/genai` + `fast-xml-parser` and registering all five Phase 6 `test:news-*` scripts.**

## Performance

- **Duration:** ~8 min
- **Tasks:** 2 completed (Task 2 is a TDD task: RED + GREEN sub-commits)
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments

- `@google/genai@2.12.0` and `fast-xml-parser@5.10.1` installed alongside (not replacing) the legacy `@google/generative-ai@0.24.1`, which three existing call sites still use — coexistence confirmed by grep-free build success
- All five `test:news-dedupe/match/parse/summarize/alert` npm scripts registered in one atomic commit, ahead of the plans (06-03/04/05/07) that create their target files
- `src/lib/news/dedupe.ts`: `normalizeTitle` (Google News `' - Publisher'` suffix strip, apostrophe collapse, punctuation-to-space, whitespace collapse), `computeTitleHash` (sha256 over the normalized string, `row-hash.ts` precedent), `canonicalizeUrl` (tracking-param + fragment strip, trailing-slash strip, honest trim-only fallback on parse failure — never throws)
- `src/lib/news/types.ts`: `RawNewsItem`, `NewsSummaryResult` (mirrors the `news_items` CHECK constraints), `InstrumentMatch` — a NEW file, leaving the dirty `src/lib/types.ts` (this session's unrelated in-flight mock-era `NewsItem`) completely untouched
- `scripts/news-dedupe-test.ts`: 7 case groups (Google-suffix strip equivalence, hash equality/inequality + 64-char lowercase hex format, punctuation/whitespace/apostrophe normalization, no-separator passthrough, URL canonicalization incl. tracking-param + fragment strip + trailing-slash + root-path preservation, unparseable-URL honest fallback, purity) — proven RED (module-not-found) then GREEN (7/7 pass)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Phase 6 deps + register all five test:news-* scripts** - `c5e8af3` (chore)
2. **Task 2 RED: failing dedup primitive tests** - `871babd` (test)
3. **Task 2 GREEN: implement news dedup primitives** - `176b14e` (feat)

**Plan metadata:** (this commit) - `docs(06-02): complete news-dedup-primitives plan`

**TDD task: RED (test) -> GREEN (feat); no REFACTOR commit needed, GREEN passed all 7 case groups on first implementation.**

## Files Created/Modified

- `package.json` - added `@google/genai`, `fast-xml-parser` deps + 5 `test:news-*` scripts
- `package-lock.json` - lockfile update for the two new deps (45 packages added)
- `scripts/news-dedupe-test.ts` - node:assert/strict proof of all three dedup primitives, 7 case groups
- `src/lib/news/dedupe.ts` - `normalizeTitle`, `computeTitleHash`, `canonicalizeUrl`
- `src/lib/news/types.ts` - `RawNewsItem`, `NewsSummaryResult`, `InstrumentMatch`

## Decisions Made

- Verified `@google/genai@2.12.0` and `fast-xml-parser@5.10.1` are the current live-published latest versions (`npm view <pkg> version`) before installing — matched the plan's cited pins exactly, no CVE concerns raised by `npm audit` for either new package.
- Apostrophe handling: implemented as a distinct zero-width removal step (not lumped into the generic non-alphanumeric-to-space replace) specifically so `"Steel's"` and `"Steels"` normalize to the same string, per the plan's must-haves truth #3 — a literal "any non-alphanumeric becomes a space" pass alone would have split `"Steel's"` into `"steel s"`, breaking that equivalence.

## Deviations from Plan

None - plan executed exactly as written. All must-haves truths and artifacts delivered as specified; no Rule 1-4 fixes were needed on this plan's own files.

## Issues Encountered

**Transient tsc errors from concurrent 06-03 in-flight files (out of scope, logged not fixed).** During the Task 2 `npx tsc --noEmit` verification, three errors surfaced in `scripts/news-match-test.ts` (`Cannot find module '../src/lib/news/match'` x2, one implicit-`any`). These belong to the concurrently-running 06-03 executor's own TDD RED state (its `src/lib/news/match.ts` GREEN target didn't exist yet at that moment) — same pattern as the 05-04/05-06 concurrent-executor transient. Confirmed isolated via `npx tsc --noEmit 2>&1 | grep -v "news-match"` producing zero output (this plan's own three files are tsc-clean), and logged to `.planning/phases/06-news-pipeline/deferred-items.md` per the scope-boundary rule rather than fixed. Also logged there: a pre-existing moderate `npm audit` finding (`postcss <8.5.10` via `next`'s bundled postcss) unrelated to either new dependency this plan installed — out of scope, would require a `next` major downgrade to silence.

**Git-index hygiene:** `scripts/rls-isolation-test.ts` was dirty (owned by concurrent 06-01) at the start of Task 1 and `src/lib/news/match.ts` appeared mid-Task-2 (owned by concurrent 06-03); both were explicitly excluded from every `git add` in this plan via pathspec-restricted staging. `git show HEAD --stat` was run after all three commits (`c5e8af3`, `871babd`, `176b14e`) and confirmed exactly the intended files landed in each — no cross-contamination.

## User Setup Required

None - no external service configuration required. `@google/genai` will need a `GEMINI_API_KEY` (or equivalent) when a later plan (06-06 summarizer) actually calls it; not needed for this plan's pure-function scope.

## Next Phase Readiness

- `src/lib/news/dedupe.ts` is ready for the ingest/dedupe-writer plan to import `computeTitleHash`/`canonicalizeUrl` directly against `news_items.title_hash` (06-01's column) and the pre-existing `url UNIQUE` constraint.
- `src/lib/news/types.ts`'s `RawNewsItem` is the normalized shape every fetch/parse plan (Finnhub, Google News RSS, Indian publisher RSS) should produce.
- `npm run test:news-dedupe` (7/7), `npx tsc --noEmit` (clean on this plan's own files — see Issues Encountered for the isolated concurrent-executor transient), and `npm run build` all pass.
- No blockers for downstream 06-0x plans; `test:news-match/parse/summarize/alert` scripts are pre-registered and will resolve once their respective plans land the target scripts.

---
*Phase: 06-news-pipeline*
*Completed: 2026-07-17*

## Self-Check: PASSED

- FOUND: src/lib/news/dedupe.ts
- FOUND: src/lib/news/types.ts
- FOUND: scripts/news-dedupe-test.ts
- FOUND: .planning/phases/06-news-pipeline/06-02-SUMMARY.md
- FOUND: .planning/phases/06-news-pipeline/deferred-items.md
- FOUND commit: c5e8af3
- FOUND commit: 871babd
- FOUND commit: 176b14e
