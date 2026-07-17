# Phase 6 — Deferred Items

Items observed during execution that are out of scope for the plan that observed them (pre-existing, or owned by a concurrently-running sibling plan) — logged, not fixed, per the executor scope-boundary rule.

## 06-02: transient tsc errors from concurrent 06-03 in-flight files (self-resolving)

- **Observed during:** 06-02 Task 2, `npx tsc --noEmit` verification step.
- **Errors:** `scripts/news-match-test.ts(18,56)`, `(19,37)`: `Cannot find module '../src/lib/news/match'`; `(32,24)`: implicit `any` on parameter `r`.
- **Cause:** The concurrently-running 06-03 executor's TDD RED commit for `scripts/news-match-test.ts` was on disk (staged/committed as RED) while its GREEN target `src/lib/news/match.ts` did not yet exist — normal mid-flight TDD state, not a 06-02 defect. Same pattern as the 05-04/05-06 concurrent-executor transient documented in `.planning/phases/05-alerts-telegram/deferred-items.md`.
- **Action:** None — out of scope for 06-02 (disjoint files per plan assignment: 06-02 owns `src/lib/news/{types,dedupe}.ts` + `scripts/news-dedupe-test.ts`; 06-03 owns `src/lib/news/match.ts` + `scripts/news-match-test.ts`). Expected to resolve once 06-03 completes its own GREEN commit.
- **Verified isolated:** `npx tsc --noEmit 2>&1 | grep -v "news-match"` produced zero output — confirms 06-02's own files (`src/lib/news/types.ts`, `src/lib/news/dedupe.ts`, `scripts/news-dedupe-test.ts`) are tsc-clean.

## 06-02: pre-existing moderate npm audit finding (unrelated to new deps)

- **Observed during:** 06-02 Task 1, post-`npm install` audit check.
- **Finding:** `postcss <8.5.10` moderate XSS advisory (GHSA-qx2v-qp2m-jg93), transitively pulled in by `next`'s bundled `postcss`, not by either new dependency (`@google/genai`, `fast-xml-parser`). Fix requires `next@9.3.3` (a major downgrade) via `npm audit fix --force` — out of scope and would be a regression.
- **Action:** None — pre-existing, unrelated to this plan's changes, not caused by `@google/genai`/`fast-xml-parser`.
