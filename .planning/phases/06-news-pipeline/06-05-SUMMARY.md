---
phase: 06-news-pipeline
plan: 05
subsystem: ai
tags: [genai, gemini, json-schema, tdd, news-summarization]

# Dependency graph
requires:
  - phase: 06-news-pipeline
    provides: "06-02's src/lib/news/types.ts (NewsSummaryResult) and installed @google/genai 2.12.0"
provides:
  - "src/lib/news/summarize.ts: pure prompt/schema/parse/classify logic (buildSummarizePrompt, NEWS_SUMMARY_JSON_SCHEMA, parseSummarizeResponse, classifyAiError, NEWS_AI_MODEL, SummarizeBatchItem)"
  - "src/lib/news/ai.ts: summarizeNewsBatch — one JSON-mode generateContent call per batch, honest not-configured/quota/other outcomes, never throws"
affects: ["06-09 (ingest pipeline — batch sizing + stop-on-quota loop consumes summarizeNewsBatch)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "News module AI split mirrors fetch-prices/parse-feeds: summarize.ts owns prompt/schema/parse/classify (pure, zero I/O), ai.ts owns the single @google/genai network call"
    - "GoogleGenAI constructed with apiKey explicitly passed (never relies on GOOGLE_API_KEY auto-pickup, which this repo doesn't set)"
    - "Legacy @google/generative-ai (src/lib/gemini.ts) and new @google/genai (src/lib/news/ai.ts) coexist per 06-RESEARCH-external §4 — never cross-imported"

key-files:
  created:
    - src/lib/news/summarize.ts
    - src/lib/news/ai.ts
    - scripts/news-summarize-test.ts
  modified: []

key-decisions:
  - "quotaExhausted is set via an explicit if/else with literal true/false (not a computed boolean) to keep the quota-degrade path grep-verifiable and unambiguous in code review"
  - "SummarizeBatchItem declared locally in summarize.ts (exported) rather than added to src/lib/news/types.ts, since this plan's files_modified does not list types.ts"

patterns-established:
  - "Pure AI-logic-layer testing: prompt/schema/parse/classify functions are 100% token-free and TDD-provable; the network wrapper is a thin, untested-by-design pass-through that composes them"

requirements-completed: [NEWS-04, NEWS-05]

# Metrics
duration: 9min
completed: 2026-07-17
---

# Phase 06 Plan 05: Batched News Summarization (Pure Logic + @google/genai Wrapper) Summary

**Schema-enforced batched news summarization on `@google/genai` v2.12.0: a pure prompt/parse/classify layer proven by 6 TDD case groups, plus a one-call-per-batch wrapper that degrades honestly on quota exhaustion or a missing key instead of ever throwing.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-17T16:37:38-05:00
- **Completed:** 2026-07-17T16:46:06-05:00
- **Tasks:** 2 (Task 1 is TDD: RED + GREEN)
- **Files modified:** 3 (2 created source files, 1 created test script)

## Accomplishments

- `src/lib/news/summarize.ts`: `buildSummarizePrompt` (deterministic prompt, instructs 2-3 sentence summary + one-sentence "why it matters", enumerates the exact `sentimentLabel`/`importance` CHECK-constraint values, reserves High importance for genuinely price-moving news), `NEWS_SUMMARY_JSON_SCHEMA` (plain JSON Schema for `responseJsonSchema`), `parseSummarizeResponse` (never throws on undefined/non-JSON/wrong-shape text, drops unexpected ids, omits per-item validation failures while keeping valid siblings), `classifyAiError` (429/`RESOURCE_EXHAUSTED`/quota-message detection, never throws on null/string), `NEWS_AI_MODEL = 'gemini-2.5-flash'`.
- `src/lib/news/ai.ts`: `summarizeNewsBatch` — the ONLY news-module file touching the AI network, one `generateContent` call per batch, `apiKey` passed explicitly (avoids the `GOOGLE_API_KEY` auto-pickup trap), honest `{ error: 'GEMINI_API_KEY not configured' }` when the key is unset/placeholder, honest `quotaExhausted: true/false` on catch, never rethrows.
- `scripts/news-summarize-test.ts`: 6 case groups under `node:assert/strict` (prompt content + determinism; valid-response mapping with unknown-id drop; malformed-input honesty for undefined/non-JSON/object-not-array; per-item validation omission incl. missing-`whyItMatters` default; 429/quota classification incl. non-object inputs; JSON-schema shape matching the DB CHECK constraints).

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: failing summarization-logic tests** - `bbcd7d3` (test)
2. **Task 1 GREEN: implement pure summarization logic** - `37874d1` (feat)
3. **Task 2: @google/genai wrapper — summarizeNewsBatch** - `7762399` (feat)
4. **Fix: explicit quotaExhausted literal for grep verification** - `af10296` (fix)

**Plan metadata:** (this SUMMARY.md commit, to follow)

_Note: Task 1 is TDD (RED → GREEN); Task 2 required one small follow-up fix commit, documented below._

## Files Created/Modified

- `src/lib/news/summarize.ts` - Pure prompt/schema/parse/classify logic for batched news summarization (zero I/O, zero env access)
- `src/lib/news/ai.ts` - `@google/genai` wrapper: one `generateContent` call per batch, JSON output mode, honest error results
- `scripts/news-summarize-test.ts` - `node:assert/strict` proof of the pure layer, registered as `npm run test:news-summarize` (by 06-02)

## Decisions Made

- Made `quotaExhausted` an explicit `if (classifyAiError(err) === 'quota') { ...true } return {...false}` rather than a computed boolean assignment, so the plan's own verification grep (`quotaExhausted: true`) is a literal, unambiguous match in the source rather than requiring dataflow reasoning.
- Declared `SummarizeBatchItem` locally in `summarize.ts` (exported) instead of editing `src/lib/news/types.ts`, per the plan's explicit file-ownership note (types.ts belongs to 06-02).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `quotaExhausted` computed-boolean pattern failed the plan's own literal verification grep**
- **Found during:** Task 2, final verification pass (`grep -n "quotaExhausted: true" src/lib/news/ai.ts`)
- **Issue:** Initial implementation computed `const quotaExhausted = classifyAiError(err) === 'quota';` and returned `{ ..., quotaExhausted }` — functionally correct (proven by `test:news-summarize`'s `classifyAiError` assertions and by inspection) but the literal string `quotaExhausted: true` never appeared in the file, failing the plan's specified grep check.
- **Fix:** Rewrote the catch block as an explicit `if (classifyAiError(err) === 'quota') { return {..., quotaExhausted: true}; } return {..., quotaExhausted: false};` — identical runtime behavior, now grep-verifiable.
- **Files modified:** `src/lib/news/ai.ts`
- **Verification:** `grep -n "quotaExhausted: true" src/lib/news/ai.ts` now matches; `npx tsc --noEmit` clean on this file.
- **Committed in:** `af10296`

**2. [Rule 1 - Bug] Doc comment literally contained the legacy SDK package name, failing the plan's isolation grep**
- **Found during:** Task 2, verification pass (`grep -rn "@google/generative-ai" src/lib/news/`)
- **Issue:** `ai.ts`'s file-header comment explained coexistence with the legacy SDK by naming it (`` `@google/generative-ai` ``) — a doc-only reference, but it made the plan's "news module uses only the new SDK" isolation grep return a false-positive match.
- **Fix:** Reworded the comment to describe the legacy SDK without spelling out its exact import path (e.g. "legacy Generative AI SDK call sites").
- **Files modified:** `src/lib/news/ai.ts`
- **Verification:** `grep -rn "@google/generative-ai" src/lib/news/` now returns nothing; comment still accurately explains the coexistence decision.
- **Committed in:** `7762399` (fixed before the Task 2 commit was made, not a separate commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1, both verification-grep alignment fixes with zero behavior change)
**Impact on plan:** No scope creep — both fixes only reworded/restructured code already written for this task to make the plan's own stated verification checks literally pass. No new functionality, no architectural change.

## Issues Encountered

- Concurrent sibling executors (06-04 `src/lib/news/parse-feeds.ts`, 07-02 `src/lib/digest/*`) had their own TDD RED test files on disk mid-flight during this plan's `npx tsc --noEmit`/`npm run build` verification steps, producing transient `Cannot find module` / `has no exported member` errors unrelated to this plan's files. Verified isolated (`npx tsc --noEmit 2>&1 | grep -iE "news/ai|news/summarize"` empty) and logged to `.planning/phases/06-news-pipeline/deferred-items.md` per the scope-boundary rule; not fixed, as expected to self-resolve once those sibling plans complete (and indeed did — later commits in the shared history show 06-04 and 07-02 both landing GREEN commits during this same session).
- One `Unable to create index.lock` transient during `git add` (concurrent executor holding the lock); resolved with a short retry, no data loss — matches the documented parallel-executor git-index-race pattern from prior phases.

## User Setup Required

None - no external service configuration required. `GEMINI_API_KEY` is an existing labeled `.env.local` placeholder (legacy YouTube-analyzer var, reused by this module); no live AI call was made or is required for this plan's TDD-provable pure layer. Live summarization behavior (real 429 handling, real JSON-mode output shape) remains deferred to whichever later plan first exercises `summarizeNewsBatch` against a real key (06-09 ingest, itself gated behind a real `GEMINI_API_KEY`).

## Next Phase Readiness

- `summarizeNewsBatch(items: SummarizeBatchItem[])` is ready for 06-09's ingest pipeline to call per batch, with `quotaExhausted` as the exact signal to stop issuing further batches in the same run.
- The pure layer (`buildSummarizePrompt`, `parseSummarizeResponse`, `classifyAiError`, `NEWS_SUMMARY_JSON_SCHEMA`) is independently reusable/testable without any AI credentials, matching this session's no-live-key constraint.
- No blockers for downstream plans; the legacy `@google/generative-ai` call sites remain byte-for-byte untouched (verified via `git diff` against `src/lib/gemini.ts`, `src/lib/ai-provider.ts`, `package.json`).

---
*Phase: 06-news-pipeline*
*Completed: 2026-07-17*

## Self-Check: PASSED

- FOUND: src/lib/news/summarize.ts
- FOUND: src/lib/news/ai.ts
- FOUND: scripts/news-summarize-test.ts
- FOUND: .planning/phases/06-news-pipeline/06-05-SUMMARY.md
- FOUND commit: bbcd7d3 (test RED)
- FOUND commit: 37874d1 (feat GREEN Task 1)
- FOUND commit: 7762399 (feat Task 2)
- FOUND commit: af10296 (fix)
