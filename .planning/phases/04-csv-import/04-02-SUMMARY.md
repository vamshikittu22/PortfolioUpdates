---
phase: 04-csv-import
plan: 02
subsystem: import
tags: [xlsx, sheetjs, papaparse, sha256, normalization, tdd, idempotency]

# Dependency graph
requires:
  - phase: 02-portfolio-core
    provides: "TransactionType/Exchange/Currency vocabulary (src/lib/types.ts) that ImportTxnType/CommitChoices narrow/reuse"
provides:
  - "src/lib/import/types.ts — the shared vocabulary (ImportBroker, RowStatus, ImportTxnType, NormalizedRow, ParsedRow, PreviewRow, ImportPreview, CommitChoices, ImportResult, ImportParseError) every later import file imports"
  - "parseMoney/parseQuantity/parseRobinhoodDate/parseGrowwDate — pure normalization, null-on-failure, never a fabricated 0"
  - "computeRowHashes — deterministic occurrence-indexed sha256 row identity, proven stable and drift-free"
  - "detectBroker — zip-magic / CSV-header-sniff broker detection"
  - "xlsx 0.20.3 (CDN tarball) + papaparse installed; test:import-primitives and test:import-parse npm scripts registered"
affects: [04-03-parsers, 04-04-matching-dedup, 04-05-commit-action, 04-06-import-ui, 04-07-live-verification]

# Tech tracking
tech-stack:
  added: ["xlsx@0.20.3 (SheetJS CDN tarball, not npm registry)", "papaparse ^5.5.4", "@types/papaparse ^5.5.2"]
  patterns:
    - "null-on-failure normalization discipline (never fabricate 0) — mirrors Phase 3's price-pnl pure-logic layer"
    - "sha256 row-hash over normalized STRINGS with 1-based occurrence index for idempotent re-import"
    - "byte-evidence-first broker detection (zip magic / header regex), filename never overrides"
    - "node:assert/strict + tsx test scripts, no jest/vitest — same pattern as price-pnl-test.ts/derive-holdings-test.ts"

key-files:
  created:
    - src/lib/import/types.ts
    - src/lib/import/normalize.ts
    - src/lib/import/row-hash.ts
    - src/lib/import/detect-broker.ts
    - scripts/import-primitives-test.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "xlsx pinned to SheetJS's official CDN tarball (0.20.3) rather than npm registry (frozen at 0.18.5 with open CVEs) — verified via node_modules/xlsx/package.json showing version 0.20.3 and package-lock.json containing zero references to 0.18.5"
  - "Both import npm scripts (test:import-primitives, test:import-parse) registered now even though import-parse-test.ts doesn't exist until 04-03, so that plan needs no package.json edit"
  - "Refactored parseMoney/parseQuantity to share a stripBrokerPunctuation() helper (plan's suggested REFACTOR step) — public signatures unchanged, purity re-verified by running the test twice with identical output"

patterns-established:
  - "Import primitives are pure (zero I/O) and unit-tested in isolation from any DB/network/file — 04-03's parsers, 04-04's matcher/dedup, and 04-05's commit action all build on this layer without re-deriving money/date/hash logic"

requirements-completed: [IMPT-01, IMPT-02, IMPT-05]

# Metrics
duration: 10min
completed: 2026-07-15
---

# Phase 4 Plan 2: Import Parsing Primitives Summary

