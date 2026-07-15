---
phase: 04-csv-import
plan: 03
subsystem: import
tags: [xlsx, sheetjs, papaparse, csv-parsing, instrument-matching, deduplication, tdd]

# Dependency graph
requires:
  - phase: 04-csv-import (plan 01)
    provides: import_batches/symbol_mappings schema, transactions provenance columns, find_or_create_instrument RPC
  - phase: 04-csv-import (plan 02)
    provides: money/quantity/date normalization, computeRowHashes, detectBroker, xlsx (SheetJS 0.20.3) + papaparse installed
provides:
  - "parseGroww(bytes): XLSX header-scan parser producing one synthetic opening-BUY ParsedRow per equity holding, cost-basis-preserving"
  - "parseRobinhood(text): CSV header-name-driven parser mapping Trans Codes to BUY/SELL/SPLIT, unsupported codes reported not dropped"
  - "matchInstruments(rows, instruments, savedMappings): saved-mapping short-circuit + ISIN (Groww, NSE>BSE) / ticker+US-exchange (Robinhood) matching with broker-implied auto-pick"
  - "detectDuplicates(rows, existingHashes, existingManualTxns, alreadyHeldInstrumentIds): hash match, manual field-match, and Groww already-held rules"
  - "scripts/import-parse-test.ts + npm run test:import-parse: 7 case groups proving the whole pure pipeline against synthetic fixtures, zero DB/network"
