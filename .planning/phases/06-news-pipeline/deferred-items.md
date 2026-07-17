# Phase 6 — Deferred Items

Items observed during execution that are out of scope for the plan that observed them (pre-existing, or owned by a concurrently-running sibling plan) — logged, not fixed, per the executor scope-boundary rule.

## 06-02: transient tsc errors from concurrent 06-03 in-flight files (self-resolving)

- **Observed during:** 06-02 Task 2, `npx tsc --noEmit` verification step.
- **Errors:** `scripts/news-match-test.ts(18,56)`, `(19,37)`: `Cannot find module '../src/lib/news/match'`; `(32,24)`: implicit `any` on parameter `r`.
- **Cause:** The concurrently-running 06-03 executor's TDD RED commit for `scripts/news-match-test.ts` was on disk (staged/committed as RED) while its GREEN target `src/lib/news/match.ts` did not yet exist — normal mid-flight TDD state, not a 06-02 defect. Same pattern as the 05-04/05-06 concurrent-executor transient documented in `.planning/phases/05-alerts-telegram/deferred-items.md`.
- **Action:** None — out of scope for 06-02 (disjoint files per plan assignment: 06-02 owns `src/lib/news/{types,dedupe}.ts` + `scripts/news-dedupe-test.ts`; 06-03 owns `src/lib/news/match.ts` + `scripts/news-match-test.ts`). Expected to resolve once 06-03 completes its own GREEN commit.
- **Verified isolated:** `npx tsc --noEmit 2>&1 | grep -v "news-match"` produced zero output — confirms 06-02's own files (`src/lib/news/types.ts`, `src/lib/news/dedupe.ts`, `scripts/news-dedupe-test.ts`) are tsc-clean.

## 06-05: transient tsc errors from concurrent 06-04/07-02 in-flight files (self-resolving)

- **Observed during:** 06-05 Task 1, `npx tsc --noEmit` verification step.
- **Errors:** `scripts/digest-compose-test.ts(20,69)`/`(21,41)`: `Cannot find module '../src/lib/digest/compose'` / `'../src/lib/digest/types'`, plus 5 implicit-`any` parameter errors in the same file; `scripts/news-parse-test.ts(22,68)`: `Cannot find module '../src/lib/news/parse-feeds'`.
- **Cause:** Concurrently-running 07-02 (`src/lib/digest/*`) and 06-04 (`src/lib/news/parse-feeds.ts`) executors had their own TDD RED test files on disk while their GREEN targets did not yet exist — normal mid-flight TDD state, not a 06-05 defect. Same pattern as the 06-02/06-03 precedent above.
- **Action:** None — out of scope for 06-05 (disjoint files: 06-05 owns `src/lib/news/{summarize,ai}.ts` + `scripts/news-summarize-test.ts`). Expected to resolve once 06-04/07-02 complete their own GREEN commits.
- **Verified isolated:** no error referenced `src/lib/news/summarize.ts` or `scripts/news-summarize-test.ts`; `npm run test:news-summarize` passed green independently.

## 06-06: transient `npm run build` type-check failure from concurrent 07-02 in-flight file (self-resolving)

- **Observed during:** 06-06 Task 2, `npm run build` verification step.
- **Errors:** `scripts/digest-compose-test.ts(20,69)`: `Cannot find module '../src/lib/digest/compose'`, then after a ~60s re-run: `scripts/digest-compose-test.ts(24,3)`: `Module '"../src/lib/digest/compose"' has no exported member 'buildDailyDigestMessage'`.
- **Cause:** The concurrently-running 07-02 executor committed its TDD RED phase for the digest message builder (`39e56b6 test(07-02): add failing digest message builder tests (RED)`) — `scripts/digest-compose-test.ts` references `buildDailyDigestMessage`, which does not exist in `src/lib/digest/compose.ts` until 07-02's own GREEN commit lands. Normal mid-flight TDD state, not a 06-06 defect. Same pattern as the 06-02/06-03 and 06-05 precedents above.
- **Action:** None — out of scope for 06-06 (disjoint files: 06-06 owns only `src/lib/news/read.ts` + `src/app/(dashboard)/news/page.tsx`, neither referenced by the failing test file). Re-ran `npm run build` once after a ~60s wait per the plan's environment notes; the failure persisted but moved forward (module found, then missing export), confirming it is 07-02's own in-flight TDD progression, not a static/stuck error.
- **Verified isolated:** `npx tsc --noEmit 2>&1 | grep -iE "news/read|news/page|\(dashboard\)/news"` produced zero output — confirms 06-06's own files are tsc-clean. `git log --oneline` confirms `39e56b6` (07-02 RED) is the newest commit on the digest module at the time of this build run.

## 06-07: transient tsc/build error from concurrent 07-02 in-flight file (self-resolving)

- **Observed during:** 06-07 Task 2, `npx tsc --noEmit` and `npm run build` verification steps.
- **Errors:** `scripts/digest-compose-test.ts(24,3)`: `Module '"../src/lib/digest/compose"' has no exported member 'buildDailyDigestMessage'` (surfaced identically in both `tsc` and the Next build's own type-check pass).
- **Cause:** The concurrently-running 07-02 executor's `scripts/digest-compose-test.ts` (TDD RED) imports `buildDailyDigestMessage` from `src/lib/digest/compose.ts`, which at the moment of this check had not yet exported that member (mid-flight TDD state) — not a 06-07 defect. Same pattern as the 06-05 entry above (07-02 was still in-flight on this same file).
- **Action:** None — out of scope for 06-07 (disjoint files: this plan owns only `src/lib/news/{build-news-message,alert-sweep}.ts` + `scripts/news-alert-test.ts`). Expected to resolve once 07-02 completes its GREEN commit.
- **Verified isolated:** no error referenced `src/lib/news/build-news-message.ts`, `src/lib/news/alert-sweep.ts`, or `scripts/news-alert-test.ts`; `npm run test:news-alert` passed green independently; the plan's specific greps (`sendTelegramMessage` absent, `createAdminClient` absent, `deriveHoldings` present, `kind: 'news_alert'` present) all passed against `src/lib/news/alert-sweep.ts`; the Next build itself reached "Compiled successfully" before failing only on the unrelated sibling type-check.

## 06-02: pre-existing moderate npm audit finding (unrelated to new deps)

- **Observed during:** 06-02 Task 1, post-`npm install` audit check.
- **Finding:** `postcss <8.5.10` moderate XSS advisory (GHSA-qx2v-qp2m-jg93), transitively pulled in by `next`'s bundled `postcss`, not by either new dependency (`@google/genai`, `fast-xml-parser`). Fix requires `next@9.3.3` (a major downgrade) via `npm audit fix --force` — out of scope and would be a regression.
- **Action:** None — pre-existing, unrelated to this plan's changes, not caused by `@google/genai`/`fast-xml-parser`.