**Pure, dependency-free normalization/hashing/detection layer for CSV import — parseMoney/parseQuantity/parseRobinhoodDate/parseGrowwDate never fabricate a 0 or a guessed date, computeRowHashes is a stable occurrence-indexed sha256 for idempotent re-import, and detectBroker distinguishes Groww XLSX from Robinhood CSV by byte evidence alone.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-07-15T23:03:00Z (approx, first commit 18:03:39 local)
- **Completed:** 2026-07-15T23:09:07Z (last commit 18:09:07 local)
- **Tasks:** 1 TDD feature, executed as 4 sub-steps (Setup, RED, GREEN, REFACTOR)
- **Files modified:** 6 (4 new src/lib/import/* files, 1 new test script, package.json + package-lock.json)

## Accomplishments
- Installed SheetJS 0.20.3 from the official CDN tarball (not the CVE-carrying npm-registry 0.18.5) plus papaparse, and registered both `test:import-primitives` and `test:import-parse` npm scripts up front so the 04-03 parser plan needs no `package.json` edit
- Defined the full shared type vocabulary (`ImportBroker`, `RowStatus`, `ImportTxnType`, `NormalizedRow`, `ParsedRow`, `PreviewRow`, `ImportPreview`, `CommitChoices`, `ImportResult`, `ImportParseError`) that every later import file will import from
- Implemented and TDD-proved four pure primitives: money/quantity normalization (never a fabricated 0), both brokers' date formats normalizing to ISO, a stable occurrence-indexed row hash, and byte-evidence broker detection
- `npm run test:import-primitives` passes all 6 case groups; re-running twice produces byte-identical output, proving `computeRowHashes` purity

## Task Commits

This TDD feature was executed as 4 atomic commits (Setup -> RED -> GREEN -> REFACTOR):

1. **Setup: install parsing deps + register npm scripts** - `10734e7` (chore)
2. **RED: failing tests against stub normalize/row-hash/detect-broker** - `06a2749` (test)
3. **GREEN: real implementations, all 6 case groups pass** - `909e8f3` (feat)
4. **REFACTOR: shared stripBrokerPunctuation() helper** - `1f8c55a` (refactor)

**Plan metadata:** (this commit) `docs(04-02): complete import parsing primitives plan`

## Files Created/Modified
- `src/lib/import/types.ts` - shared vocabulary (no runtime logic): ImportBroker, RowStatus, ImportTxnType, NormalizedRow, ParsedRow, PreviewRow, ImportPreview, CommitChoices, ImportResult, ImportParseError
- `src/lib/import/normalize.ts` - parseMoney, parseQuantity, parseRobinhoodDate, parseGrowwDate — all null-on-failure, sharing a private `stripBrokerPunctuation()` helper after refactor
- `src/lib/import/row-hash.ts` - computeRowHashes: sha256 over `[broker, isin??symbol, txnType, quantityStr, priceStr??'', dateISO].join('|')` plus 1-based occurrence index
- `src/lib/import/detect-broker.ts` - detectBroker: zip magic (`PK`) -> groww, `/Trans Code/i` + `/Activity Date/i` header sniff -> robinhood, else unknown
- `scripts/import-primitives-test.ts` - 6 case groups (money, quantity, Robinhood dates, Groww dates, row-hash stability/occurrence-index/drift-freedom, broker detection), node:assert/strict style matching `price-pnl-test.ts`
- `package.json` / `package-lock.json` - xlsx pinned to CDN tarball URL, papaparse + @types/papaparse added, two import test scripts registered

## Decisions Made
- xlsx installed exclusively from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` per 04-RESEARCH Pitfall 2 — confirmed `node_modules/xlsx/package.json` reports version `0.20.3` and `package-lock.json` contains zero occurrences of `0.18.5`
- Both npm test scripts registered in this plan (not deferred to 04-03) to keep `package.json` out of that plan's file set, per the plan's stated purpose
- Applied the plan's suggested REFACTOR: extracted `stripBrokerPunctuation()` shared by `parseMoney`/`parseQuantity`; public signatures unchanged, verified by running the test suite twice with identical PASS output

## Deviations from Plan

None - plan executed exactly as written. All six case groups, the setup step, and the REFACTOR step matched the plan's `<implementation>` section without needing any Rule 1-4 deviation.

## Issues Encountered

The sandbox's auto-mode permission classifier flagged a follow-up `npm ls xlsx papaparse` verification command (issued purely to *inspect* already-installed packages) as if it were another external-tarball install attempt, and denied it. Worked around by reading `node_modules/xlsx/package.json` directly (confirms version `0.20.3`) and listing `node_modules/papaparse` / `node_modules/@types/papaparse` instead — same verification, no functional impact. The actual `npm install` calls (which the classifier did not block) had already completed successfully before this.

## User Setup Required

None - no external service configuration required. This plan has zero DB/network dependency by design (`npm run test:import-primitives` proves everything statically).

## Next Phase Readiness

- 04-03 (Groww XLSX / Robinhood CSV parsers) can now import `parseMoney`, `parseQuantity`, `parseRobinhoodDate`, `parseGrowwDate`, `computeRowHashes`, `detectBroker`, and every type from `src/lib/import/types.ts` without touching `package.json` again (both npm scripts already registered).
- No blockers. `npx tsc --noEmit` is clean across the whole repo (this plan's files plus the pre-existing unrelated working-tree changes noted below did not introduce any type errors).
- Note for the next executor: the working tree at the start of this plan already had unrelated uncommitted changes (`src/components/dashboard/HoldingFormDialog.tsx`, `HoldingsTable.tsx`, `src/lib/supabase/portfolio.ts`, `src/lib/types.ts`, `src/server-actions/portfolio.ts`, `.planning/REQUIREMENTS.md`, new `LotEditDialog.tsx`) plus a new `.planning/phases/04-csv-import/04-01-SUMMARY.md` from the parallel 04-01 executor. None of these were touched by this plan's commits.

---
*Phase: 04-csv-import*
*Completed: 2026-07-15*

## Self-Check: PASSED

All 8 claimed files found on disk (src/lib/import/{types,normalize,row-hash,detect-broker}.ts, scripts/import-primitives-test.ts, package.json, package-lock.json, this SUMMARY.md). All 4 claimed commit hashes (10734e7, 06a2749, 909e8f3, 1f8c55a) found in git log.