affects: [04-04 (previewImport/commitImport Server Actions consume these four pure functions directly), 04-05/04-06 (preview UI renders RowStatus categories these functions produce), 04-07 (real-file validation checkpoint)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Header-scan parsing (never positional): scan first ~30 rows for a cell matching /^isin$/i AND a cell matching /quant/i, build a name->index map from that row, read every downstream cell by name"
    - "Snapshot-to-synthetic-BUY modeling: a point-in-time holdings snapshot becomes exactly one BUY per instrument at the stated average price/quantity, never invented per-lot history; cost basis is preserved through deriveHoldings by construction (single BUY -> avgCost == price)"
    - "RowStatus state machine ('valid'|'invalid'|'duplicate'|'unmatched'|'unsupported') threaded through parse -> match -> dedupe; each stage only transitions rows it owns and leaves rows already invalid/unsupported/unmatched untouched"
    - "Pure fixture-tested pipeline stages (zero I/O) proven by node:assert/strict scripts, same style as derive-holdings-test.ts / price-pnl-test.ts / import-primitives-test.ts"

key-files:
  created:
    - src/lib/import/parse-groww.ts
    - src/lib/import/parse-robinhood.ts
    - src/lib/import/match-instruments.ts
    - src/lib/import/detect-duplicates.ts
    - scripts/import-parse-test.ts
    - scripts/fixtures/groww-holdings-sample.xlsx
    - scripts/fixtures/robinhood-activity-sample.csv
  modified: []

key-decisions:
  - "Statement-date extraction scans the title block (rows above the header) for a date-like substring via regex, then normalizes it through parseGrowwDate -- rather than requiring the whole title cell to be only a date -- so a real-world 'Statement as on 10 Jul 2026' style cell still resolves; falls back to today with a visible statusReason when nothing is found"
  - "matchInstruments auto-pick preference is NSE>BSE for Groww and NASDAQ>NYSE>OTHER for Robinhood, both shown via statusReason as overridable -- matches the locked broker-disambiguation decision in 04-RESEARCH/CONTEXT"
  - "detectDuplicates only hashes/dedupes rows with a complete normalized shape (txnType/quantityStr/dateISO all non-null) and status outside {unmatched, unsupported, invalid} -- matches the plan's 'leave those rows unchanged' instruction while still giving computeRowHashes a correctly-ordered batch for occurrence-index purposes"
  - "IMPT-03 intentionally left Pending in REQUIREMENTS.md despite being in this plan's requirements frontmatter -- this plan builds the validation/dedup/status logic IMPT-03 depends on, but the actual preview flow (Server Action + UI showing per-row status with skip/override) doesn't exist until 04-04 through 04-06. Marking it Complete now would be dishonest; IMPT-01/IMPT-02/IMPT-04/IMPT-05 (already Complete from 04-01/04-02) are re-confirmed idempotently"

patterns-established:
  - "Pattern: any future broker/file-format parser plan should follow the same three-stage split -- pure parser (bytes/text -> ParsedRow[]) -> pure matcher (rows + reference data -> rows) -> pure dedupe (rows + existing state -> rows) -- so each stage stays independently fixture-testable without a DB"

requirements-completed: [IMPT-01, IMPT-02, IMPT-04, IMPT-05]

# Metrics
duration: 20min
completed: 2026-07-15
---

# Phase 4 Plan 3: Broker Parsers + Instrument Matching + Duplicate Detection Summary

**Pure import pipeline (Groww XLSX header-scan parser, Robinhood CSV Trans-Code parser, ISIN/ticker instrument matching, hash+field+Groww-snapshot duplicate detection) proven by 7 fixture-tested case groups with zero DB/network dependency**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-15T23:31:00Z
- **Tasks:** 1 TDD task (3 sub-commits: chore/RED/GREEN; no REFACTOR needed)
- **Files modified:** 7 (all created)

## Accomplishments
- `parseGroww` scans for the header row by column name (never a fixed offset), models each equity holding as exactly one synthetic opening BUY, and throws a loud `ImportParseError` echoing the first rows when no recognizable header exists
- `parseRobinhood` is fully header-name-driven (proven identical across a 9-column and an 11-column fixture), maps `Buy`/`Sell`/`SPL` to the ledger's txn types, and routes every other Trans Code to `status: 'unsupported'` with a human-readable reason -- nothing silently dropped
- `matchInstruments` implements the locked broker-disambiguation decision: Groww ISIN matches auto-pick NSE over BSE, Robinhood ticker matches are filtered to US exchanges + USD currency before auto-picking, and a saved mapping short-circuits both paths
- `detectDuplicates` implements all three duplicate rules from 04-RESEARCH Pattern 4 in priority order (row hash vs already-imported, field-match vs manual transactions, Groww "instrument already held" snapshot rule) while leaving unmatched/unsupported/invalid rows untouched
- `deriveHoldings` fed with `parseGroww`'s synthetic BUYs reproduces the source sheet's average price exactly, proving cost-basis preservation (the entire point of snapshot-to-synthetic-BUY modeling) is not just claimed but tested

## Task Commits

TDD cycle, 3 commits (no REFACTOR commit -- re-running the test twice produced identical output with no code changes needed):

1. **Setup: synthetic fixtures** - `f7cb477` (chore)
2. **RED: failing test + stub modules** - `8286d06` (test)
3. **GREEN: real parser/matcher/dedup implementations** - `b20f619` (feat)

**Plan metadata:** _(this commit, made after this summary)_

## Files Created/Modified
- `src/lib/import/parse-groww.ts` - XLSX header-scan parser; synthetic-BUY snapshot modeling; statement-date extraction with fallback; MF-row (INF-prefix) handling; loud `ImportParseError`
- `src/lib/import/parse-robinhood.ts` - PapaParse `header: true` CSV parser; Trans Code -> `ImportTxnType` mapping; unsupported-code reporting; date-unparseable rows skipped (footer/disclaimer)
- `src/lib/import/match-instruments.ts` - saved-mapping short-circuit + broker-specific ISIN/ticker matching with auto-pick
- `src/lib/import/detect-duplicates.ts` - hash/field/Groww-already-held duplicate rules
- `scripts/import-parse-test.ts` - 7 case groups (node:assert/strict, no jest/vitest) proving the whole pipeline
- `scripts/fixtures/groww-holdings-sample.xlsx` - synthetic title block + header row + 2 equity rows (one ISIN dual-listed NSE/BSE in the test instrument universe) + 1 mutual-fund row + totals footer
- `scripts/fixtures/robinhood-activity-sample.csv` - synthetic 9-column CSV with Buy/Sell/SPL/CDIV/DFEE rows, a fractional-share quantity, a parenthesized negative amount, and a trailing disclaimer footer line

## Decisions Made
See `key-decisions` in frontmatter above (statement-date extraction approach, auto-pick exchange preference order, dedupe eligibility filter, and the deliberate IMPT-03-stays-Pending call).

## Deviations from Plan

None — plan executed as written. The plan's optional REFACTOR step ("extract a shared header-normalizer helper if parse-groww grows unwieldy") was evaluated and skipped: at ~180 lines with its own four small local helpers, `parse-groww.ts` was judged not unwieldy enough to warrant extraction, and re-running the test twice already confirmed byte-identical output with the code as GREEN-committed.

## Issues Encountered

None. The one-off XLSX fixture generator script (`scripts/fixtures/_gen-groww.ts`) had to be created and run from *inside* the project directory rather than the scratchpad -- Node module resolution for the `xlsx` package failed when the generator lived outside `node_modules`'s ancestor tree. The generator was deleted immediately after producing `groww-holdings-sample.xlsx`; only the binary fixture is committed, matching the plan's `files_modified` list exactly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `src/lib/import/{parse-groww,parse-robinhood,match-instruments,detect-duplicates}.ts` are code-complete, statically verified (`npx tsc --noEmit` clean), and proven against synthetic fixtures (`npm run test:import-parse`, 7/7 case groups, re-run twice for identical output) -- ready for 04-04's `previewImport`/`commitImport` Server Actions to import directly with zero parsing logic of their own, exactly as 04-RESEARCH's architecture prescribes.
- Real-file validation against the user's actual Groww XLSX and Robinhood CSV exports remains explicitly DEFERRED to 04-07 (04-RESEARCH Open Question 1) -- the synthetic fixtures prove the logic; only exact real-world layout confidence is outstanding. If the user's real Groww export uses header text this parser's fuzzy matchers don't recognize, `ImportParseError`'s "First rows seen" output is designed to make that immediately diagnosable.
- IMPT-03 (preview UI with skip/override) is intentionally still Pending in REQUIREMENTS.md -- this plan supplies the RowStatus/validation/dedup machinery it needs, but the user-facing preview itself is 04-04 through 04-06's scope.
- No blockers for 04-04.

---
*Phase: 04-csv-import*
*Completed: 2026-07-15*

## Self-Check: PASSED

All 7 created files verified present on disk; all 3 task commits (`f7cb477`, `8286d06`, `b20f619`) verified present in git history.
